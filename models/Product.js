const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    brand: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    currency: { type: String, default: "INR" },
    rating: { type: Number, default: 4.2, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    inStock: { type: Boolean, default: true },
    badge: { type: String, trim: true },
    shippingTag: { type: String, trim: true },
    colors: [{ type: String, trim: true }],
    sizes: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],
    imageUrl: { type: String, required: true },
    featured: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

productSchema.index({
  name: "text",
  brand: "text",
  subcategory: "text",
  description: "text",
  tags: "text"
});

module.exports = mongoose.model("Product", productSchema);
