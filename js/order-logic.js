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

    return `
      <div class="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider">طلب #${order.orderNumber}</p>
            <h4 class="font-bold text-slate-800">${isAdmin ? order.customerName : 'تفاصيل الطلب'}</h4>
          </div>
          <span class="${status.color} text-white text-[10px] px-3 py-1 rounded-full font-bold">${status.text}</span>
        </div>
        <div class="text-xs text-slate-500 space-y-1">
          <p><i data-lucide="package" class="w-3 h-3 inline"></i> الأصناف: ${order.items?.length || 0}</p>
          <p class="font-black text-slate-800">الإجمالي: ${order.totalAmount} ج.م</p>
        </div>
        ${isAdmin ? `
          <div class="flex gap-2 pt-2 border-t border-dashed">
            <select onchange="updateOrderStatus('${order.id}', this.value)" class="flex-1 bg-slate-50 text-[10px] font-bold p-2 rounded-xl outline-none border-none">
              <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>قيد المراجعة</option>
              <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>تجهيز</option>
              <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>توصيل</option>
              <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>تم التسليم</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>إلغاء</option>
            </select>
            <a href="tel:${order.customerPhone}" class="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><i data-lucide="phone" class="w-4 h-4"></i></a>
          </div>
        ` : ''}
      </div>
    `;
  }).join("");
  if (window.lucide) lucide.createIcons();
}

window.updateOrderStatus = async (id, newStatus) => {
  try {
    const orderRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "orders", id);
    await window.firestoreUtils.updateDoc(orderRef, { status: newStatus });
    window.showToast("تم تحديث حالة الطلب", "success");
  } catch (e) {
    window.showToast("خطأ في التحديث", "error");
  }
};