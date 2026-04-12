/* ========================================================
   app.js: النقطة المركزية والربط بين الموديولات
======================================================== */
import * as Auth from './auth.js';
import * as UI from './ui-utils.js';
import * as Cart from './cart-logic.js';
import * as Orders from './order-logic.js';
import * as Admin from './admin-logic.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  where,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const fallbackConfig = {
  apiKey: "AIzaSyBi-nX2Cnqhgg76Q5B7QyMRG_uZGmwObvc",
  authDomain: "awladelshhapp.firebaseapp.com",
  projectId: "awladelshhapp",
  storageBucket: "awladelshhapp.firebasestorage.app",
  messagingSenderId: "147401675150",
  appId: "1:147401675150:web:1b77481edabf26cfe1d4df",
};

const firebaseConfig =
  typeof __firebase_config !== "undefined" && __firebase_config
    ? JSON.parse(__firebase_config)
    : fallbackConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId =
  typeof __app_id !== "undefined" && __app_id ? __app_id : "awladelshhapp";

window.db = db;
window.auth = auth;
window.appId = appId;
window.PRIMARY_ADMIN_EMAIL = "raniam19999@gmail.com";

window.firestoreUtils = {
  collection,
  addDoc,
  onSnapshot,
  query,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  where,
  getDocs,
  writeBatch,
};
window.authUtils = {
  signInAnonymously,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
};

// State
window.userFirestoreCart = [];
window.cart = [];
window.products = [];
window.categories = [];
window.currentUser = null;
window.authMode = "login";
window.editingId = null;
window.editingType = null;
window.unsubs = {};
window.notifications = [];
window.modalAuthMode = "login";
let loadAttempts = 0; // تعريف المتغير المفقود لضمان عمل الـ Interval

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
  const installBanner = document.getElementById('install-banner');
  if (installBanner) installBanner.classList.remove('hidden');
});

async function startApp() {
  lucide.createIcons();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js'); } catch (e) {}
  }

  await Auth.initAuth();
  window.currentParentId = null;
  window.activeSubCategoryName = null;

  // منع المتصفح من ملء خانة البحث تلقائياً ببيانات الحساب المحفوظة
  setTimeout(() => {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.value = "";
      searchInput.setAttribute("autocomplete", "off");
      searchInput.setAttribute("readonly", "true");
      searchInput.blur(); // سحب التركيز لمنع المتصفح من عرض المقترحات فوراً
    }
  }, 500);

  if (!window.unsubs.categories) window.unsubs.categories = listenToCategories();
  if (!window.unsubs.products) window.unsubs.products = listenToProducts();
  await initializeDefaultCategories();
  Auth.listenToAuth();
}

async function initializeDefaultCategories() {
  try {
    const defaultBranches = [
      { name: "الثلاجة", img: "/img/ثلاجه", parentId: "" }, { name: "البقالة", img: "", parentId: "" },
      { name: "المنظفات", img: "", parentId: "" }, { name: "المشروبات", img: "", parentId: "" },
    ];
    const categoriesRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "categories");
    const existingCategories = await window.firestoreUtils.getDoc(window.firestoreUtils.doc(categoriesRef, "init_check"));
    if (!existingCategories.exists()) {
      for (const category of defaultBranches) { await window.firestoreUtils.addDoc(categoriesRef, category); }
      await window.firestoreUtils.setDoc(window.firestoreUtils.doc(categoriesRef, "init_check"), { initialized: true });
    }
  } catch (error) {
      console.error("Initialization Error:", error);
  }
}

function listenToProducts() {
  const q = window.firestoreUtils.query(window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "products"));
  return window.firestoreUtils.onSnapshot(q, (snap) => {
    window.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // تم التعديل لإرسال البيانات مباشرة للدالة
    window.renderProducts(window.products);
    
    // تحديث واجهة المخزن إذا كان المدير يشاهدها
    if (document.body.classList.contains("is-admin")) Admin.renderAdminProducts();
    
    // تحديث شارة الطلبات للمدير في كل مرة تتغير فيها البيانات (اختياري)
    if (window.currentUserRole === "admin" && window.listenToOrders) window.listenToOrders();
  });
}

function listenToCategories() {
  const q = window.firestoreUtils.query(window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "categories"));
  return window.firestoreUtils.onSnapshot(q, (snap) => {
    window.categories = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.id !== "init_check");
    Admin.renderCategories();
    Admin.updateCategorySelects();
    if (document.body.classList.contains("is-admin")) Admin.renderAdminCategories();
  });
}

window.renderProducts = function(productsToRender = window.products) {
    const grid = document.getElementById("products-grid");
    if (!grid) return;

    if (productsToRender.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-20 text-slate-400 font-bold">لا توجد منتجات حالياً في هذا القسم</div>`;
        return;
    }

    grid.innerHTML = productsToRender.map(p => {
        const isOutOfStock = p.status === 'out_of_stock' || (p.quantity <= 0);
        const priceBlock = window.renderPriceBlock ? window.renderPriceBlock(p) : `<p>${p.price} ج.م</p>`;
        
        return `
        <div class="bg-white rounded-[2rem] p-3 border border-slate-100 shadow-sm hover:shadow-md transition-all group relative ${isOutOfStock ? 'opacity-75' : ''}">
            ${isOutOfStock ? '<span class="absolute top-2 left-2 bg-red-500 text-white text-[8px] px-2 py-1 rounded-full z-20 font-bold">نفذت الكمية</span>' : ''}
            
            <div class="relative h-32 mb-3 rounded-2xl overflow-hidden bg-slate-50">
                <img src="${p.img || 'img/logo.png'}" class="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" loading="lazy">
            </div>

            <div class="px-1">
                <p class="text-[10px] text-emerald-600 font-bold mb-1">${p.category || 'عام'}</p>
                <h4 class="font-bold text-slate-800 text-xs mb-1 truncate">${p.name}</h4>
                
                <!-- نظام التسعير المزدوج -->
                <div class="product-price-wrapper">
                    ${priceBlock}
                </div>

                <div class="mt-3 flex items-center gap-2">
                    <div class="flex-1 flex items-center bg-slate-50 rounded-xl border border-slate-100">
                        <button onclick="this.nextElementSibling.stepUp()" class="p-2 text-slate-400 hover:text-emerald-600">+</button>
                        <input type="number" id="qty-${p.id}" value="1" min="1" class="w-full bg-transparent text-center text-xs font-black text-slate-700 outline-none">
                        <button onclick="this.previousElementSibling.stepDown()" class="p-2 text-slate-400 hover:text-red-500">-</button>
                    </div>
                    
                    <button 
                        onclick="window.addToCart('${p.id}', '${p.name}', ${p.price}, 'piece')"
                        data-id="${p.id}"
                        class="add-to-cart-btn p-3 bg-[#1B4332] text-white rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-90 transition-all ${isOutOfStock ? 'grayscale cursor-not-allowed' : ''}"
                        ${isOutOfStock ? 'disabled' : ''}
                    >
                        <i data-lucide="shopping-cart" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join("");

    if (window.lucide) lucide.createIcons();
};

function searchProducts(term) {
  if (!term) return window.renderProducts(window.products);
  const filtered = window.products.filter(p => p.name.toLowerCase().includes(term.toLowerCase()) || (p.category && p.category.toLowerCase().includes(term.toLowerCase())));
  document.getElementById("current-category-title").innerHTML = `<i data-lucide="search" class="w-5 h-5 text-emerald-500"></i> نتائج البحث`;
  window.renderProducts(filtered);
}

window.filterByStatus = function(status) {
    if (status === 'all') return window.renderProducts(window.products);
    const filtered = window.products.filter(p => p.status === status);
    window.renderProducts(filtered);
};

window.processImageUrl = async function(url, previewId, hiddenInputId) {
    if (!url) return;

    let targetUrl = url;
    // استخراج رابط الصورة الحقيقي إذا كان الرابط من نتائج بحث جوجل (imgurl parameter)
    try {
        const urlObj = new URL(url);
        if (urlObj.searchParams.has('imgurl')) {
            targetUrl = urlObj.searchParams.get('imgurl');
        }
    } catch (e) {
        // ليس رابطاً صالحاً أو لا يحتوي على معايير، نستخدم الرابط كما هو
    }

    const previewImg = document.getElementById(previewId);
    const placeholder = document.getElementById(previewId.replace('preview', 'placeholder'));
    const hiddenInput = document.getElementById(hiddenInputId);
    
    if (window.showToast) window.showToast("جاري جلب الصورة...", "info", 2000);
    
    try {
        const img = new Image();
        img.setAttribute('crossOrigin', 'anonymous'); 
        
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxWidth = 800; 
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (maxWidth / width) * height; width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            try {
                const dataURL = canvas.toDataURL('image/jpeg', 0.7);
                previewImg.src = dataURL;
                previewImg.classList.remove('hidden');
                if (placeholder) placeholder.classList.add('hidden');
                if (hiddenInput) hiddenInput.value = dataURL;
                window.showToast("تم تحويل الصورة بنجاح", "success");
            } catch (canvasErr) {
                console.warn("CORS issue - using direct URL");
                previewImg.src = targetUrl;
                previewImg.classList.remove('hidden');
                if (placeholder) placeholder.classList.add('hidden');
                if (hiddenInput) hiddenInput.value = targetUrl; 
            }
        };
        img.onerror = () => {
            window.showToast("رابط الصورة غير صالح أو غير مدعوم", "error");
        };
        img.src = targetUrl;
    } catch (e) {
        console.error("Image processing error:", e);
    }
};

// دالة معالجة رفع الصور من الجهاز وتحويلها لـ Base64
window.handleImageUpload = function(event, previewId, hiddenInputId, maxSize = 800) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxSize) {
                height *= maxSize / width;
                width = maxSize;
            }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            
            const base64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById(previewId).src = base64;
            document.getElementById(previewId).classList.remove('hidden');
            if (document.getElementById(previewId.replace('preview', 'placeholder'))) {
                document.getElementById(previewId.replace('preview', 'placeholder')).classList.add('hidden');
            }
            document.getElementById(hiddenInputId).value = base64;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

window.sortProducts = function(criteria) {
    // منطق الترتيب حسب السعر أو الأكثر مبيعاً
};

function isAdminUser() {
  return window.currentUser && !window.currentUser.isAnonymous && window.currentUserRole === "admin";
}

window.applyProductImageUrl = () => {
    const url = document.getElementById('p-img-url').value;
    window.processImageUrl(url, 'p-img-preview', 'p-img-base64');
};

window.applyCategoryImageUrl = () => {
    const url = document.getElementById('c-img-url').value;
    window.processImageUrl(url, 'c-img-preview', 'c-img-base64');
};

function ensureAdmin(action) {
  if (!isAdminUser()) { alert(`للمدير فقط: ${action}`); return false; }
  return true;
}

document.body.style.paddingBottom = "calc(5rem + env(safe-area-inset-bottom))";

const initInterval = setInterval(() => {
  if (window.db && window.auth) { clearInterval(initInterval); startApp(); }
  else if (loadAttempts++ > 50) { clearInterval(initInterval); alert("فشل تحميل Firebase."); }
}, 100);

const exposed = {
  ...Auth, ...UI, ...Cart, ...Orders, ...Admin,
  searchProducts, isAdminUser, ensureAdmin,
  handleShortageFileUpload: Admin.handleShortageFileUpload
};
Object.entries(exposed).forEach(([name, fn]) => { if (typeof fn === "function") window[name] = fn; });
