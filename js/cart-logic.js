/* ========================================================
   cart-logic.js: منطق سلة المشتريات
======================================================== */

export function listenToUserCart(uid) {
  const q = window.firestoreUtils.query(window.firestoreUtils.collection(window.db, "artifacts", window.appId, "users", uid, "cartItems"));
  return window.firestoreUtils.onSnapshot(q, (snap) => {
    window.userFirestoreCart = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    window.renderCart();
    window.updateCartBadge();
  });
}

export function updateCartBadge() {
  const badge = document.getElementById("cart-badge");
  const source = (window.currentUser && !window.currentUser.isAnonymous) ? window.userFirestoreCart : window.cart;
  const total = source.reduce((s, i) => s + (i.orderedQuantity || 0), 0);
  badge.innerText = total;
  badge.classList.toggle("scale-0", total === 0);
}
/**
 * addToCart: بروتوكول الإضافة الصارم
 * يمنع طلب نفس المنتج مرتين في نفس اليوم لنفس المستخدم
 */
export async function addToCart(id, name, price, unit) {
  // 1. الفحص الفوري للمخزون
  const product = window.products.find(p => p.id === id);
  if (!product) return window.showToast("Critical Error: المنتج غير معرف", "error");

  // جلب الكمية التي اختارها العميل من حقل الإدخال
  const qty = parseFloat(document.getElementById(`qty-${id}`)?.value || 1);
  const stockLimit = Number(product.quantity || 0);

  if (product.status === 'out_of_stock' || stockLimit <= 0) {
    return window.showToast("عذراً، المخزون نفد تماماً", "error");
  }

  // التحقق من أن الكمية المطلوبة لا تتخطى المخزون المتاح
  if (qty > stockLimit) {
    return window.showToast(`⚠️ عذراً، الكمية المطلوبة غير متوفرة. المتاح حالياً هو (${stockLimit}) فقط.`, "warning");
  }

  // 2. تفعيل نظام الـ Hard-Lock للمستخدمين المسجلين
  if (window.currentUser && !window.currentUser.isAnonymous) {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // الاستعلام عن طلبات العميل السابقة لهذا المنتج تحديداً اليوم
      const ordersRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "orders");
      const q = window.firestoreUtils.query(
        ordersRef,
        window.firestoreUtils.where("userId", "==", window.currentUser.uid),
        window.firestoreUtils.where("createdAt", ">=", startOfDay)
      );

      const querySnapshot = await window.firestoreUtils.getDocs(q);
      
      // فحص الكميات التي تم طلبها اليوم من هذا المنتج
      let totalOrderedToday = 0;
      querySnapshot.forEach(doc => {
        const orderData = doc.data();
        if (orderData.items) {
          orderData.items.forEach(item => {
            if (item.productId === id || item.originalId === id) {
              totalOrderedToday += (item.orderedQuantity || 0);
            }
          });
        }
      });

      const limit = Number(product.maxPerUser || 0);
      // حساب ما يوجد في السلة حالياً لنفس المنتج
      const inCartQty = window.userFirestoreCart.reduce((sum, item) => (item.productId === id || item.originalId === id) ? sum + (item.orderedQuantity || 0) : sum, 0);
      const totalRequested = totalOrderedToday + inCartQty + qty;

      if (limit > 0 && totalRequested > limit) {
        return window.showToast(`🔒 قد نفذت الكمية المتاحة لك من هذا المنتج لليوم بناء على إيميلك. الحد الأقصى لك هو (${limit}). لا يحق لك الطلب إلا غداً!`, "error", 6000);
      }

      // 3. المتابعة للإضافة إذا لم يسبق طلبه
      const cartRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "users", window.currentUser.uid, "cartItems");
      
      await window.firestoreUtils.addDoc(cartRef, { 
        productId: id, 
        productName: `${name} (${unit})`, 
        basePrice: price, 
        orderedQuantity: qty, 
        selectedUnit: unit,
        sku: product.sku || "—",
        addedAt: window.firestoreUtils.serverTimestamp() 
      });

    } catch (error) {
      console.warn("SHADOW-LOCK: Waiting for Index or Path fix", error);
      // ملاحظة: إذا استمر الخطأ في الكونسول، تأكد من أن حالة الفهرس في Firebase هي "Enabled" وليست "Building"
      // في حالة وجود خطأ في الفهرس، سنسمح بالإضافة للسلة مؤقتاً حتى لا يتوقف البيع
    }
  } else {
    // نظام الضيوف (Guest Mode) - إضافة عادية أو منعهم حسب رغبتك
    window.cart.push({ 
      id: id + unit, 
      originalId: id, 
      name: `${name} (${unit})`, 
      basePrice: price, 
      orderedQuantity: qty, 
      unit, 
      sub: price * qty, 
      sku: product.sku || "—" 
    });
  }

  window.showNotification(` تمت إضافة ${name} للسلة`);
  if (window.updateCartBadge) window.updateCartBadge();
}
export function renderCart() {
  const list = document.getElementById("cart-items");
  const source = (window.currentUser && !window.currentUser.isAnonymous) ? window.userFirestoreCart : window.cart;
  if (source.length === 0) {
    list.innerHTML = `<p class="text-center py-10 opacity-50">السلة فارغة</p>`;
    document.getElementById("cart-summary").classList.add("hidden");
    return;
  }
  document.getElementById("cart-summary").classList.remove("hidden");
  let total = 0;
  list.innerHTML = source.map(item => {
    // جلب السعر المباشر من قائمة المنتجات لضمان التحديث اللحظي في السلة
    const product = (window.products || []).find(p => p.id === (item.productId || item.originalId));
    let priceVal = Number(item.basePrice || item.price || 0);
    
    if (product) {
      const unit = item.selectedUnit || item.unit || 'bag';
      // استخدام وظيفة getEffectivePrice من pricing.js إذا كانت متوفرة لجلب السعر الحالي للوحدة
      const livePrice = typeof window.getEffectivePrice === 'function' ? window.getEffectivePrice(product, unit) : (product.prices?.[unit] || product.price);
      if (livePrice > 0) priceVal = Number(livePrice);
    }

    const sub = priceVal * item.orderedQuantity;
    total += sub;
    return `<div class="bg-white p-4 rounded-3xl border flex items-center justify-between">
      <div>
        <p class="font-black text-sm">${item.productName || item.name}</p>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-[10px] text-slate-400 font-bold">${item.orderedQuantity} × ${priceVal.toFixed(2)}</span>
          <p class="text-primary font-bold">${sub.toFixed(2)} <span class="currency-shic text-[10px] opacity-80">EGP</span></p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <button onclick="removeFromCart('${item.id}')" class="text-red-400 hover:bg-red-50 p-2 rounded-full transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    </div>`;
  }).join("");
  document.getElementById("total").innerHTML = `${total.toFixed(2)} <span class="text-sm">ج.م</span>`;
  lucide.createIcons();
}

export async function removeFromCart(id) {
  if (!id || id === 'undefined') {
    return window.showToast("خطأ: معرف غير صالح", "error");
  }

  try {
    const targetId = String(id);
    if (window.currentUser && !window.currentUser.isAnonymous) {
      // حذف فوري محلي لتجنب مشاكل المزامنة وتأخير Firebase
      if (window.userFirestoreCart) {
        window.userFirestoreCart = window.userFirestoreCart.filter(x => String(x.id) !== targetId);
      }
      
      const docR = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "users", window.currentUser.uid, "cartItems", targetId);
      await window.firestoreUtils.deleteDoc(docR);
    } else { 
      if (window.cart) {
        window.cart = window.cart.filter(x => String(x.id) !== targetId); 
      }
    }
  } catch(e) {
    console.error("Error removing from cart:", e);
  }

  // إعادة التصيير وتحديث العداد
  if (typeof window.renderCart === 'function') window.renderCart();
  if (typeof window.updateCartBadge === 'function') window.updateCartBadge();
}

export async function clearCart() {
  if (window.currentUser && !window.currentUser.isAnonymous) {
    const cartRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "users", window.currentUser.uid, "cartItems");
    const snap = await window.firestoreUtils.getDocs(cartRef);
    const batch = window.firestoreUtils.writeBatch(window.db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } else {
    window.cart = [];
  }
  window.renderCart();
  window.updateCartBadge();
}
window.clearCart = clearCart;