// controllers/cartController.js
const axios = require('axios');
const Cart = require('../models/cartModel');
const { Products } = require('../models/productsModel');
const Payment = require('../models/paymentModel');
const Order = require('../models/orderModel');
const { OAuth2Client } = require("google-auth-library");
const mongoose = require('mongoose');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Add to Cart
const addToCart = async (req, res) => {
  const userId = req.user?._id;
  const formData = req.body;
  const { id, quantity = 1, productType, name, name_ar, price, image, category, category_ar } = formData;

  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    // Basic validation (only required fields)
    if (!id || quantity == null) {
      return res.status(400).json({ message: 'Missing required fields: id or quantity' });
    }

    // Find product (ensure it exists)
    const product = await Products.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Compare by stored product reference (item.id) — support ObjectId comparisons
    const productObjectId = mongoose.Types.ObjectId(id);
    const existingItem = cart.items.find(item => {
      const prodRef = item.id || item.productId || item._id;
      try {
        return prodRef && prodRef.equals && prodRef.equals(productObjectId);
      } catch (err) {
        // fallback to string comparison
        return prodRef && String(prodRef) === String(id);
      }
    });

    if (existingItem) {
      existingItem.quantity = Number(existingItem.quantity || 0) + Number(quantity || 1);
      // Ensure price exists (fallback to product.price)
      existingItem.price = Number(existingItem.price ?? product.price ?? 0);
      existingItem.totalPrice = Number(existingItem.price) * Number(existingItem.quantity);
    } else {
      // Push a new item — keep product reference in `id` to match your schema
      cart.items.push({
        id: product._id,
        productType: product.productType || productType,
        name: product.name || name,
        name_ar: product.name_ar || name_ar,
        category: product.category || category,
        category_ar: product.category_ar || category_ar,
        quantity: Number(quantity || 1),
        image: product.image || image || {},
        price: Number(product.price ?? price ?? 0),
        totalPrice: Number(product.price ?? price ?? 0) * Number(quantity || 1),
      });
    }

    // Recalculate totalAmount (if your schema stores it)
    cart.totalAmount = (cart.items || []).reduce((sum, it) => {
      const p = Number(it.price || 0);
      const q = Number(it.quantity || 0);
      return sum + p * q;
    }, 0);

    await cart.save();

    // Return normalized items for frontend convenience
    const items = (cart.items || []).map(it => ({
      _id: it._id,
      id: it.id,
      name: it.name,
      name_ar: it.name_ar,
      image: it.image,
      category: it.category,
      category_ar: it.category_ar,
      productType: it.productType,
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 1),
      totalPrice: Number(it.totalPrice || (it.price * it.quantity)),
    }));

    return res.status(200).json({ message: 'Product added to cart', items, cart });
  } catch (error) {
    console.error('Error adding to cart:', error);
    return res.status(500).json({ message: 'Error adding to cart', error: error.message });
  }
};

// Get Cart Items
const getCartItems = async (req, res) => {
  try {
    const userId = req.user?._id || req.params.userId;
    if (!userId) return res.status(400).json({ message: "User ID is required." });

    // populate product details if desired
    const cart = await Cart.findOne({ userId }).populate('items.id').lean();

    if (!cart) return res.status(200).json({ items: [] });

    const items = (cart.items || []).map(item => {
      const product = item.id || {}; // if populated, item.id is product
      return {
        _id: item._id,
        id: product._id || item.id,
        name: item.name || product.name || '',
        name_ar: item.name_ar || product.name_ar || '',
        image: item.image || product.image || {},
        category: item.category || product.category || '',
        category_ar: item.category_ar || product.category_ar || '',
        productType: item.productType || product.productType || '',
        price: Number(item.price ?? product.price ?? 0),
        quantity: Number(item.quantity ?? 1),
        totalPrice: Number(item.totalPrice ?? (Number(item.price ?? product.price ?? 0) * Number(item.quantity ?? 1)))
      };
    });

    return res.status(200).json({ items, cart });
  } catch (error) {
    console.error("Error fetching cart items:", error);
    return res.status(500).json({ message: "Error fetching cart items", error: error.message });
  }
};

// Remove From Cart
const removeFromCart = async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const objectId = (() => {
      try { return mongoose.Types.ObjectId(itemId); } catch (e) { return null; }
    })();

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    // Try to find by cart-item _id or by referenced product id
    const itemToRemove = cart.items.find(item => {
      const currentId = item._id || item.id;
      if (!currentId) return false;
      try {
        if (objectId && currentId.equals) return currentId.equals(objectId);
      } catch (e) {}
      return String(currentId) === String(itemId);
    });

    if (!itemToRemove) {
      console.error("Item not found in cart for itemId:", itemId);
      console.log("Cart items:", cart.items.map(item => (item._id || item.id).toString()));
      return res.status(404).json({ message: "Item not found in cart" });
    }

    cart.items = cart.items.filter(item => {
      const currentId = item._id || item.id;
      if (!currentId) return true;
      try {
        if (objectId && currentId.equals) return !currentId.equals(objectId);
      } catch (e) {}
      return String(currentId) !== String(itemId);
    });

    cart.totalAmount = (cart.items || []).reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 0)), 0);
    await cart.save();

    const items = (cart.items || []).map(it => ({
      _id: it._id,
      id: it.id,
      name: it.name,
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 1),
      image: it.image,
      totalPrice: Number(it.totalPrice || (it.price * it.quantity))
    }));

    return res.status(200).json({ message: "Item removed from cart", items, cart });
  } catch (error) {
    console.error("Error in removeFromCart:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Clear Cart
const clearCart = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    return res.status(200).json({ message: "Cart cleared", items: [], cart });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Increase quantity
const increaseQuantity = async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user?._id || req.body.userId;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find(i => (i.id && String(i.id) === String(itemId)) || (i._id && String(i._id) === String(itemId)));
    if (!item) return res.status(404).json({ message: "Item not found in cart" });

    item.quantity = Number(item.quantity || 0) + 1;
    item.totalPrice = Number(item.price || 0) * Number(item.quantity || 1);

    cart.totalAmount = (cart.items || []).reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 0)), 0);
    await cart.save();

    // return the whole updated cart items to the frontend
    const items = (cart.items || []).map(it => ({
      _id: it._id,
      id: it.id,
      name: it.name,
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 1),
      totalPrice: Number(it.totalPrice || (it.price * it.quantity)),
      image: it.image
    }));

    return res.status(200).json({ message: "Item increased in cart", items, cart });
  } catch (error) {
    console.error("Increase quantity error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Decrease quantity
const decreaseQuantity = async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user?._id || req.body.userId;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find(i => (i.id && String(i.id) === String(itemId)) || (i._id && String(i._id) === String(itemId)));
    if (!item) return res.status(404).json({ message: "Item not found in cart" });

    if (item.quantity > 1) {
      item.quantity = Number(item.quantity) - 1;
      item.totalPrice = Number(item.price || 0) * Number(item.quantity || 1);
    } else {
      cart.items = cart.items.filter(it => !((it.id && String(it.id) === String(itemId)) || (it._id && String(it._id) === String(itemId))));
    }

    cart.totalAmount = (cart.items || []).reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 0)), 0);
    await cart.save();

    const items = (cart.items || []).map(it => ({
      _id: it._id,
      id: it.id,
      name: it.name,
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 1),
      totalPrice: Number(it.totalPrice || (it.price * it.quantity)),
      image: it.image
    }));

    return res.status(200).json({ message: "Item decreased in cart", items, cart });
  } catch (error) {
    console.error("Decrease quantity error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/*
  Payment code kept as-is with minor token caching improvement.
  (I left processPayment and getAuthToken as in your original file.)
  If you want me to reformat those too I can — they were mostly fine.
*/

const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID;
const PAYMOB_AUTH_URL = 'https://accept.paymob.com/api/auth/tokens';
const PAYMOB_ORDER_URL = 'https://accept.paymob.com/api/ecommerce/orders';
const PAYMOB_PAYMENT_URL = 'https://accept.paymob.com/api/acceptance/payment_keys';

let cachedToken = null;
let tokenExpiry = null;

const getAuthToken = async () => {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  const authResponse = await axios.post(PAYMOB_AUTH_URL, { api_key: PAYMOB_API_KEY });
  if (!authResponse.data || !authResponse.data.token) {
    throw new Error('Failed to authenticate with Paymob.');
  }
  cachedToken = authResponse.data.token;
  tokenExpiry = Date.now() + 60 * 60 * 1000;
  return cachedToken;
};

const processPayment = async (req, res) => {
  const { totalAmount } = req.body;
  const userId = req.user?._id;
  const userEmail = req.user?.email || "saidsadaoy@gmail.com";
  const userName = req.user?.name || "said";
  const userPhone = req.user?.phone || "01028496209";

  if (!totalAmount || totalAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid totalAmount provided.' });
  }
  if (!PAYMOB_API_KEY || !PAYMOB_INTEGRATION_ID) {
    return res.status(500).json({ success: false, message: 'Server configuration error.' });
  }

  try {
    const token = await getAuthToken();

    let cartItems = [];
    if (userId) {
      const cart = await Cart.findOne({ userId });
      if (cart && Array.isArray(cart.items)) {
        cartItems = cart.items.map(item => ({
          name: item.name,
          amount_cents: Math.round(Number(item.price || 0) * 100),
          description: item.productType || "Product",
          quantity: Number(item.quantity || 1)
        }));
      }
    }

    const orderResponse = await axios.post(PAYMOB_ORDER_URL, {
      auth_token: token,
      amount_cents: totalAmount,
      currency: 'EGP',
      items: cartItems,
    });

    const orderId = orderResponse.data.id;
    const validEmail = typeof userEmail === 'string' && userEmail.includes('@') ? userEmail : 'saidsadaoy@gmail.com';
    const validFirstName = typeof userName === 'string' && userName.length > 0 ? userName : 'Test';
    const validPhone = typeof userPhone === 'string' && /^01[0-9]{9}$/.test(userPhone) ? userPhone : '01028496209';

    const paymentPayload = {
      auth_token: token,
      amount_cents: totalAmount,
      order_id: orderId,
      currency: 'EGP',
      integration_id: PAYMOB_INTEGRATION_ID,
      billing_data: {
        apartment: "NA",
        email: validEmail,
        floor: "NA",
        first_name: validFirstName,
        street: "NA",
        building: "NA",
        phone_number: validPhone,
        shipping_method: "NA",
        postal_code: "NA",
        city: "Cairo",
        country: "EG",
        last_name: "User",
        state: "Cairo"
      }
    };

    const paymentResponse = await axios.post(PAYMOB_PAYMENT_URL, paymentPayload);
    if (!paymentResponse.data || !paymentResponse.data.payment_key) {
      return res.status(500).json({ success: false, message: 'Failed to create payment key', details: paymentResponse.data });
    }

    return res.json({ success: true, paymentKey: paymentResponse.data.payment_key });
  } catch (error) {
    console.error('Payment processing error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Payment processing failed.' });
  }
};

module.exports = {
  addToCart,
  getCartItems,
  removeFromCart,
  clearCart,
  increaseQuantity,
  decreaseQuantity,
  processPayment,
};
