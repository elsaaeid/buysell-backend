const mongoose = require("mongoose");


// Define the schema for cart items
const cartItemSchema = new mongoose.Schema({
  id: { // Renamed from id to id for clarity
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Products",
  },
  name: { type: String, required: false },
  name_ar: { // Arabic name
    type: String,
    required: false,
    trim: true,
  },
  image: { // Change this to an object
    fileName: { type: String, required: false },
    filePath: { type: String, required: false },
    fileType: { type: String, required: false },
    fileSize: { type: String, required: false },
  },
  quantity: { type: Number, required: false, default: 1 },
  price: { type: Number, required: false, min: 0 },
  category: {
    type: String,
    required: false,
    trim: true,
  },
  category_ar: { // Arabic category
    type: String,
    required: false,
    trim: true,
  },
  productType: {
    type: String,
    required: false,
    trim: true,
  },
});

// Cart Schema
const cartSchema = mongoose.Schema(
  {
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true // Automatically generate an ObjectId for each favorite
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  photo: {
    type: String,
    required: [true, "Please add a photo"],
    default: "https://i.ibb.co/4pDNDk1/avatar.png",
  },
    items: [cartItemSchema],
    createdAt: {
      type: Date,
      default: Date.now, // Automatically set the creation date
    },
    updatedAt: {
        type: Date,
        default: Date.now, // Automatically set the update date
  },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt fields
  }
);


const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;