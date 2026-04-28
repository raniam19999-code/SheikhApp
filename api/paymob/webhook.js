/**
 * api/paymob/webhook.js
 * ────────────────────────────────────────────────────────
 * Serverless function – استقبال تأكيد الدفع من Paymob (HMAC Webhook)
 *
 * المتغيرات البيئية المطلوبة في Vercel:
 *   PAYMOB_HMAC_SECRET      ← مفتاح HMAC من لوحة Paymob (Transaction Processed Callback)
 *   FIREBASE_SERVICE_ACCOUNT ← JSON كامل لـ Service Account (لتحديث Firestore)
 *   FIREBASE_PROJECT_ID     ← معرف مشروع Firebase
 *
 * ملاحظة: هذا الـ Webhook يستقبل طلب GET من Paymob (Transaction Response Callback).
 * قم بضبط عنوان Callback في لوحة Paymob على:
 *   https://your-domain.vercel.app/api/paymob/webhook
 *
 * الخوارزمية:
 *   1. استخراج بيانات المعاملة من query parameters
 *   2. إعادة بناء السلسلة الخاصة بـ HMAC والتحقق من صحتها
 *   3. إذا نجح الدفع (success=true) → تحديث حالة الطلب في Firestore
 *   4. إعادة توجيه المستخدم لصفحة النجاح أو الفشل
 */

const crypto = require("crypto");

// ─── HMAC Verification ──────────────────────────────────────────────────────
function verifyPaymobHmac(query, secret) {
  // الحقول المطلوبة لحساب HMAC حسب توثيق Paymob (بالترتيب الأبجدي)
  const hmacFields = [
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success",
  ];

  const concatenated = hmacFields
    .map((field) => {
      const key = field.replace(/\./g, "_"); // Paymob يرسل الحقول بشكل مسطح
      return query[key] ?? "";
    })
    .join("");

  const expectedHmac = crypto
    .createHmac("sha512", secret)
    .update(concatenated)
    .digest("hex");

  return expectedHmac === query.hmac;
}

// ─── Handler ────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Paymob يرسل GET مع بيانات المعاملة كـ query parameters
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).end();
  }

  const query = req.method === "GET" ? req.query : req.body;

  // ─── التحقق من HMAC ─────────────────────────────────────
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
  if (hmacSecret && query.hmac) {
    const isValid = verifyPaymobHmac(query, hmacSecret);
    if (!isValid) {
      console.warn("Paymob HMAC mismatch – ignoring request");
      return res.redirect(302, "/?payment=failed&reason=invalid_signature");
    }
  }

  const isSuccess = query.success === "true";
  const orderId = query.merchant_order_id || query.order; // معرف الطلب الذي أرسلناه

  // ─── تحديث Firestore (اختياري – يتطلب Service Account) ──
  if (isSuccess && orderId && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      // استخدام Firebase Admin SDK بشكل ديناميكي لتجنب أخطاء التحميل
      const admin = require("firebase-admin");

      if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      }

      const db = admin.firestore();
      const appId = process.env.FIREBASE_PROJECT_ID || "awladelshhapp";

      // البحث عن الطلب برقم orderNumber
      const ordersRef = db
        .collection("artifacts")
        .doc(appId)
        .collection("public")
        .doc("data")
        .collection("orders");

      const snapshot = await ordersRef
        .where("orderNumber", "==", String(orderId))
        .limit(1)
        .get();

      if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({
          paymentStatus: "paid",
          paymobTransactionId: query.id,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Order ${orderId} marked as paid`);
      }
    } catch (err) {
      console.error("Firestore update error:", err.message);
      // لا نوقف التنفيذ، نكمل إعادة التوجيه
    }
  }

  // ─── إعادة التوجيه للمستخدم ─────────────────────────────
  if (isSuccess) {
    return res.redirect(302, "/?payment=success");
  } else {
    const reason = query.data_message || "payment_failed";
    return res.redirect(302, `/?payment=failed&reason=${encodeURIComponent(reason)}`);
  }
};
