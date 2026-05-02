/**
 * api/cloudinary-sign.js
 * ────────────────────────────────────────────────────────
 * Serverless function – توليد توقيع رفع Cloudinary (Signed Upload)
 *
 * المتغيرات البيئية المطلوبة في Vercel:
 *   CLOUDINARY_CLOUD_NAME   ← اسم السحابة
 *   CLOUDINARY_API_KEY      ← المفتاح العام
 *   CLOUDINARY_API_SECRET   ← السر الخاص (لا يُرسل للمتصفح أبداً)
 *
 * الطلب:  POST /api/cloudinary-sign
 *         Body JSON: { folder?: string }
 *
 * الرد:   { signature, timestamp, apiKey, cloudName, folder }
 */

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = async function handler(req, res) {
  // السماح بالطلبات من الموقع نفسه فقط
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const folder = req.body?.folder || "sheikh-app/products";
    const timestamp = Math.round(new Date().getTime() / 1000);

    const paramsToSign = { folder, timestamp };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.status(200).json({
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder,
    });
  } catch (err) {
    console.error("Cloudinary sign error:", err);
    return res.status(500).json({ error: "Failed to generate signature" });
  }
};
