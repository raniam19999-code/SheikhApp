/* ========================================================
   app.js: النقطة المركزية والربط بين الموديولات
======================================================== */
import * as Auth from "./js/auth.js";
import * as UI from "./js/ui-utils.js";
import * as Cart from "./js/cart-logic.js";
import * as Orders from "./js/order-logic.js";
import * as Admin from "./js/admin-logic.js";
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
window.currentFilter = { type: 'all', value: null }; 
window.currentParentId = null; // تتبع مستوى الأقسام (رئيسية أم فرعية)
let loadAttempts = 0; 

// نظام التحميل التدريجي (Pagination)
window.itemsPerPage = 10;
window.currentRenderLimit = 10;
window.lastRenderedProducts = []; 

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
  const installBanner = document.getElementById("install-banner");
  if (installBanner) installBanner.classList.remove("hidden");
});

window.renderCategories = function () {
  const container = document.getElementById("categories-container");
  if (!container) return;

  if (window.categories.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-slate-400 font-bold w-full">لا توجد أقسام</div>`;
    return;
  }

  // تصفية الأقسام حسب المستوى الحالي
  const filtered = window.categories.filter((c) => (c.parentId || null) === window.currentParentId);

  let html = "";
  
  // إضافة زر الرجوع إذا كنا في مستوى فرعي
  if (window.currentParentId) {
    html += `
      <div onclick="window.navigateBackCategories()" class="flex flex-col items-center gap-3 shrink-0 cursor-pointer group snap-item">
        <div class="w-28 sm:w-32 h-28 sm:h-32 rounded-[2.5rem] bg-slate-50 shadow-md border-2 border-slate-100 flex items-center justify-center overflow-hidden group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-500 group-hover:-translate-y-2 transition-all duration-500">
          <i data-lucide="arrow-right" class="w-10 h-10 group-hover:scale-125 transition-transform duration-500"></i>
        </div>
        <span class="text-[11px] sm:text-xs font-black text-slate-400 group-hover:text-emerald-700 transition-colors uppercase tracking-wide">رجوع</span>
      </div>
    `;
  }

  html += filtered.map(
      (c) => {
        const hasSubs = window.categories.some(child => child.parentId === c.id);
        return `
      <div onclick="window.handleCategoryClick('${c.id}', '${c.name}', ${hasSubs})" class="flex flex-col items-center gap-3 shrink-0 cursor-pointer group snap-item">
        <div class="cat-img-box relative w-28 sm:w-32 h-28 sm:h-32 rounded-full bg-slate-50 shadow-lg border-2 border-white overflow-hidden group-hover:shadow-2xl group-hover:border-emerald-200 group-hover:-translate-y-2 transition-all duration-500">
          <img src="${c.img || "img/logo.png"}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out" loading="lazy" onerror="this.src='img/logo.png'; this.classList.add('object-cover')">
          <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        </div>
        <span class="text-[11px] sm:text-xs font-black text-slate-700 truncate max-w-[100px] group-hover:text-emerald-700 transition-colors uppercase tracking-wide">${c.name}</span>
      </div>
        `;
      }
    )
    .join("");

  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
};

window.handleCategoryClick = function(catId, catName, hasSubs) {
  if (hasSubs) {
    // إذا كان له أقسام فرعية، ننتقل للمستوى التالي
    window.currentParentId = catId;
    window.renderCategories();
    // اختياري: فلترة المنتجات لتشمل كل ما يتبع هذا القسم الرئيسي حالياً
    window.filterByCategory(catId, catName);
  } else {
    // إذا كان قسماً نهائياً، نفلتر المنتجات فقط
    window.filterByCategory(catId, catName);
  }
};

window.navigateBackCategories = function() {
  window.currentParentId = null;
  window.renderCategories();
};

window.renderProducts = function (productsToRender = window.products) {
  const grid = document.getElementById("products-grid");
  const loadMoreBtn = document.getElementById("load-more-container");
  if (!grid) return;

  // حفظ النسخة الحالية للرجوع إليها عند ضغط "عرض المزيد"
  window.lastRenderedProducts = productsToRender;

  if (productsToRender.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-20 text-slate-400 font-bold">لا توجد منتجات حالياً في هذا القسم</div>`;
    if (loadMoreBtn) loadMoreBtn.classList.add("hidden");
    return;
  }

  // تطبيق الحد الأقصى للعرض
  const visibleProducts = productsToRender.slice(0, window.currentRenderLimit);
  
  // إخفاء أو إظهار زر "عرض المزيد"
  if (loadMoreBtn) {
    if (productsToRender.length > window.currentRenderLimit) {
      loadMoreBtn.classList.remove("hidden");
    } else {
      loadMoreBtn.classList.add("hidden");
    }
  }

  grid.innerHTML = visibleProducts
    .map((p) => {
      const isOutOfStock = p.status === "out_of_stock" || p.quantity <= 0;
      const priceBlock = window.renderPriceBlock
        ? window.renderPriceBlock(p)
        : `<p class="font-bold text-slate-800">${p.price || 0} ج.م</p>`;

      return `
        <div class="bg-white rounded-[2.5rem] p-4 border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-emerald-100/50 hover:-translate-y-1.5 transition-all duration-500 group relative ${isOutOfStock ? "opacity-75" : ""}">
            ${isOutOfStock ? '<span class="absolute top-3 left-3 bg-red-500 text-white text-[8px] px-2.5 py-1 rounded-full z-20 font-black shadow-lg">نفذت الكمية</span>' : ""}
            
            <div class="relative h-40 sm:h-44 mb-4 rounded-[2rem] overflow-hidden bg-slate-50 border border-slate-50 shadow-inner">
                <img src="${p.img || "img/logo.png"}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" loading="lazy">
                <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>

            <div class="px-1 text-right">
                <p class="text-[10px] text-emerald-600 font-black mb-1.5 tracking-wide uppercase">${p.category || "عام"}</p>
                <h4 class="font-bold text-slate-800 text-sm mb-2 leading-tight group-hover:text-emerald-700 transition-colors">${p.name}</h4>
                
                <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono mb-3 bg-slate-50/80 px-3 py-2 rounded-2xl border border-slate-100/60 shadow-sm">
                    <span class="flex items-center gap-1.5"><i data-lucide="tag" class="w-3.5 h-3.5 text-slate-400"></i> ${p.sku || "---"}</span>
                    <span class="flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">${p.unitMeasurement || p.quantity || "متوفر"}</span>
                </div>
                
                <div class="product-price-wrapper mb-4">
                    ${priceBlock}
                </div>

                <div class="mt-4 flex items-center gap-2.5">
                    <div class="flex-[1.2] flex items-center bg-slate-50/80 rounded-[1.25rem] border border-slate-100 p-1">
                        <button onclick="const inp=this.nextElementSibling; inp.stepUp();" class="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-lg transition-all active:scale-95">+</button>
                        <input type="number" id="qty-${p.id}" value="1" min="1" class="w-full bg-transparent text-center text-sm font-black text-slate-800 outline-none">
                        <button onclick="const inp=this.previousElementSibling; inp.stepDown();" class="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-all active:scale-95">-</button>
                    </div>
                    
                    <button 
                        onclick="window.addToCart('${p.id}', '${p.name}', ${p.price || 0}, 'piece')"
                        data-id="${p.id}"
                        class="add-to-cart-btn p-4 bg-[#1B4332] text-white rounded-[1.25rem] shadow-xl shadow-emerald-100 hover:bg-[#2D6A4F] hover:shadow-2xl hover:scale-105 active:scale-90 transition-all duration-300 ${isOutOfStock ? "grayscale cursor-not-allowed" : ""}"
                        ${isOutOfStock ? "disabled" : ""}
                    >
                        <i data-lucide="shopping-cart" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
        </div>`;
    })
    .join("");

  if (window.lucide) lucide.createIcons();
};

async function startApp() {
  if (window.lucide) window.lucide.createIcons();
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (e) {}
  }

  await Auth.initAuth();
  window.currentParentId = null;
  window.activeSubCategoryName = null;

  if (!window.unsubs.categories)
    window.unsubs.categories = listenToCategories();
  if (!window.unsubs.products) window.unsubs.products = listenToProducts();
  await initializeDefaultCategories();
  Auth.listenToAuth();
}

async function initializeDefaultCategories() {
  try {
    const categoryTree = [
      {
        name: "المنطفات والعناية بالمنزل",
        img: "img/logo.png",
        subs: ["مساحيق غسيل", "منظفات أطباق", "كلور ومطهرات", "ورقيات"]
      },
      {
        name: "المواد الغذائية",
        img: "img/logo.png",
        subs: ["زيوت وسمن", "مكرونة وأرز", "بقوليات", "معلبات", "صلصة وتوابل"]
      },
      {
        name: "المشروبات والعصائر",
        img: "img/logo.png",
        subs: ["شاي وقهوة", "عصائر", "مياه معدنية"]
      },
      {
        name: "الألبان والجبن",
        img: "img/logo.png",
        subs: ["أجبان", "ألبان", "زبادي"]
      }
    ];

    const categoriesRef = window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "categories",
    );

    const checkDoc = await window.firestoreUtils.getDoc(
      window.firestoreUtils.doc(categoriesRef, "init_check")
    );

    if (!checkDoc.exists()) {
      for (const main of categoryTree) {
        const mainData = { 
          name: main.name, 
          img: main.img, 
          parentId: "",
          updatedAt: window.firestoreUtils.serverTimestamp()
        };
        const mainRef = await window.firestoreUtils.addDoc(categoriesRef, mainData);
        
        for (const subName of main.subs) {
          await window.firestoreUtils.addDoc(categoriesRef, {
            name: subName,
            img: "",
            parentId: mainRef.id,
            updatedAt: window.firestoreUtils.serverTimestamp()
          });
        }
      }

      await window.firestoreUtils.setDoc(
        window.firestoreUtils.doc(categoriesRef, "init_check"),
        { initialized: true, version: 2 } // تم تحديث الإصدار لضمان التحقق
      );
      
      window.showToast?.("تم تهيئة الأقسام الجديدة بنجاح", "success");
    }
  } catch (error) {
    console.error("Initialization Error:", error);
  }
}

function listenToProducts() {
  const q = window.firestoreUtils.query(
    window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "products",
    ),
  );
  return window.firestoreUtils.onSnapshot(q, (snap) => {
    window.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // تم التعديل لإرسال البيانات مباشرة للدالة
    // تحديث العرض بناءً على الفلتر الحالي بدلاً من إظهار الكل دائماً
    if (window.applyCurrentFilter) {
        window.applyCurrentFilter();
    } else {
        window.renderProducts(window.products);
    }

    
    if (document.body.classList.contains("is-admin")) {
        if (typeof Admin?.renderAdminProducts === "function") Admin.renderAdminProducts();
        if (typeof Admin?.renderInventoryAudit === "function") Admin.renderInventoryAudit();
    }
    if (
      window.currentUserRole === "admin" &&
      typeof Orders?.listenToOrders === "function"
    )
      Orders.listenToOrders();
  });
}

function listenToCategories() {
  const q = window.firestoreUtils.query(
    window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "categories",
    ),
  );
  return window.firestoreUtils.onSnapshot(q, (snap) => {
    window.categories = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.id !== "init_check");

    // رندرة الأقسام
    if (typeof window.renderCategories === "function")
      window.renderCategories();

    // تحديث القوائم المنسدلة للمدير
    if (typeof Admin?.updateCategorySelects === "function")
      Admin.updateCategorySelects();

    if (
      document.body.classList.contains("is-admin") &&
      typeof Admin?.renderAdminCategories === "function"
    )
      Admin.renderAdminCategories();
  });
}

window.filterByCategory = function (catId, catName) {
  window.currentFilter = { type: 'category', id: catId, name: catName }; 
  window.currentRenderLimit = window.itemsPerPage; // إعادة تعيين الحد عند تغيير القسم
  const filtered = window.products.filter(
    (p) => p.category === catName || p.categoryId === catId,
  );
  const title = document.getElementById("current-category-title");
  if (title) {
    title.innerHTML = `<i data-lucide="folder" class="w-5 h-5 text-emerald-500"></i> قسم: ${catName}`;
    if (window.lucide) lucide.createIcons();
  }
  window.renderProducts(filtered);
};

window.loadMoreProducts = function() {
    window.currentRenderLimit += window.itemsPerPage;
    window.renderProducts(window.lastRenderedProducts);
    
    // سكرول بسيط للأسفل لرؤية المنتجات الجديدة
    window.scrollBy({ top: 300, behavior: 'smooth' });
};

function searchProducts(term) {
  window.currentFilter = { type: 'search', value: term };
  window.currentRenderLimit = window.itemsPerPage; // إعادة تعيين الحد عند البحث
  if (!term) return window.renderProducts(window.products);
  const filtered = window.products.filter(
    (p) =>
      p.name.toLowerCase().includes(term.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(term.toLowerCase())),
  );
  const titleElem = document.getElementById("current-category-title");
  if (titleElem) {
    titleElem.innerHTML = `<i data-lucide="search" class="w-5 h-5 text-emerald-500"></i> نتائج البحث: ${term}`;
  }
  window.renderProducts(filtered);
}

window.filterByStatus = function (status) {
  window.currentFilter = { type: 'status', value: status };
  if (status === "all") return window.renderProducts(window.products);
  const filtered = window.products.filter((p) => p.status === status);
  window.renderProducts(filtered);
};

window.applyCurrentFilter = function () {
    const filter = window.currentFilter;
    if (!filter || filter.type === 'all') {
        window.renderProducts(window.products);
    } else if (filter.type === 'category') {
        const filtered = window.products.filter(
            (p) => p.category === filter.name || p.categoryId === filter.id,
        );
        window.renderProducts(filtered);
    } else if (filter.type === 'search') {
        const term = filter.value.toLowerCase();
        const filtered = window.products.filter(
            (p) =>
                p.name.toLowerCase().includes(term) ||
                (p.category && p.category.toLowerCase().includes(term)),
        );
        window.renderProducts(filtered);
    } else if (filter.type === 'status') {
        if (filter.value === 'all') {
            window.renderProducts(window.products);
        } else {
            const filtered = window.products.filter((p) => p.status === filter.value);
            window.renderProducts(filtered);
        }
    }
};

window.processImageUrl = async function (url, previewId, hiddenInputId) {
  if (!url) return;

  let targetUrl = url;
  // استخراج رابط الصورة الحقيقي إذا كان الرابط من نتائج بحث جوجل (imgurl parameter)
  try {
    const urlObj = new URL(url);
    if (urlObj.searchParams.has("imgurl")) {
      targetUrl = urlObj.searchParams.get("imgurl");
    }
  } catch (e) {
    // ليس رابطاً صالحاً أو لا يحتوي على معايير، نستخدم الرابط كما هو
  }

  const previewImg = document.getElementById(previewId);
  const placeholder = document.getElementById(
    previewId.replace("preview", "placeholder"),
  );
  const hiddenInput = document.getElementById(hiddenInputId);

  if (window.showToast) window.showToast("جاري جلب الصورة...", "info", 2000);

  try {
    const img = new Image();
    img.setAttribute("crossOrigin", "anonymous");

    img.onload = function () {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const maxWidth = 500; // تم تقليل العرض من 800 لزيادة السرعة
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const dataURL = canvas.toDataURL("image/jpeg", 0.5);
        previewImg.src = dataURL;
        previewImg.classList.remove("hidden");
        if (placeholder) placeholder.classList.add("hidden");
        if (hiddenInput) hiddenInput.value = dataURL;
        window.showToast("تم تحويل الصورة وضغطها بنجاح ✅", "success");
      } catch (canvasErr) {
        console.warn("CORS issue - using direct URL");
        previewImg.src = targetUrl;
        previewImg.classList.remove("hidden");
        if (placeholder) placeholder.classList.add("hidden");
        // حفظ الرابط المباشر إذا فشل التحويل (CORS)
        if (hiddenInput) hiddenInput.value = targetUrl;
        window.showToast("تم استخدام الرابط المباشر - الصورة جاهزة للحفظ ✅", "success");
      }
    };
    img.onerror = () => {
      window.showToast("رابط الصورة غير صالح أو لا يسمح بالعرض الخارجي ❌", "error");
    };
    img.src = targetUrl;
  } catch (e) {
    console.error("Image processing error:", e);
  }
};

// دالة معالجة رفع الصور من الجهاز وتحويلها لـ Base64
window.handleImageUpload = function (
  event,
  previewId,
  hiddenInputId,
  maxSize = 800,
) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxSize) {
        height *= maxSize / width;
        width = maxSize;
      }
      // تقليل العرض الأقصى للصور المرفوعة يدوياً أيضاً إذا لم يتم تحديده
      const finalWidth = Math.min(width, 500);
      const finalHeight = (finalWidth / width) * height;

      canvas.width = finalWidth;
      canvas.height = finalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0, finalWidth, finalHeight);

      const base64 = canvas.toDataURL("image/jpeg", 0.5);
      document.getElementById(previewId).src = base64;
      document.getElementById(previewId).classList.remove("hidden");
      if (
        document.getElementById(previewId.replace("preview", "placeholder"))
      ) {
        document
          .getElementById(previewId.replace("preview", "placeholder"))
          .classList.add("hidden");
      }
      document.getElementById(hiddenInputId).value = base64;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.sortProducts = function (criteria) {
  // منطق الترتيب حسب السعر أو الأكثر مبيعاً
};

function isAdminUser() {
  return (
    window.currentUser &&
    !window.currentUser.isAnonymous &&
    window.currentUserRole === "admin"
  );
}

window.applyProductImageUrl = () => {
  const url = document.getElementById("p-img-url").value;
  window.processImageUrl(url, "p-img-preview", "p-img-base64");
};

window.applyCategoryImageUrl = () => {
  const url = document.getElementById("c-img-url").value;
  window.processImageUrl(url, "c-img-preview", "c-img-base64");
};

function ensureAdmin(action) {
  if (!isAdminUser()) {
    alert(`للمدير فقط: ${action}`);
    return false;
  }
  return true;
}

document.body.style.paddingBottom = "calc(5rem + env(safe-area-inset-bottom))";

const initInterval = setInterval(() => {
  if (window.db && window.auth) {
    clearInterval(initInterval);
    startApp();
  } else if (loadAttempts++ > 50) {
    clearInterval(initInterval);
    alert("فشل تحميل Firebase.");
  }
}, 100);

const exposed = {
  ...Auth,
  ...UI,
  ...Cart,
  ...Orders,
  ...Admin,
  searchProducts,
  isAdminUser,
  ensureAdmin,
  handleBulkFileUpload: Admin.handleBulkFileUpload,
};
Object.entries(exposed).forEach(([name, fn]) => {
  if (typeof fn === "function") window[name] = fn;
});
