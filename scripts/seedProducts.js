require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const seedProducts = require("../data/seedProducts");

async function seed() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/m-brand-store";

  await mongoose.connect(mongoUri);
  await Product.deleteMany({});
  await Product.insertMany(seedProducts);

  console.log(`Seeded ${seedProducts.length} products into MongoDB.`);
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error("Seeding failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // Ignore disconnect errors during a failed seed run.
  }
  process.exit(1);
});
