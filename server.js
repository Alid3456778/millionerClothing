require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Product = require("./models/Product");
const User = require("./models/User");
const Order = require("./models/Order");
const seedProducts = require("./data/seedProducts");

const app = express();
const baseDir = __dirname;
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/m-brand-store";
const jwtSecret = process.env.JWT_SECRET || "m-brand-dev-secret";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function buildSort(sortKey) {
  switch (sortKey) {
    case "price_asc":
      return { price: 1, rating: -1 };
    case "price_desc":
      return { price: -1, rating: -1 };
    case "rating":
      return { rating: -1, reviewCount: -1 };
    case "newest":
      return { createdAt: -1 };
    default:
      return { featured: -1, rating: -1, reviewCount: -1, price: 1 };
  }
}

function makeAvatar(name) {
  return `https://ui-avatars.com/api/?background=111827&color=f5f7ff&name=${encodeURIComponent(name || "M User")}`;
}

function signUser(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, isAdmin: !!user.isAdmin },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

function sanitizeUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    avatarUrl: user.avatarUrl || makeAvatar(user.name),
    addresses: user.addresses || [],
    isAdmin: !!user.isAdmin,
    createdAt: user.createdAt
  };
}

async function buildUserCart(userId) {
  const user = await User.findById(userId).populate("cart.product").lean();
  const items = (user.cart || [])
    .filter((entry) => entry.product)
    .map((entry) => ({
      product: entry.product,
      quantity: entry.quantity,
      lineTotal: entry.quantity * entry.product.price
    }));

  return {
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0)
  };
}

async function ensureSeedData() {
  const count = await Product.estimatedDocumentCount();
  if (!count) {
    await Product.insertMany(seedProducts);
    console.log(`Seeded ${seedProducts.length} starter products.`);
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    req.auth = jwt.verify(token, jwtSecret);
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.auth || !req.auth.isAdmin) {
    return res.status(403).json({ message: "Admin access required." });
  }
  return next();
}

app.use(express.json());
app.use(express.static(baseDir));

app.get("/", (_req, res) => res.sendFile(path.join(baseDir, "index.html")));
app.get("/searchPage", (_req, res) => res.sendFile(path.join(baseDir, "searchPage.html")));
app.get("/cart", (_req, res) => res.sendFile(path.join(baseDir, "cart.html")));
app.get("/profile", (_req, res) => res.sendFile(path.join(baseDir, "profile.html")));
app.get("/auth", (_req, res) => res.sendFile(path.join(baseDir, "auth.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(baseDir, "admin.html")));
app.get("/admin-login", (_req, res) => res.sendFile(path.join(baseDir, "admin-login.html")));
app.get("/product/:slug", (_req, res) => res.sendFile(path.join(baseDir, "product.html")));

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, mongoState: mongoose.connection.readyState });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const phone = String(req.body.phone || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      phone,
      avatarUrl: makeAvatar(name),
      addresses: []
    });

    const token = signUser(user);
    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = signUser(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/session", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id).lean();
    if (!user) return res.status(404).json({ message: "User not found." });
    return res.json(sanitizeUser(user));
  } catch (error) {
    return next(error);
  }
});

app.get("/api/products", async (req, res, next) => {
  try {
    const ids = parseList(req.query.ids);
    const q = String(req.query.q || "").trim();
    const categories = parseList(req.query.category);
    const brands = parseList(req.query.brand);
    const colors = parseList(req.query.color);
    const sizes = parseList(req.query.size);
    const minPrice = Number(req.query.minPrice || 0);
    const maxPrice = Number(req.query.maxPrice || 0);
    const minRating = Number(req.query.minRating || 0);
    const inStockOnly = req.query.inStock === "true";
    const sort = buildSort(req.query.sort);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(48, Math.max(1, Number(req.query.limit || 12)));
    const query = {};

    if (ids.length) query._id = { $in: ids };
    if (q) {
      const searchRegex = new RegExp(escapeRegex(q), "i");
      query.$or = [
        { name: searchRegex },
        { brand: searchRegex },
        { subcategory: searchRegex },
        { description: searchRegex },
        { tags: searchRegex }
      ];
    }
    if (categories.length) query.category = { $in: categories };
    if (brands.length) query.brand = { $in: brands };
    if (colors.length) query.colors = { $in: colors };
    if (sizes.length) query.sizes = { $in: sizes };
    if (minRating) query.rating = { ...(query.rating || {}), $gte: minRating };
    if (inStockOnly) query.inStock = true;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = minPrice;
      if (maxPrice) query.price.$lte = maxPrice;
    }

    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(query)
    ]);

    return res.json({
      meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), query: q },
      products
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/products/slug/:slug", async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).lean();
    if (!product) return res.status(404).json({ message: "Product not found." });
    const related = await Product.find({
      _id: { $ne: product._id },
      category: product.category
    }).limit(4).lean();
    return res.json({ product, related });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/filters", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const query = {};
    if (q) {
      const searchRegex = new RegExp(escapeRegex(q), "i");
      query.$or = [
        { name: searchRegex },
        { brand: searchRegex },
        { subcategory: searchRegex },
        { description: searchRegex },
        { tags: searchRegex }
      ];
    }

    const [brands, categories, colors, sizes, priceStats] = await Promise.all([
      Product.distinct("brand", query),
      Product.distinct("category", query),
      Product.distinct("colors", query),
      Product.distinct("sizes", query),
      Product.aggregate([
        { $match: query },
        { $group: { _id: null, minPrice: { $min: "$price" }, maxPrice: { $max: "$price" } } }
      ])
    ]);

    return res.json({
      brands: brands.sort(),
      categories: categories.sort(),
      colors: colors.sort(),
      sizes: sizes.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
      priceRange: priceStats[0] || { minPrice: 0, maxPrice: 10000 }
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/cart/merge", authMiddleware, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    items.forEach((item) => {
      if (!item.productId) return;
      const existing = user.cart.find((entry) => entry.product.toString() === String(item.productId));
      if (existing) existing.quantity += Math.max(1, Number(item.quantity || 1));
      else user.cart.push({ product: item.productId, quantity: Math.max(1, Number(item.quantity || 1)) });
    });

    await user.save();
    return res.json(await buildUserCart(user._id));
  } catch (error) {
    return next(error);
  }
});

app.get("/api/cart", authMiddleware, async (req, res, next) => {
  try {
    return res.json(await buildUserCart(req.auth.id));
  } catch (error) {
    return next(error);
  }
});

app.post("/api/cart/add", authMiddleware, async (req, res, next) => {
  try {
    const productId = String(req.body.productId || "");
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const existing = user.cart.find((item) => item.product.toString() === productId);
    if (existing) existing.quantity += quantity;
    else user.cart.push({ product: productId, quantity });
    await user.save();
    return res.json({ cart: await buildUserCart(user._id) });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/cart/items/:productId", authMiddleware, async (req, res, next) => {
  try {
    const quantity = Math.max(0, Number(req.body.quantity || 0));
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    user.cart = user.cart.filter((item) => {
      if (item.product.toString() !== req.params.productId) return true;
      if (!quantity) return false;
      item.quantity = quantity;
      return true;
    });

    await user.save();
    return res.json(await buildUserCart(user._id));
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/cart/items/:productId", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    user.cart = user.cart.filter((item) => item.product.toString() !== req.params.productId);
    await user.save();
    return res.json(await buildUserCart(user._id));
  } catch (error) {
    return next(error);
  }
});

app.post("/api/orders/checkout", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found." });
    if (!user.cart.length) return res.status(400).json({ message: "Your cart is empty." });

    const address = req.body.shippingAddress || user.addresses[0];
    if (!address || !address.fullName || !address.line1 || !address.city || !address.state || !address.postalCode) {
      return res.status(400).json({ message: "A full shipping address is required to place the order." });
    }

    const items = user.cart
      .filter((entry) => entry.product)
      .map((entry) => ({
        product: entry.product._id,
        sku: entry.product.sku,
        name: entry.product.name,
        slug: entry.product.slug,
        imageUrl: entry.product.imageUrl,
        quantity: entry.quantity,
        price: entry.product.price
      }));

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingCost = subtotal > 2999 ? 0 : 199;
    const taxAmount = Math.round(subtotal * 0.05);
    const total = subtotal + shippingCost + taxAmount;

    const order = await Order.create({
      user: user._id,
      items,
      subtotal,
      shippingCost,
      taxAmount,
      total,
      shippingAddress: {
        fullName: address.fullName,
        line1: address.line1,
        line2: address.line2 || "",
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country || "India"
      }
    });

    user.cart = [];
    if (!user.addresses.length) user.addresses.push(order.shippingAddress);
    await user.save();

    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/orders/me", authMiddleware, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.auth.id }).sort({ createdAt: -1 }).lean();
    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/profile", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    user.name = String(req.body.name || user.name).trim();
    user.phone = String(req.body.phone || user.phone || "").trim();
    if (Array.isArray(req.body.addresses)) user.addresses = req.body.addresses;
    await user.save();

    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/products", authMiddleware, adminMiddleware, async (_req, res, next) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ products });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/products", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const payload = req.body || {};
    const product = await Product.create({
      sku: payload.sku,
      name: payload.name,
      slug: payload.slug,
      brand: payload.brand,
      category: payload.category,
      subcategory: payload.subcategory,
      description: payload.description,
      price: Number(payload.price),
      originalPrice: payload.originalPrice ? Number(payload.originalPrice) : undefined,
      currency: "INR",
      rating: Number(payload.rating || 4.2),
      reviewCount: Number(payload.reviewCount || 0),
      inStock: payload.inStock !== false,
      badge: payload.badge || "",
      shippingTag: payload.shippingTag || "",
      colors: Array.isArray(payload.colors) ? payload.colors : parseList(payload.colors),
      sizes: Array.isArray(payload.sizes) ? payload.sizes : parseList(payload.sizes),
      tags: Array.isArray(payload.tags) ? payload.tags : parseList(payload.tags),
      imageUrl: payload.imageUrl,
      featured: !!payload.featured
    });
    return res.status(201).json({ product });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/admin/products/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const payload = req.body || {};
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: payload.name,
          brand: payload.brand,
          category: payload.category,
          subcategory: payload.subcategory,
          description: payload.description,
          price: Number(payload.price),
          originalPrice: payload.originalPrice ? Number(payload.originalPrice) : undefined,
          rating: Number(payload.rating || 4.2),
          reviewCount: Number(payload.reviewCount || 0),
          inStock: payload.inStock !== false,
          badge: payload.badge || "",
          shippingTag: payload.shippingTag || "",
          colors: Array.isArray(payload.colors) ? payload.colors : parseList(payload.colors),
          sizes: Array.isArray(payload.sizes) ? payload.sizes : parseList(payload.sizes),
          tags: Array.isArray(payload.tags) ? payload.tags : parseList(payload.tags),
          imageUrl: payload.imageUrl,
          featured: !!payload.featured
        }
      },
      { new: true }
    );
    return res.json({ product });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/orders", authMiddleware, adminMiddleware, async (_req, res, next) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 }).populate("user", "name email").lean();
    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/admin/orders/:id", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: { status: req.body.status, paymentStatus: req.body.paymentStatus || "paid" } },
      { new: true }
    ).lean();
    return res.json({ order });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong while processing the request." });
});

mongoose
  .connect(mongoUri)
  .then(async () => {
    console.log("Connected to MongoDB.");
    await ensureSeedData();
    app.listen(port, () => {
      console.log(`M Brand server running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  });
