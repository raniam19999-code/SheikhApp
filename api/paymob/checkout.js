/**
 * api/paymob/checkout.js
 * ────────────────────────────────────────────────────────
 * Serverless function – بدء جلسة دفع Paymob (3 خطوات)
 *
 * المتغيرات البيئية المطلوبة في Vercel:
 *   PAYMOB_API_KEY          ← مفتاح API الخاص بك
 *   PAYMOB_INTEGRATION_ID   ← Integration ID (بطاقة / محفظة)
 *   PAYMOB_IFRAME_ID        ← iframe ID من لوحة Paymob
 *
 * الطلب:  POST /api/paymob/checkout
 *         Body JSON:
 *           {
 *             amount_cents: number,   // المبلغ بالقروش (1 EGP = 100)
 *             items: Array,           // أصناف الطلب
 *             billing: {              // بيانات العميل
 *               firstName, lastName, phone, email, address
 *             }
 *           }
 *
 * الرد:   { paymentToken, iframeUrl }
 *         أو خطأ: { error: string }
 */

const axios = require("axios");

const PAYMOB_BASE = "https://accept.paymob.com/api";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { amount_cents, items = [], billing = {} } = req.body || {};

  if (!amount_cents || amount_cents <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    // ─── الخطوة 1: الحصول على Auth Token ───────────────────
    const authRes = await axios.post(`${PAYMOB_BASE}/auth/tokens`, {
      api_key: process.env.PAYMOB_API_KEY,
    });
    const authToken = authRes.data.token;

    // ─── الخطوة 2: تسجيل الطلب ──────────────────────────────
    const orderRes = await axios.post(
      `${PAYMOB_BASE}/ecommerce/orders`,
      {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents,
        currency: "EGP",
        items: items.map((item) => ({
          name: item.productName || item.name,
          amount_cents: Math.round((item.basePrice || item.price || 0) * 100),
          description: item.productName || item.name,
          quantity: item.orderedQuantity || 1,
        })),
      }
    );
    const orderId = orderRes.data.id;

    // ─── الخطوة 3: الحصول على Payment Key ───────────────────
    const billingData = {
      apartment: "NA",
      email: billing.email || "guest@sheikhapp.com",
      floor: "NA",
      first_name: billing.firstName || billing.customerName?.split(" ")[0] || "عميل",
      street: billing.address || "NA",
      building: "NA",
      phone_number: billing.phone || billing.customerPhone || "+201000000000",
      shipping_method: "NA",
      postal_code: "NA",
      city: "Cairo",
      country: "EG",
      last_name: billing.lastName || billing.customerName?.split(" ").slice(1).join(" ") || "مميز",
      state: "Cairo",
    };

    const paymentKeyRes = await axios.post(
      `${PAYMOB_BASE}/acceptance/payment_keys`,
      {
        auth_token: authToken,
        amount_cents,
        expiration: 3600,
        order_id: orderId,
        billing_data: billingData,
        currency: "EGP",
        integration_id: process.env.PAYMOB_INTEGRATION_ID,
      }
    );
    const paymentToken = paymentKeyRes.data.token;

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

    return res.status(200).json({ paymentToken, iframeUrl });
  } catch (err) {
    console.error("Paymob checkout error:", err?.response?.data || err.message);
    return res
      .status(500)
      .json({ error: "فشل في بدء جلسة الدفع. حاول مرة أخرى." });
  }
};
