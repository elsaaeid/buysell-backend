// controllers/cartController.js
const axios = require("axios");
const mongoose = require("mongoose");
const Cart = require("../models/cartModel");
const { Products } = require("../models/productsModel");
const Payment = require("../models/paymentModel");
const Order = require("../models/orderModel");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ---------------------------------------------------------------------
// ADD TO CART
// ---------------------------------------------------------------------
const addToCart = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const {
      id, // product _id
      quantity = 1,
      productType,
      name,
      name_ar,
      price,
      image,
      category,
      category_ar,
    } = req.body;

    if (!id || quantity == null)
      return res
        .status(400)
        .json({ message: "Missing required fields: id or quantity" });

    // ✅ Ensure the product exists
    const product = await Products.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // ✅ Find or create the user's cart
    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [], totalAmount: 0 });

    const productObjectId = new mongoose.Types.ObjectId(id);

    // ✅ Check if product already in cart
    const existingItem = cart.items.find(
      (i) => String(i._id) === String(productObjectId)
    );

    if (existingItem) {
      existingItem.quantity += Number(quantity);
      existingItem.totalPrice = Number(existingItem.price) * existingItem.quantity;
    } else {
      // ✅ Add new cart item (use _id same as product _id)
      cart.items.push({
        _id: product._id,
        name: product.name || name,
        name_ar: product.name_ar || name_ar,
        category: product.category || category,
        category_ar: product.category_ar || category_ar,
        productType: product.productType || productType,
        price: Number(product.price ?? price ?? 0),
        quantity: Number(quantity || 1),
        image: product.image || image || {},
        totalPrice: Number(product.price ?? price ?? 0) * Number(quantity || 1),
      });
    }

    // ✅ Recalculate totalAmount
    cart.totalAmount = cart.items.reduce(
      (sum, it) => sum + (Number(it.price) * Number(it.quantity)),
      0
    );

    await cart.save();

    return res.status(200).json({
      message: "Product added to cart",
      items: cart.items,
      cart,
    });
  } catch (error) {
    console.error("❌ Error adding to cart:", error);
    return res.status(500).json({ message: "Error adding to cart", error: error.message });
  }
};

// ---------------------------------------------------------------------
// GET CART ITEMS
// ---------------------------------------------------------------------
const getCartItems = async (req, res) => {
  try {
    const userId = req.user?._id || req.params.userId;
    if (!userId) return res.status(400).json({ message: "User ID is required." });

    const cart = await Cart.findOne({ userId }).populate("items._id").lean();
    if (!cart) return res.status(200).json({ items: [] });

    const items = (cart.items || []).map((item) => {
      const product = item._id || {};
      return {
        _id: product._id || item._id,
        name: item.name || product.name || "",
        name_ar: item.name_ar || product.name_ar || "",
        image: item.image || product.image || {},
        category: item.category || product.category || "",
        category_ar: item.category_ar || product.category_ar || "",
        productType: item.productType || product.productType || "",
        price: Number(item.price ?? product.price ?? 0),
        quantity: Number(item.quantity ?? 1),
        totalPrice:
          Number(item.totalPrice) ||
          Number(item.price ?? product.price ?? 0) * Number(item.quantity ?? 1),
      };
    });

    return res.status(200).json({ items, cart });
  } catch (error) {
    console.error("Error fetching cart items:", error);
    return res.status(500).json({ message: "Error fetching cart items", error: error.message });
  }
};

// ---------------------------------------------------------------------
// REMOVE ITEM
// ---------------------------------------------------------------------
const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter((i) => String(i._id) !== String(itemId));
    cart.totalAmount = cart.items.reduce(
      (sum, it) => sum + (Number(it.price) * Number(it.quantity)),
      0
    );

    await cart.save();
    return res.status(200).json({ message: "Item removed", items: cart.items, cart });
  } catch (error) {
    console.error("Error removing item:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ---------------------------------------------------------------------
// CLEAR CART
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// INCREASE QUANTITY
// ---------------------------------------------------------------------
const increaseQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find((i) => String(i._id) === String(itemId));
    if (!item) return res.status(404).json({ message: "Item not found" });

    item.quantity += 1;
    item.totalPrice = item.price * item.quantity;
    cart.totalAmount = cart.items.reduce(
      (sum, it) => sum + (it.price * it.quantity),
      0
    );

    await cart.save();
    return res.status(200).json({ message: "Quantity increased", items: cart.items, cart });
  } catch (error) {
    console.error("Increase quantity error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ---------------------------------------------------------------------
// DECREASE QUANTITY
// ---------------------------------------------------------------------
const decreaseQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find((i) => String(i._id) === String(itemId));
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (item.quantity > 1) {
      item.quantity -= 1;
      item.totalPrice = item.price * item.quantity;
    } else {
      cart.items = cart.items.filter((i) => String(i._id) !== String(itemId));
    }

    cart.totalAmount = cart.items.reduce(
      (sum, it) => sum + (it.price * it.quantity),
      0
    );

    await cart.save();
    return res.status(200).json({ message: "Quantity decreased", items: cart.items, cart });
  } catch (error) {
    console.error("Decrease quantity error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ---------------------------------------------------------------------
// PAYMENT (PAYMOB)
// ---------------------------------------------------------------------
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID;
const PAYMOB_AUTH_URL = "https://accept.paymob.com/api/auth/tokens";
const PAYMOB_ORDER_URL = "https://accept.paymob.com/api/ecommerce/orders";
const PAYMOB_PAYMENT_URL = "https://accept.paymob.com/api/acceptance/payment_keys";

let cachedToken = null;
let tokenExpiry = null;

const getAuthToken = async () => {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) return cachedToken;
  const response = await axios.post(PAYMOB_AUTH_URL, { api_key: PAYMOB_API_KEY });
  cachedToken = response.data.token;
  tokenExpiry = Date.now() + 60 * 60 * 1000;
  return cachedToken;
};

const processPayment = async (req, res) => {
  try {
    const { totalAmount } = req.body;
    const userId = req.user?._id;
    if (!totalAmount || totalAmount <= 0)
      return res.status(400).json({ success: false, message: "Invalid total amount" });

    const token = await getAuthToken();

    const cart = await Cart.findOne({ userId });
    const items = (cart?.items || []).map((i) => ({
      name: i.name,
      amount_cents: Math.round(i.price * 100),
      description: i.productType || "Product",
      quantity: i.quantity,
    }));

    const orderResponse = await axios.post(PAYMOB_ORDER_URL, {
      auth_token: token,
      amount_cents: totalAmount,
      currency: "EGP",
      items,
    });

    const paymentResponse = await axios.post(PAYMOB_PAYMENT_URL, {
      auth_token: token,
      amount_cents: totalAmount,
      order_id: orderResponse.data.id,
      currency: "EGP",
      integration_id: PAYMOB_INTEGRATION_ID,
      billing_data: {
        first_name: req.user?.name || "User",
        email: req.user?.email || "default@example.com",
        phone_number: req.user?.phone || "01000000000",
        city: "Cairo",
        country: "EG",
        state: "Cairo",
      },
    });

    return res.status(200).json({
      success: true,
      paymentKey: paymentResponse.data.payment_key,
    });
  } catch (error) {
    console.error("Payment error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Payment failed" });
  }
};

// ---------------------------------------------------------------------
module.exports = {
  addToCart,
  getCartItems,
  removeFromCart,
  clearCart,
  increaseQuantity,
  decreaseQuantity,
  processPayment,
};
