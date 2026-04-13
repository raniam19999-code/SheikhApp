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

export async function addToCart(id, name, price, unit) {
  const product = window.products.find(p => p.id === id);
  if (!product) {
      return window.showToast("خطأ: المنتج غير موجود", "error");
  }
  
  if (product.status === 'out_of_stock') {
      return window.showToast("عذراً، المنتج غير متوفر حالياً", "error");
  }

  const qty = parseFloat(document.getElementById(`qty-${id}`)?.value || 1);
  if (window.currentUser && !window.currentUser.isAnonymous) {
    // حفظ الوحدة المختارة لتمييزها في قاعدة البيانات
    const cartRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "users", window.currentUser.uid, "cartItems");
    await window.firestoreUtils.addDoc(cartRef, { 
        productId: id, productName: `${name} (${unit})`, 
        basePrice: price, orderedQuantity: qty, selectedUnit: unit 
    });
  } else {
    window.cart.push({ id: id + unit, originalId: id, name: `${name} (${unit})`, basePrice: price, orderedQuantity: qty, unit, sub: price * qty });
  }
  window.showNotification(`تمت إضافة ${name}`);
  updateCartBadge();
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
    const sub = (item.basePrice || item.price) * item.orderedQuantity;
    total += sub;
    return `<div class="bg-white p-4 rounded-3xl border flex items-center justify-between">
      <div><p class="font-black text-sm">${item.productName || item.name}</p><p class="text-primary font-bold">${sub} ج.م</p></div>
      <div class="flex items-center gap-4">
        <span class="bg-emerald-50 px-3 py-1 rounded-xl text-xs font-bold">${item.orderedQuantity}</span>
        <button onclick="removeFromCart('${item.id}')" class="text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    </div>`;
  }).join("");
  document.getElementById("total").innerText = total.toFixed(2);
  lucide.createIcons();
}

export async function removeFromCart(id) {
  if (window.currentUser && !window.currentUser.isAnonymous) {
    await window.firestoreUtils.deleteDoc(window.firestoreUtils.doc(window.db, "artifacts", window.appId, "users", window.currentUser.uid, "cartItems", id));
  } else { window.cart = window.cart.filter(x => x.id !== id); }
  renderCart();
  updateCartBadge();
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