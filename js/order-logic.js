/* ========================================================
   order-logic.js: إدارة الطلبات، التتبع، ولوحة تحكم المدير
======================================================== */

/**
 * 1. إرسال طلب جديد
 */
export async function placeOrder() {
  const name = document.getElementById("order-name").value.trim();
  const phone = document.getElementById("order-phone").value.trim();
  const address = document.getElementById("order-address").value.trim();
  const coords = document.getElementById("order-coords").value;
  const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'cash';

  // التحقق من البيانات
  if (!name || !phone || !address) {
    return window.showToast("يرجى إكمال بيانات التوصيل أولاً", "warning");
  }

  const sourceCart = (window.currentUser && !window.currentUser.isAnonymous) ? window.userFirestoreCart : window.cart;
  if (sourceCart.length === 0) {
    return window.showToast("السلة فارغة!", "error");
  }

  const total = sourceCart.reduce((sum, item) => sum + ((item.basePrice || item.price) * item.orderedQuantity), 0);

  const orderData = {
    userId: window.currentUser ? window.currentUser.uid : 'anonymous',
    customerName: name,
    customerPhone: phone,
    customerAddress: address,
    coordinates: coords,
    paymentMethod: paymentMethod,
    items: sourceCart,
    totalAmount: total,
    status: 'pending', // pending, processing, shipped, delivered, cancelled
    createdAt: window.firestoreUtils.serverTimestamp(),
    orderNumber: Math.floor(100000 + Math.random() * 900000).toString()
  };

  try {
    window.showNotification("جاري إرسال طلبك...");
    const ordersRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "orders");
    await window.firestoreUtils.addDoc(ordersRef, orderData);

    // مسح السلة بعد نجاح الطلب
    await window.clearCart();
    
    window.showToast("تم إرسال طلبك بنجاح! رقم الطلب: #" + orderData.orderNumber, "success");
    window.showTab('tracking');
  } catch (error) {
    console.error("Order Error:", error);
    window.showToast("فشل في إرسال الطلب، حاول مرة أخرى", "error");
  }
}

/**
 * 2. تحميل طلبات المستخدم الحالي للتتبع
 */
export function loadUserOrders() {
  if (!window.currentUser || window.currentUser.isAnonymous) return;

  const q = window.firestoreUtils.query(
    window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "orders"),
    window.firestoreUtils.where("userId", "==", window.currentUser.uid)
  );

  return window.firestoreUtils.onSnapshot(q, (snap) => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOrdersList(orders, "orders-list");
  });
}

/**
 * 3. لوحة تحكم المدير: الاستماع لكافة الطلبات
 */
export function listenToOrders() {
  const q = window.firestoreUtils.query(
    window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "orders")
  );

  return window.firestoreUtils.onSnapshot(q, (snap) => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOrdersList(orders, "admin-o-list", true);
    
    // تحديث شارة التنبيه للطلبات الجديدة (pending)
    const newOrders = orders.filter(o => o.status === 'pending').length;
    const badge = document.getElementById("admin-orders-badge");
    if (badge) badge.classList.toggle("hidden", newOrders === 0);
  });
}

/**
 * 4. عرض القائمة (للمستخدم أو المدير)
 */
function renderOrdersList(orders, containerId, isAdmin = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-slate-400 font-bold">لا توجد طلبات حالياً</div>`;
    return;
  }

  // ترتيب تنازلي حسب التاريخ
  orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  container.innerHTML = orders.map(order => {
    const statusMap = {
      pending: { text: 'قيد المراجعة', color: 'bg-amber-500' },
      processing: { text: 'جاري التجهيز', color: 'bg-blue-500' },
      shipped: { text: 'خرج للتوصيل', color: 'bg-indigo-500' },
      delivered: { text: 'تم التسليم', color: 'bg-emerald-500' },
      cancelled: { text: 'ملغي', color: 'bg-red-500' }
    };
    const status = statusMap[order.status] || statusMap.pending;

    const itemsHtml = (order.items || []).map(item => {
      // محاولة استرجاع الكود من قائمة المنتجات الحالية إذا كان مفقوداً في بيانات الطلب (للطلبات القديمة)
      let displaySku = item.sku;
      if (!displaySku && item.productId) {
          const p = (window.products || []).find(prod => prod.id === item.productId);
          if (p) displaySku = p.sku;
      }

      return `
      <tr class="border-b border-slate-50 text-[10px]">
        <td class="py-2 font-mono text-slate-400">${displaySku || '—'}</td>
        <td class="py-2 pr-2 font-bold text-slate-700">${item.productName || item.name}</td>
        <td class="py-2 text-center font-black text-emerald-700">${item.orderedQuantity}</td>
        <td class="py-2 text-left font-bold text-slate-600">${item.basePrice || item.price} ج.م</td>
      </tr>
    `}).join("");

    return `
      <div id="invoice-${order.id}" class="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 transition-all hover:border-emerald-100 print:shadow-none print:border-none print:p-0">
        <!-- ترويسة الفاتورة للطباعة -->
        <div class="hidden print:flex justify-between items-center border-b-2 border-emerald-800 pb-4 mb-4">
            <div class="text-right">
                <h2 class="text-xl font-black text-emerald-900">متجر أولاد الشيخ</h2>
                <p class="text-[10px] text-slate-500 font-bold">للمواد الغذائية والمنظفات - جملة الجملة</p>
            </div>
            <div class="text-left py-2 px-4 bg-emerald-900 text-white rounded-2xl">
                <p class="text-[14px] font-black italic">فاتورة مبيعات</p>
            </div>
        </div>

        <div class="flex justify-between items-start">
          <div>
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider">رقم الطلب: #${order.orderNumber}</p>
            <h4 class="font-bold text-slate-900 text-sm mb-1">${isAdmin ? `العميل: ${order.customerName}` : 'تفاصيل طلبك'}</h4>
            <div class="flex flex-col gap-0.5">
                <p class="text-[10px] text-emerald-600 font-black flex items-center gap-1">
                    <i data-lucide="calendar" class="w-3 h-3"></i> 
                    التاريخ: ${order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'جاري التحميل...'}
                </p>
                <p class="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                    <i data-lucide="clock" class="w-3 h-3"></i> 
                    الوقت: ${order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
            </div>
          </div>
          <span class="${status.color} text-white text-[10px] px-3 py-1 rounded-full font-bold print:hidden shadow-sm">${status.text}</span>
        </div>

        <!-- معلومات العميل للسائق -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2.5 relative overflow-hidden">
            <div class="absolute top-0 right-0 w-1 h-full bg-emerald-500"></div>
            <div class="flex justify-between items-center text-[11px]">
                <span class="text-slate-500 flex items-center gap-1"><i data-lucide="user" class="w-3 h-3"></i> العميل:</span>
                <span class="font-black text-slate-800">${order.customerName}</span>
            </div>
            <div class="flex justify-between items-center text-[11px]">
                <span class="text-slate-500 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> العنوان:</span>
                <span class="font-bold text-slate-700">${order.customerAddress}</span>
            </div>
            <div class="flex justify-between items-center text-[11px]">
                <span class="text-slate-500 flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i> الهاتف:</span>
                <a href="tel:${order.customerPhone}" class="font-sans font-black text-emerald-600 underline decoration-emerald-200 underline-offset-4" dir="ltr">${order.customerPhone}</a>
            </div>
            <div class="flex justify-between items-center text-[11px]">
                <span class="text-slate-500">طريقة الدفع:</span>
                <span class="font-bold text-emerald-700 bg-emerald-50 px-2 rounded">${order.paymentMethod === 'cash' ? 'كاش عند الاستلام' : 'دفع إلكتروني'}</span>
            </div>
            ${order.coordinates ? `
                <div class="pt-1 print:hidden">
                    <a href="https://www.google.com/maps/search/?api=1&query=${order.coordinates}" target="_blank" class="text-[9px] text-blue-600 font-bold flex items-center gap-1 hover:underline">
                        <i data-lucide="map-pin" class="w-3 h-3"></i> فتح موقع العميل على الخريطة
                    </a>
                </div>
            ` : ''}
        </div>

        <div class="overflow-hidden border border-slate-100 rounded-2xl">
          <table class="w-full text-right border-collapse">
            <thead class="bg-slate-100">
              <tr class="text-[9px] font-black text-slate-600 border-b border-slate-200">
                <th class="p-2">الكود</th>
                <th class="p-2 pr-2">الاسم</th>
                <th class="p-2 text-center">كمية</th>
                <th class="p-2 text-left">سعر</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        <div class="flex justify-between items-center pt-2 px-2">
           <span class="text-[11px] font-bold text-slate-400">صافي الفاتورة:</span>
           <span class="text-lg font-black text-emerald-900 underline decoration-emerald-500 decoration-2 underline-offset-4">${order.totalAmount} ج.م</span>
        </div>

        <!-- ختم الفاتورة للطباعة -->
        <div class="hidden print:block pt-10 text-center">
            <p class="text-[10px] text-slate-400 font-bold border-t border-dashed pt-4">شكراً لتعاملكم مع أولاد الشيخ - مدينة أولاد الشيخ</p>
        </div>

        ${isAdmin ? `
          <div class="flex gap-2 pt-3 border-t border-dashed print:hidden">
            <select onchange="updateOrderStatus('${order.id}', this.value)" class="flex-1 bg-slate-50 text-[10px] font-bold p-2.5 rounded-xl outline-none border border-slate-100 transition-colors focus:border-emerald-300">
              <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>⏳ مراجعة</option>
              <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>⚙️ تجهيز</option>
              <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>🚚 توصيل</option>
              <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>✅ تسليم</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ إلغاء</option>
            </select>
            <button onclick="window.printInvoice('invoice-${order.id}')" class="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-90" title="طباعة الفاتورة">
               <i data-lucide="printer" class="w-4 h-4"></i>
            </button>
            <a href="tel:${order.customerPhone}" class="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all active:scale-90" title="اتصال">
               <i data-lucide="phone" class="w-4 h-4"></i>
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }).join("");
  if (window.lucide) lucide.createIcons();
}

window.printInvoice = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    const style = document.createElement('style');
    style.id = 'print-style';
    style.innerHTML = `
        @media print {
            body > * { display: none !important; }
            #${id}, #${id} * { visibility: visible !important; display: block !important; }
            #${id} {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                padding: 10px !important;
            }
            .print\\:hidden { display: none !important; }
            .print\\:block { display: block !important; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: right; }
        }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById('print-style')?.remove(), 1000);
};

window.updateOrderStatus = async (id, newStatus) => {
  try {
    const orderRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "orders", id);
    await window.firestoreUtils.updateDoc(orderRef, { status: newStatus });
    window.showToast("تم تحديث حالة الطلب", "success");
  } catch (e) {
    window.showToast("خطأ في التحديث", "error");
  }
};