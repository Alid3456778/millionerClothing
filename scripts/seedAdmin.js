require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/m-brand-store";

function readArg(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length).trim() : "";
}

async function run() {
  const name = readArg("name") || "M Brand Admin";
  const email = readArg("email").toLowerCase();
  const password = readArg("password");
  const phone = readArg("phone");

  if (!email || !password) {
    console.error("Usage: npm run seed:admin -- --email=admin@example.com --password=YourPassword --name=\"Admin Name\"");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const passwordHash = await bcrypt.hash(password, 10);
  const avatarUrl = `https://ui-avatars.com/api/?background=111827&color=f5f7ff&name=${encodeURIComponent(name)}`;

  const user = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        email,
        passwordHash,
        phone,
        avatarUrl,
        isAdmin: true
      },
      $setOnInsert: {
        addresses: [
          {
            label: "HQ",
            fullName: name,
            line1: "M Brand Studio",
            city: "Pune",
            state: "Maharashtra",
            postalCode: "411001",
            country: "India"
          }
        ],
        cart: []
      }
    },
    { new: true, upsert: true }
  );

  console.log(`Admin account is ready in MongoDB for ${user.email}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Failed to seed admin account:", error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // Ignore disconnect errors during a failed seed.
  }
  process.exit(1);
});
