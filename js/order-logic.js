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

  // تحديث أسعار المنتجات في الطلب لتكون مطابقة للأسعار الحالية في الموقع قبل الحفظ
  const itemsWithLivePrices = sourceCart.map(item => {
    const prodId = item.productId || item.originalId;
    const product = (window.products || []).find(p => p.id === prodId);
    let currentPrice = Number(item.basePrice || item.price || 0);
    
    if (product) {
      const unit = item.selectedUnit || item.unit || 'bag';
      const livePrice = typeof window.getEffectivePrice === 'function' ? window.getEffectivePrice(product, unit) : (product.prices?.[unit] || product.price);
      if (livePrice > 0) currentPrice = Number(livePrice);
    }
    
    return { ...item, productId: prodId, basePrice: currentPrice, price: currentPrice };
  });

  const total = itemsWithLivePrices.reduce((sum, item) => sum + (item.basePrice * item.orderedQuantity), 0);

  const orderData = {
    userId: window.currentUser ? window.currentUser.uid : 'anonymous',
    customerName: name,
    customerPhone: phone,
    customerAddress: address,
    coordinates: coords,
    paymentMethod: paymentMethod,
    items: itemsWithLivePrices,
    totalAmount: total,
    status: 'pending', // pending, processing, shipped, delivered, cancelled
    createdAt: window.firestoreUtils.serverTimestamp(),
    orderNumber: Math.floor(100000 + Math.random() * 900000).toString()
  };

  try {
    window.showNotification("جاري إرسال طلبك...");
    
    // استخدام WriteBatch لضمان خصم المخزون وإرسال الطلب في عملية واحدة (المعيار الذهبي)
    const batch = window.firestoreUtils.writeBatch(window.db);
    const ordersRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "orders");
    const newOrderRef = window.firestoreUtils.doc(ordersRef); // إنشاء مرجع بـ ID تلقائي
    
    // 1. إضافة وثيقة الطلب للدفعة
    batch.set(newOrderRef, orderData);

    // 2. خصم الكميات من المخزون لكل منتج في الطلب
    itemsWithLivePrices.forEach(item => {
      const prodId = item.productId || item.originalId;
      const product = (window.products || []).find(p => p.id === prodId);
      
      if (product) {
        const productRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "products", prodId);
        const currentQty = Number(product.quantity || 0);
        const orderedQty = Number(item.orderedQuantity || 0);
        const newQty = Math.max(0, currentQty - orderedQty); // لضمان عدم نزول المخزون تحت الصفر

        batch.update(productRef, {
          quantity: newQty,
          status: newQty > 0 ? 'available' : 'out_of_stock',
          updatedAt: window.firestoreUtils.serverTimestamp()
        });
      }
    });

    // تنفيذ الدفعة بالكامل برمجياً
    await batch.commit();

    // 3. فحص النواقص وإرسال تنبيهات للمدير
    itemsWithLivePrices.forEach(item => {
      const prodId = item.productId || item.originalId;
      const product = (window.products || []).find(p => p.id === prodId);
      if (product) {
        const newQty = Math.max(0, Number(product.quantity || 0) - Number(item.orderedQuantity || 0));
        const threshold = Number(product.minThreshold || 5);
        
        if (newQty <= threshold) {
          const title = newQty === 0 ? "🚨 نفاذ مخزون" : "⚠️ تنبيه نقص مخزون";
          const msg = `المنتج "${product.name}" وصل للحد الحرِج. الكمية المتبقية: ${newQty}`;
          window.createNotification(title, msg, "warning", "alert-triangle", "جرد المخزن", () => window.showAdminSubTab('i'));
        }
      }
    });

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
    snap.docChanges().forEach((change) => {
      if (change.type === "modified") {
        const order = change.doc.data();
        const statusMap = {
          processing: 'جاري التجهيز',
          shipped: 'خرج للتوصيل',
          delivered: 'تم التسليم',
          cancelled: 'ملغي'
        };
        if (statusMap[order.status]) {
           const title = `تحديث الطلب #${order.orderNumber}`;
           const msg = `حالة طلبك الآن هي: ${statusMap[order.status]}`;
           window.showNotification(msg);
           if (window.addNotificationToPanel) window.addNotificationToPanel(title, msg, 'success', 'package');
        }
      }
    });

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
    window.allAdminOrders = orders; // حفظ الطلبات للبحث لاحقاً
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
        <td class="py-2 text-left font-bold text-slate-600">${Number(item.basePrice || item.price || 0).toFixed(2)} <span class="currency-shic text-[8px] opacity-70">EGP</span></td>
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
                    التاريخ: ${order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }) : new Date().toLocaleDateString('ar-EG')}
                </p>
                <p class="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                    <i data-lucide="clock" class="w-3 h-3"></i> 
                    الوقت: ${order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : new Date().toLocaleTimeString('ar-EG')}
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
           <span class="text-lg font-black text-emerald-900 underline decoration-emerald-500 decoration-2 underline-offset-4">${Number(order.totalAmount || 0).toFixed(2)} <span class="currency-shic">EGP</span></span>
        </div>

        </style>
        <!-- ختم الفاتورة للطباعة (يظهر فقط عند الطباعة) -->
        <div class="hidden print:block pt-10 text-center text-slate-500 text-xs">
            <style>@page { size: auto; margin: 0mm; }</style>
            <p>شكراً لتسوقكم معنا!</p>
        </div>

        <div class="flex gap-2 pt-3 border-t border-dashed print:hidden flex-wrap">
          <button onclick="window.printInvoice('invoice-${order.id}')" class="flex-1 p-2.5 bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center gap-2" title="طباعة الفاتورة أو حفظ كـ PDF">
             <i data-lucide="printer" class="w-4 h-4"></i> طباعة الفاتورة
          </button>
          
          ${isAdmin ? `
            <select onchange="updateOrderStatus('${order.id}', this.value)" class="flex-1 bg-slate-50 text-[10px] font-bold p-2.5 rounded-xl outline-none border border-slate-100 transition-colors focus:border-emerald-300">
              <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>⏳ مراجعة</option>
              <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>⚙️ تجهيز</option>
              <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>🚚 توصيل</option>
              <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>✅ تسليم</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ إلغاء</option>
            </select>
            <a href="tel:${order.customerPhone}" class="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-all active:scale-90 flex items-center justify-center" title="اتصال بالعميل">
               <i data-lucide="phone" class="w-4 h-4"></i>
            </a>
            <button onclick="window.deleteOrder('${order.id}')" class="p-2.5 bg-red-50 text-red-600 rounded-xl border border-red-100 hover:bg-red-100 transition-all active:scale-90 flex items-center justify-center" title="حذف الطلب">
               <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join("");
  if (window.lucide) lucide.createIcons();
}

// جعل دالة العرض متاحة للبحث من لوحة التحكم
window.renderOrdersList = renderOrdersList;

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

export async function deleteOrder(id) {
  if (!confirm("هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.")) {
    return;
  }
  try {
    const orderRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "orders", id);
    await window.firestoreUtils.deleteDoc(orderRef);
    window.showToast("تم حذف الطلب بنجاح", "success");
  } catch (e) {
    window.showToast("فشل في حذف الطلب", "error");
    console.error("Error deleting order:", e);
  }
}

/**
 * إدارة نظام الإشعارات العالمي والمتابعة
 */
window.addNotificationToPanel = (title, message, type = 'info', icon = 'bell') => {
  const list = document.getElementById('notifications-list');
  if (!list) return;

  if (list.querySelector('.text-slate-400') || list.innerHTML.includes('لا توجد إشعارات')) {
    list.innerHTML = '';
  }

  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const item = document.createElement('div');
  item.className = 'px-6 py-5 hover:bg-slate-50/80 transition-all cursor-pointer group flex gap-4 border-b border-slate-50 last:border-0 active:bg-slate-100';
  item.onclick = () => {
      window.showTab('tracking'); // الانتقال لصفحة طلباتي عند الضغط
      if (window.toggleNotificationPanel) window.toggleNotificationPanel();
  };
  
  item.innerHTML = `
    <div class="w-12 h-12 rounded-[1.25rem] relative flex items-center justify-center shrink-0 ${type === 'success' ? 'bg-emerald-50 text-emerald-600 shadow-sm border border-emerald-100' : 'bg-blue-50 text-blue-600 shadow-sm border border-blue-100'}">
        <i data-lucide="${icon}" class="w-5 h-5"></i>
        <div class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm animate-pulse"></div>
    </div>
    <div class="flex-1">
        <div class="flex justify-between items-start mb-0.5">
            <h4 class="font-black text-slate-800 text-xs">${title}</h4>
            <span class="text-[9px] text-slate-400 font-bold">${time}</span>
        </div>
        <p class="text-[11px] text-slate-500 font-semibold leading-relaxed">${message}</p>
    </div>
  `;
  
  list.prepend(item);
  if (window.lucide) lucide.createIcons();
  
  if (window.playNotificationSound) window.playNotificationSound();
  const badge = document.getElementById('header-notification-badge');
  if (badge) badge.classList.remove('hidden');
};

window.clearAllNotifications = () => {
  const list = document.getElementById('notifications-list');
  if (list) {
    list.innerHTML = `<div class="px-6 py-8 text-center text-slate-400 flex flex-col items-center gap-2"><i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i><p class="font-bold text-sm">لا توجد إشعارات حالياً</p></div>`;
    if (window.lucide) lucide.createIcons();
  }
  const badge = document.getElementById('header-notification-badge');
  if (badge) badge.classList.add('hidden');
};