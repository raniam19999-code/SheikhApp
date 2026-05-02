/**
 * api/paymob/checkout.js
 * ────────────────────────────────────────────────────────
 * Serverless function – بدء عملية الدفع مع Paymob
 *
 * المتغيرات البيئية المطلوبة في Vercel:
 *   PAYMOB_API_KEY          ← مفتاح API من لوحة Paymob (Settings -> API Key)
 *   PAYMOB_INTEGRATION_ID   ← معرف التكامل (Online Card Integration ID)
 *   PAYMOB_IFRAME_ID        ← معرف الـ Iframe الذي ستعرض فيه البوابة
 */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { amount_cents, billing, items, orderNumber } = req.body;

  try {
    // 1. طلب التوكن (Authentication Request)
    const authRes = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: process.env.PAYMOB_API_KEY }),
    });
    const { token } = await authRes.json();

    // 2. تسجيل الطلب (Order Registration)
    const orderRes = await fetch(
      "https://accept.paymob.com/api/ecommerce/orders",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_token: token,
          delivery_needed: "false",
          amount_cents: amount_cents,
          currency: "EGP",
          merchant_order_id: orderNumber,
          items: items.map((i) => ({
            name: i.productName || i.name || "Product",
            amount_cents: Math.round((i.basePrice || i.price) * 100),
            description: i.selectedUnit || "unit",
            quantity: i.orderedQuantity,
          })),
        }),
      },
    );
    const orderData = await orderRes.json();

    // 3. إنشاء مفتاح الدفع (Payment Key Generation)
    const pKeyRes = await fetch(
      "https://accept.paymob.com/api/acceptance/payment_keys",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_token: token,
          amount_cents: amount_cents,
          expiration: 3600,
          order_id: orderData.id,
          billing_data: {
            apartment: "NA",
            email: billing.email,
            floor: "NA",
            first_name: billing.firstName,
            street: billing.address,
            building: "NA",
            phone_number: billing.phone,
            shipping_method: "NA",
            postal_code: "NA",
            city: "NA",
            country: "EG",
            last_name: billing.lastName,
            state: "NA",
          },
          currency: "EGP",
          integration_id: process.env.PAYMOB_INTEGRATION_ID,
        }),
      },
    );
    const { token: paymentToken } = await pKeyRes.json();

    // 4. إرجاع رابط الـ Iframe للمتصفح
    const iframeId = process.env.PAYMOB_IFRAME_ID;
    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`;

    res.status(200).json({ iframeUrl });
  } catch (error) {
    console.error("Paymob API Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
