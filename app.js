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
  setPersistence,
  browserLocalPersistence,
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
  limit,
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

// منع إعادة تهيئة Firebase إذا كانت موجودة بالفعل (لحل التحذيرات)
let app;
try {
  if (!window.firebaseApp) {
    app = initializeApp(firebaseConfig);
    window.firebaseApp = app;
  } else {
    app = window.firebaseApp;
  }
} catch (e) {
  console.error("Firebase Init Error:", e);
  app = window.firebaseApp;
}

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
  limit,
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
  setPersistence,
  browserLocalPersistence,
};

// دالة عالمية لتنظيف النصوص العربية لضمان مطابقة ذكية (تتجاهل الهمزات، التاء المربوطة، والتشكيل)
window.normalizeArabic = function (text) {
  if (!text) return "";
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/[ؤ]/g, "و")
    .replace(/[ًٌٍَُِّْ]/g, "") // إزالة حركات التشكيل والزخارف
    .replace(/\s+/g, " "); // توحيد المسافات
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
window.currentFilter = { type: "all", value: null };
window.currentParentId = null; // تتبع مستوى الأقسام (رئيسية أم فرعية)
let loadAttempts = 0;

// نظام التحميل التدريجي (Pagination)
window.itemsPerPage = 20;
window.currentRenderLimit = 20;
window.lastRenderedProducts = [];

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.deferredPrompt = e;

  // Show the banner after a short delay to ensure DOM is ready and doesn't interrupt loading
  setTimeout(() => {
    const installBanner = document.getElementById("install-banner");
    if (installBanner) installBanner.classList.remove("hidden");
  }, 2000);
});

window.renderCategories = function () {
  const container = document.getElementById("categories-container");
  if (!container) return;

  if (window.categories.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-slate-400 font-bold w-full">لا توجد أقسام</div>`;
    return;
  }

  // تصفية الأقسام للمستوى الرئيسي والترتيب الأبجدي
  const mainCats = window.categories
    .filter((c) => !c.parentId)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));

  let html = "";

  if (window.currentParentId === null) {
    // في الصفحة الرئيسية، نعرض الأقسام الرئيسية في الشريط العلوي
    html += mainCats
      .map((c) => {
        const hasSubs = window.categories.some(
          (child) => child.parentId === c.id,
        );
        return `
        <div onclick="window.handleCategoryClick('${c.id}', '${c.name}', ${hasSubs})" class="flex flex-col items-center gap-2 shrink-0 cursor-pointer group snap-item pb-2">
          <div class="category-card-premium mx-auto">
            <div class="category-image-fill" style="background-image: url('${c.img || "img/logo.png"}');"></div>
            <div class="absolute inset-0 bg-gradient-to-t from-[#1B4332]/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
          <span class="text-[11px] sm:text-[13px] font-black text-slate-800 text-center leading-tight max-w-[110px] group-hover:text-[#1B4332] transition-colors uppercase tracking-tight mt-1">${c.name}</span>
        </div>
        `;
      })
      .join("");
  }

  container.className =
    "flex gap-4 sm:gap-5 overflow-x-auto pb-4 pt-1 no-scrollbar scroll-smooth";
  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
};

window.handleCategoryClick = function (catId, catName, hasSubs) {
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

window.navigateBackCategories = function () {
  const filterCatId = window.currentFilter
    ? window.currentFilter.id || window.currentFilter.value
    : null;

  if (
    window.currentParentId !== null &&
    window.currentFilter &&
    window.currentFilter.type === "category" &&
    filterCatId !== window.currentParentId
  ) {
    // نحن داخل قسم فرعي (نعرض منتجاته). الرجوع خطوة للخلف یعنی الرجوع للقسم الرئيسي لعرض الأقسام الفرعية التابعة له.
    const parentCat = window.categories.find(
      (c) => c.id === window.currentParentId,
    );
    window.filterByCategory(
      window.currentParentId,
      parentCat ? parentCat.name : "",
    );
    window.renderCategories();
  } else {
    // نحن إما في قسم رئيسي أو أن هناك شيء آخر، الرجوع النهائي للصفحة الرئيسية
    window.currentParentId = null;
    window.currentFilter = { type: "all", value: "" };
    window.renderCategories();
    const title = document.getElementById("current-category-title");
    if (title) {
      title.innerHTML = `<i data-lucide="layers" class="w-5 h-5 text-[#1B4332]"></i> تصفح الأقسام الشاملة`;
      if (window.lucide) lucide.createIcons();
    }
    window.renderProducts(); // لأن currentFilter أصبح 'all'، سيتم عرض الأقسام الفرعية حسب التعديل الأخير
  }
};

window.renderProducts = function (productsToRender = window.products) {
  const grid = document.getElementById("products-grid");
  const loadMoreBtn = document.getElementById("load-more-container");
  const pw = document.getElementById("products-wrapper");
  if (!grid) return;

  // تصفية المنتجات غير المعتمدة للعملاء
  if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'reviewer') {
    productsToRender = productsToRender.filter(p => p.isApproved !== false);
  }

  if (pw) pw.classList.remove("hidden"); // دائماً نظهر شبكة المنتجات الآن، إما لفرعيات أو منتجات
  // حفظ النسخة الحالية للرجوع إليها عند ضغط "عرض المزيد"
  window.lastRenderedProducts = productsToRender;

  if (productsToRender.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-20 text-slate-400 font-bold">لا توجد منتجات حالياً في هذا القسم</div>`;
    if (loadMoreBtn) loadMoreBtn.classList.add("hidden");
    return;
  }

  // الترتيب الأبجدي للمنتجات
  productsToRender.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "ar"),
  );

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
        : `<p class="font-bold text-slate-800">${Number(p.price || 0).toFixed(2)} <span class="currency-shic">EGP</span> للـ كيس</p>`;

      const defaultPrice = window.getEffectivePrice
        ? window.getEffectivePrice(p, "bag")
        : p.price || 0;
      const safeName = p.name ? p.name.replace(/['"]/g, "") : "منتج";
      const maxQty = Number(p.quantity || 0);

      // التحقق من صلاحية المدير لإظهار زر التعديل السريع
      const isAdmin = document.body.classList.contains("is-admin");
      const editBtn = isAdmin
        ? `<div class="absolute top-3 right-3 flex flex-col gap-2 z-30">
            <button onclick="event.stopPropagation(); window.openProductModal(${JSON.stringify(p).replace(/"/g, "&quot;")})" 
                    class="bg-white/90 backdrop-blur p-2 rounded-xl text-blue-600 shadow-sm border border-slate-100 hover:bg-blue-600 hover:text-white transition-all" 
                    title="تعديل المنتج">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            <button onclick="event.stopPropagation(); window.deleteProduct('${p.id}')" 
                    class="bg-white/90 backdrop-blur p-2 rounded-xl text-red-600 shadow-sm border border-slate-100 hover:bg-red-600 hover:text-white transition-all" 
                    title="حذف المنتج">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>`
        : "";

      return `
        <div class="bg-white rounded-2xl sm:rounded-[1.5rem] overflow-hidden border border-slate-100 shadow-md active:scale-[0.98] sm:hover:shadow-2xl sm:hover:shadow-[#1B4332]/20 sm:hover:-translate-y-1 transition-all duration-400 group relative flex flex-col ${isOutOfStock ? "opacity-75" : ""}">
            ${editBtn}
            ${isOutOfStock ? `<span class="absolute top-3 ${isAdmin ? "left-12" : "left-3"} bg-red-600 text-white text-[9px] px-3 py-1 rounded-full z-20 font-black shadow-lg border border-red-500">نفذت الكمية</span>` : ""}
            
            <div class="relative h-36 sm:h-48 w-full bg-slate-50 overflow-hidden shrink-0">
                <img src="${p.img || "img/logo.png"}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" loading="lazy">
                <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>

            <div class="p-3 sm:p-4 flex flex-col flex-1 bg-white text-right">
                <p class="text-[9px] text-[#1B4332] font-black mb-1 tracking-wide uppercase">${p.category || "عام"}</p>
                <h4 class="font-bold text-slate-800 text-[12px] sm:text-[15px] mb-2.5 leading-tight group-hover:text-[#1B4332] transition-colors line-clamp-2 min-h-[2.5rem]">${p.name}</h4>
                
                <div class="bg-slate-50 p-2 sm:p-3 rounded-xl border border-slate-100 mb-3 shadow-inner">
                    <div class="flex items-center justify-between text-[8px] sm:text-[10px] mb-2 pb-1.5 border-b border-slate-200">
                        ${isAdmin ? `<span class="flex items-center gap-1 font-mono text-slate-400"><i data-lucide="tag" class="w-3 h-3 opacity-60"></i> ${p.sku || "---"}</span>` : `<span></span>`}
                        <span class="flex items-center gap-1 font-bold text-[#1B4332] bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">${p.unitMeasurement || "متوفر"}</span>
                    </div>
                    <div class="product-price-wrapper min-h-[40px] sm:min-h-[50px] flex flex-col items-center justify-center gap-1">
                        ${priceBlock}
                        ${isAdmin ? `
                        <div class="flex items-center gap-1 text-[11px] font-black ${isOutOfStock ? 'text-red-600' : 'text-slate-600'} mt-1">
                            <i data-lucide="package-check" class="w-3.5 h-3.5 opacity-70"></i>
                            <span>المخزن: ${Number(p.quantity || 0)}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div class="mt-auto pt-1 flex items-center gap-2">
                    <div class="flex-[1.2] flex items-center bg-slate-50/80 rounded-xl border border-slate-200 p-1">
                        <button onclick="const inp=document.getElementById('qty-${p.id}'); let v=parseInt(inp.value)||1; if(v < ${maxQty || 999}) inp.value = v + 1;" class="p-2 text-slate-500 hover:text-[#1B4332] rounded-lg transition-all active:scale-95 text-sm font-black">+</button>
                        <input type="number" id="qty-${p.id}" value="1" min="1" max="${maxQty}" class="w-full bg-transparent text-center text-[13px] font-black text-slate-900 outline-none">
                        <button onclick="const inp=document.getElementById('qty-${p.id}'); let v=parseInt(inp.value)||1; if(v > 1) inp.value = v - 1;" class="p-2 text-slate-500 hover:text-red-500 rounded-lg transition-all active:scale-95 text-sm font-black">-</button>
                    </div>
                    
                    <button 
                        onclick="window.addToCart('${p.id}', '${safeName}', ${defaultPrice}, 'bag')"
                        data-id="${p.id}"
                        class="add-to-cart-btn p-3 sm:p-4 bg-[#1B4332] text-white rounded-xl shadow-lg shadow-emerald-200 hover:bg-[#081C15] hover:-translate-y-0.5 active:scale-95 transition-all duration-300 ${isOutOfStock ? "grayscale cursor-not-allowed" : ""}"
                        ${isOutOfStock ? "disabled" : ""}
                    >
                        <i data-lucide="shopping-cart" class="w-5 h-5 sm:w-6 sm:h-6"></i>
                    </button>
                </div>
            </div>
        </div>`;
    })
    .join("");

  if (window.lucide) lucide.createIcons();
};

// New function to render subcategories in the main grid
window.renderSubcategoriesInMainGrid = function (parentId = null) {
  const grid = document.getElementById("products-grid");
  const loadMoreBtn = document.getElementById("load-more-container");
  const pw = document.getElementById("products-wrapper");
  if (!grid) return;

  if (pw) pw.classList.remove("hidden");

  let subCats = [];
  let displayTitle = "";

  if (parentId === null) {
    // Homepage, show default main categories' subcategories
    const grocCat = window.categories.find(
      (c) =>
        !c.parentId &&
        c.name &&
        window.normalizeArabic(c.name).includes("بقال"),
    );
    if (grocCat) {
      subCats = window.categories.filter((c) => c.parentId === grocCat.id);
      displayTitle = `أقسام ${grocCat.name}`;
    } else {
      const firstMain = window.categories.find((c) => !c.parentId);
      if (firstMain) {
        subCats = window.categories.filter((c) => c.parentId === firstMain.id);
        displayTitle = `أقسام ${firstMain.name}`;
      } else {
        subCats = window.categories.filter((c) => c.parentId);
        displayTitle = "تصفح الأقسام الشاملة";
      }
    }
  } else {
    // A parent category is selected, show its direct subcategories
    subCats = window.categories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
    const parentCat = window.categories.find((c) => c.id === parentId);
    displayTitle = parentCat ? parentCat.name : "الأقسام الفرعية";
  }

  if (subCats.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-20 text-slate-400 font-bold">لا توجد أقسام فرعية هنا.</div>`;
  } else {
    const isAdmin = document.body.classList.contains("is-admin") || window.currentUserRole === "admin";

    grid.innerHTML = subCats
      .map((sub) => {
        const hasSubs = window.categories.some(
          (child) => child.parentId === sub.id,
        );
        const parentCat = window.categories.find((p) => p.id === sub.parentId);

        const editBtn = isAdmin
          ? `<div class="absolute top-3 right-3 flex flex-col gap-2 z-30">
              <button onclick="event.stopPropagation(); window.openCategoryModal(${JSON.stringify(sub).replace(/"/g, "&quot;")})"
                      class="bg-white/90 backdrop-blur p-2 rounded-xl text-blue-600 shadow-sm border border-slate-100 hover:bg-blue-600 hover:text-white transition-all"
                      title="تعديل القسم">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="event.stopPropagation(); window.deleteCategory('${sub.id}')"
                      class="bg-white/90 backdrop-blur p-2 rounded-xl text-red-600 shadow-sm border border-slate-100 hover:bg-red-600 hover:text-white transition-all"
                      title="حذف القسم">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>`
          : "";

        return `
        <div onclick="window.handleCategoryClick('${sub.id}', '${sub.name}', ${hasSubs})" class="bg-slate-900 rounded-[1.5rem] shadow-md hover:shadow-2xl hover:shadow-[#1B4332]/30 hover:-translate-y-1.5 transition-all duration-500 group cursor-pointer relative overflow-hidden flex flex-col h-44 sm:h-56">
          ${editBtn}
          <div class="absolute inset-0 bg-cover bg-center opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-all duration-700 ease-out" style="background-image: url('${sub.img || "img/logo.png"}');"></div>
          <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none"></div>
          
          <div class="relative z-10 p-4 sm:p-5 flex flex-col justify-end h-full text-center">
              <p class="text-[10px] text-emerald-300 font-black mb-1.5 tracking-widest uppercase drop-shadow-md bg-black/40 w-fit mx-auto px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10">${parentCat ? parentCat.name : "قسم"}</p>
              <h5 class="font-black text-white text-lg sm:text-xl leading-tight group-hover:text-emerald-300 transition-colors tracking-wide drop-shadow-xl mb-2">${sub.name}</h5>
              <div class="transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                  <span class="text-[10px] text-slate-800 font-bold inline-flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-lg"><i data-lucide="arrow-left" class="w-3 h-3"></i> تصفح المنتجات</span>
              </div>
          </div>
        </div>`;
      })
      .join("");
  }

  if (loadMoreBtn) loadMoreBtn.classList.add("hidden");

  const titleEl = document.getElementById("current-category-title");
  if (titleEl) {
    if (parentId === null) {
      titleEl.innerHTML = `<i data-lucide="layers" class="w-5 h-5 text-[#1B4332]"></i> تصفح الأقسام الشاملة`;
    } else {
      const backBtn = `<button onclick="window.navigateBackCategories()" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors shadow-sm ml-2" title="رجوع"><i data-lucide="arrow-right" class="w-4 h-4"></i></button>`;
      titleEl.innerHTML = `${backBtn} <i data-lucide="folder" class="w-5 h-5 text-[#1B4332]"></i> أقسام: ${displayTitle}`;
    }
  }

  if (window.lucide) lucide.createIcons();
};

async function startApp() {
  if (window.lucide) window.lucide.createIcons();

  // بدء جلب البيانات ومراقبة حالة المستخدم فوراً
  listenToCategories();
  listenToProducts();
  if (!window.unsubs.promos) window.unsubs.promos = listenToPromotions();
  if (!window.unsubs.banners) window.unsubs.banners = listenToBanners();
  Auth.initAuth();
  Auth.listenToAuth();

  // إخفاء واجهة التحميل (Loader) لضمان ظهور الموقع للمستخدم
  const loader = document.getElementById("app-loader");
  if (loader) loader.classList.add("hidden");
  document.body.classList.remove("is-loading");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./service-worker.js?v=1.1")
      .then((reg) => {
        console.log("Service Worker registered successfully.");
      })
      .catch((err) => {
        console.error("Service Worker registration failed:", err);
      });
  }
}

function listenToProducts() {
  const productsCollectionRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products",
  );

  const q = window.firestoreUtils.query(
    productsCollectionRef,
    window.firestoreUtils.limit(5000),
  );

  return window.firestoreUtils.onSnapshot(q, (snap) => {
    window.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // On initial load or product update, render subcategories for homepage or apply current filter
    if (
      window.currentFilter.type === "all" &&
      window.currentParentId === null
    ) {
      window.renderSubcategoriesInMainGrid(null); // Default homepage view
    } else if (
      window.currentFilter.type === "category" &&
      window.currentParentId !== null
    ) {
      // If a parent category is selected, check if it has subcategories.
      // If it does, render subcategories. If not, render products.
      const currentCat = window.categories.find(
        (c) => c.id === window.currentParentId,
      );
      const hasSubs = currentCat
        ? window.categories.some((child) => child.parentId === currentCat.id)
        : false;
      if (hasSubs) {
        window.renderSubcategoriesInMainGrid(window.currentParentId);
      } else {
        window.applyCurrentFilter(); // This will call renderProducts
      }
    } else {
      window.applyCurrentFilter(); // This will call renderProducts
    }

    // التأكد من إخفاء اللودر عند وصول أول دفعة بيانات من المنتجات
    const loader = document.getElementById("app-loader");
    if (loader) loader.classList.add("hidden");
    document.body.classList.remove("is-loading");

    if (document.body.classList.contains("is-admin")) {
      // تحديث العدادات الذكية فوراً دون انتظار الرندرة الثقيلة
      if (typeof window.updateAdminStats === "function")
        window.updateAdminStats();

      // منع الرندرة الكاملة للبطاقات إذا كنا في وضع الرفع الضخم لمنع تهنيج الصفحة
      if (!window.isBulkUploading) {
        if (typeof Admin?.renderAdminProducts === "function")
          Admin.renderAdminProducts();
        if (typeof Admin?.renderInventoryAudit === "function")
          Admin.renderInventoryAudit();
      }
    }
    if (
      window.currentUserRole === "admin" &&
      typeof Orders?.listenToOrders === "function"
    )
      Orders.listenToOrders();
  });
}

let promoAutoScrollInterval;

function listenToPromotions() {
    const ref = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "promotions");
    return window.firestoreUtils.onSnapshot(ref, (snap) => {
        const promos = snap.docs.map(doc => doc.data());
        const container = document.getElementById("promos-client-container");
        if (!container) return;
        
        if (promos.length === 0) {
            container.classList.add("hidden");
            return;
        }
        
        container.classList.remove("hidden");
        container.innerHTML = promos.map(p => `
            <div class="min-w-[90vw] sm:min-w-[100%] h-[250px] sm:h-[450px] rounded-[2.5rem] sm:rounded-[3.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)] bg-black relative group border border-white/10 snap-center transition-transform duration-500">
                <iframe src="${p.embedUrl}" class="w-full h-full" frameborder="0" allowfullscreen></iframe>
                <div class="absolute bottom-0 left-0 right-0 p-6 sm:p-10 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none">
                    <p class="text-white text-base sm:text-2xl font-black drop-shadow-2xl translate-y-2 group-hover:translate-y-0 transition-transform duration-300">${p.title}</p>
                </div>
            </div>
        `).join("");

        // تفعيل ميزة التمرير التلقائي
        startPromoAutoCycle(container);
    });
}

function startPromoAutoCycle(container) {
    if (promoAutoScrollInterval) clearInterval(promoAutoScrollInterval);
    
    promoAutoScrollInterval = setInterval(() => {
        const scrollAmount = container.offsetWidth;
        const isAtEnd = container.scrollLeft + container.offsetWidth >= container.scrollWidth - 20;

        if (isAtEnd) {
            container.scrollTo({
                left: 0,
                behavior: 'smooth'
            });
        } else {
            container.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
        }
    }, 5000); // تغيير الإعلان كل 5 ثوانٍ
}

let bannerAutoScrollInterval;
let bannerCurrentIndex = 0;
let bannerTotalCount = 0;
let bannerTouchStartX = 0;
let bannerTouchEndX = 0;

function listenToBanners() {
    const ref = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "banners");
    return window.firestoreUtils.onSnapshot(ref, (snap) => {
        const banners = snap.docs.map(doc => doc.data()).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        const slider = document.getElementById("home-banner-slider");
        const dotsContainer = document.getElementById("banner-dots");
        
        if (!slider) return;

        if (banners.length === 0) {
            // عرض بنر افتراضي عند عدم وجود بنرات
            slider.innerHTML = `
                <div class="banner-slide" style="background: linear-gradient(135deg, #1B4332 0%, #2D6A4F 50%, #40916C 100%); display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px; padding:32px;">
                    <span style="background:rgba(251,191,36,0.2); color:#fbbf24; font-size:11px; padding:8px 18px; border-radius:999px; font-weight:900; border:1px solid rgba(251,191,36,0.3); letter-spacing:3px;">ثقة • جودة • سرعة</span>
                    <h2 style="font-size:clamp(2rem,6vw,4rem); font-weight:900; color:#fff; text-shadow:0 4px 12px rgba(0,0,0,0.5); margin:0;">عروض الجملة!</h2>
                    <button onclick="document.getElementById('search-input').focus()" style="background:linear-gradient(90deg,#f59e0b,#d97706); color:#081C15; padding:12px 28px; border-radius:12px; font-size:14px; font-weight:900; border:none; cursor:pointer; box-shadow:0 8px 20px rgba(245,158,11,0.4);">ابدأ التسوق</button>
                </div>
            `;
            slider.style.transform = 'translateX(0)';
            if (dotsContainer) dotsContainer.innerHTML = "";
            const prevBtn = document.getElementById('banner-prev');
            const nextBtn = document.getElementById('banner-next');
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            // تهيئة العدادات
            if (typeof window.initBannerControls === 'function') window.initBannerControls(0);
            return;
        }
        
        // رندرة الشرائح مع نصوص تعريفية مخصصة لمجال المنظفات والمواد الغذائية
        slider.innerHTML = banners.map((b, i) => {
            const introMessages = [
                "أولاد الشيخ .. وجهتكم الأولى للمنظفات والبقالة",
                "عروض حصرية على منتجات الثلاجة والمواد الغذائية",
                "جملة الجملة .. الجودة والأمانة في كل منتج",
                "توفير حقيقي لبيتك ومحلك بأفضل الأسعار"
            ];
            const message = introMessages[i % introMessages.length];
            
            return `
            <div class="banner-slide group" ${b.link ? `onclick="window.open('${b.link}', '_blank')"` : ''} style="${b.link ? 'cursor:pointer;' : ''}">
                <img src="${b.img}" alt="بانر ${i+1}" loading="${i === 0 ? 'eager' : 'lazy'}">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent flex flex-col justify-end p-6 sm:p-16 text-right">
                    <div class="banner-text-content transition-all duration-1000 transform translate-y-8 opacity-0">
                        <span class="inline-block bg-emerald-600 text-white text-[9px] sm:text-[10px] font-black px-4 py-1.5 rounded-full mb-3 shadow-xl border border-emerald-400/30 uppercase tracking-[0.1em]">أولاد الشيخ لجملة الجملة</span>
                        <h2 class="text-white text-xl sm:text-3xl font-black mb-2 leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">${message}</h2>
                        <p class="text-emerald-50/80 text-[10px] sm:text-base font-bold max-w-xl leading-relaxed drop-shadow-md">
                            نحن في "أولاد الشيخ" نوفر لك أجود أنواع السلع الغذائية ومنتجات الثلاجة والمنظفات بأسعار الجملة لضمان أفضل توفير.
                        </p>
                        <div class="mt-4 flex gap-2">
                            <div class="w-10 h-1 bg-emerald-500 rounded-full"></div>
                            <div class="w-3 h-1 bg-emerald-500/40 rounded-full"></div>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join("");

        // إظهار / إخفاء أزرار السهام
        const prevBtn = document.getElementById('banner-prev');
        const nextBtn = document.getElementById('banner-next');
        if (prevBtn) prevBtn.style.display = banners.length > 1 ? '' : 'none';
        if (nextBtn) nextBtn.style.display = banners.length > 1 ? '' : 'none';

        // رندرة الدوتس
        if (dotsContainer && banners.length > 1) {
            dotsContainer.innerHTML = banners.map((_, i) =>
                `<div class="dot ${i === 0 ? 'active' : ''}" onclick="window.bannerGoTo(${i})" aria-label="صورة ${i+1}"></div>`
            ).join("");
        } else if (dotsContainer) {
            dotsContainer.innerHTML = "";
        }

        // دعم السحب بالإصبع (Touch/Swipe) على الموبايل
        const wrapper = document.getElementById('banner-outer-wrapper');
        if (wrapper) {
            wrapper.ontouchstart = (e) => { bannerTouchStartX = e.changedTouches[0].clientX; };
            wrapper.ontouchend   = (e) => {
                bannerTouchEndX = e.changedTouches[0].clientX;
                const diff = bannerTouchStartX - bannerTouchEndX;
                if (Math.abs(diff) > 40) {
                    if (diff > 0) window.bannerNext();
                    else window.bannerPrev();
                }
            };
        }

        // تهيئة العدادات وبدء التشغيل التلقائي عبر الدالة المعرفة في index.html
        if (typeof window.initBannerControls === 'function') {
            window.initBannerControls(banners.length);
        }
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

    // تحديث العدادات
    if (typeof window.updateAdminStats === "function")
      window.updateAdminStats();

    if (
      document.body.classList.contains("is-admin") &&
      typeof Admin?.renderAdminCategories === "function"
    )
      Admin.renderAdminCategories();
  });
}

window.filterByCategory = function (catId, catName) {
  window.currentFilter = { type: "category", id: catId, name: catName };
  window.currentRenderLimit = window.itemsPerPage; // إعادة تعيين الحد عند تغيير القسم
  const filtered = window.products.filter(
    (p) => p.category === catName || p.categoryId === catId,
  );
  const title = document.getElementById("current-category-title");
  if (title) {
    const backBtn = `<button onclick="window.navigateBackCategories()" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors shadow-sm ml-2" title="رجوع"><i data-lucide="arrow-right" class="w-4 h-4"></i></button>`;
    title.innerHTML = `${backBtn} <i data-lucide="folder" class="w-5 h-5 text-[#1B4332]"></i> قسم: ${catName}`;
    if (window.lucide) lucide.createIcons();
  }
  window.renderProducts(filtered);
};

window.handleCategoryClick = function (catId, catName, hasSubs) {
  if (hasSubs) {
    window.currentParentId = catId;
    window.currentFilter = { type: "category", id: catId, name: catName }; // Set filter context
    window.renderCategories(); // Updates top bar
    window.renderSubcategoriesInMainGrid(catId); // Show subcategories in main grid
  } else {
    // If it's a leaf category, just filter and render products
    window.currentParentId = catId; // Keep track of the current leaf category
    window.filterByCategory(catId, catName); // This will call renderProducts
  }
};

window.navigateBackCategories = function () {
  const currentCat = window.categories.find(
    (c) => c.id === window.currentParentId,
  );

  if (currentCat && currentCat.parentId) {
    // If current category has a parent, go back to parent's subcategories
    window.currentParentId = currentCat.parentId;
    const parentCat = window.categories.find(
      (c) => c.id === currentCat.parentId,
    );
    window.currentFilter = {
      type: "category",
      id: parentCat.id,
      name: parentCat.name,
    };
    window.renderCategories();
    window.renderSubcategoriesInMainGrid(parentCat.id);
  } else {
    // If current category has no parent (it's a top-level parent or homepage), go to homepage default
    window.currentParentId = null;
    window.currentFilter = { type: "all", value: null };
    window.renderCategories();
    window.renderSubcategoriesInMainGrid(null); // Show default main categories' subcategories
  }

  if (window.lucide) lucide.createIcons();
};

window.searchProducts = function (term) {
  window.currentFilter = { type: "search", value: term };
  window.currentRenderLimit = window.itemsPerPage;
  if (!term || term.trim() === "")
    return window.renderProducts(window.products);

  const searchTerms = window.normalizeArabic(term).split(/\s+/).filter(Boolean);

  const filtered = window.products.filter((p) => {
    const pName = window.normalizeArabic(p.name);
    const pCat = window.normalizeArabic(p.category || "");
    const pSku = (p.sku || "").toLowerCase();
    const combinedText = `${pName} ${pCat} ${pSku}`;

    // بحث ذكي: التأكد من مطابقة كل كلمة بحث مع أي جزء من بيانات المنتج (AND Search)
    return searchTerms.every((t) => combinedText.includes(t));
  });

  const titleElem = document.getElementById("current-category-title");
  if (titleElem) {
    const backBtn = `<button onclick="window.navigateBackCategories()" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors shadow-sm ml-2" title="رجوع"><i data-lucide="arrow-right" class="w-4 h-4"></i></button>`;
    titleElem.innerHTML = `${backBtn} <i data-lucide="search" class="w-5 h-5 text-emerald-500"></i> نتائج البحث: ${term}`;
  }
  window.renderProducts(filtered);
};

window.loadMoreProducts = function () {
  window.currentRenderLimit += window.itemsPerPage;
  window.renderProducts(window.lastRenderedProducts);

  // سكرول بسيط للأسفل لرؤية المنتجات الجديدة
  window.scrollBy({ top: 300, behavior: "smooth" });
};

window.filterByStatus = function (status) {
  window.currentFilter = { type: "status", value: status };
  if (status === "all") return window.renderProducts(window.products);
  const filtered = window.products.filter((p) => p.status === status);
  window.renderProducts(filtered);
};

window.applyCurrentFilter = function () {
  const filter = window.currentFilter;
  if (!filter || filter.type === "all") {
    window.renderSubcategoriesInMainGrid(null); // Default homepage view
  } else if (filter.type === "category") {
    const filtered = window.products.filter(
      (p) => p.category === filter.name || p.categoryId === filter.id,
    );
    window.renderProducts(filtered);
  } else if (filter.type === "search") {
    const term = filter.value.toLowerCase();
    const filtered = window.products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.category && p.category.toLowerCase().includes(term)),
    );
    window.renderProducts(filtered);
  } else if (filter.type === "status") {
    if (filter.value === "all") {
      window.renderProducts(window.products);
    } else {
      const filtered = window.products.filter((p) => p.status === filter.value);
      window.renderProducts(filtered);
    }
  }
};

/**
 * processImageUrl – يحفظ الرابط مباشرةً بعد التحقق من صحته بصرياً.
 * (لا تحويل لـ Base64 – الرابط الخارجي يُرسل مباشرة لـ Firestore)
 */
window.processImageUrl = async function (url, previewId, hiddenInputId) {
  if (!url) return;

  let targetUrl = url;
  try {
    const urlObj = new URL(url);
    if (urlObj.searchParams.has("imgurl")) {
      targetUrl = urlObj.searchParams.get("imgurl");
    }
  } catch (e) { /* ignore invalid URL */ }

  const previewImg = document.getElementById(previewId);
  const placeholder = document.getElementById(previewId.replace("preview", "placeholder"));
  const hiddenInput = document.getElementById(hiddenInputId);

  if (window.showToast) window.showToast("جاري التحقق من الصورة...", "info", 2000);

  const img = new Image();
  img.onload = function () {
    previewImg.src = targetUrl;
    previewImg.classList.remove("hidden");
    if (placeholder) placeholder.classList.add("hidden");
    if (hiddenInput) hiddenInput.value = targetUrl;
    window.showToast("تم تطبيق الصورة بنجاح ✅", "success");
  };
  img.onerror = () => {
    window.showToast("رابط الصورة غير صالح أو لا يسمح بالعرض ❌", "error");
  };
  img.src = targetUrl;
};

/**
 * handleImageUpload – رفع الصورة إلى Cloudinary عبر Signed Upload.
 * الخطوات:
 *   1. اجلب توقيع HMAC من /api/cloudinary-sign (السر يبقى server-side)
 *   2. ارفع الملف مباشرة لـ Cloudinary Upload API
 *   3. احفظ الـ secure_url في الحقل المخفي
 * عند الفشل (بيئة محلية بدون ENV)، يرجع لـ Base64 تلقائياً.
 */
window.handleImageUpload = async function (event, previewId, hiddenInputId, maxSize = 800) {
  const file = event.target.files[0];
  if (!file) return;

  const previewImg = document.getElementById(previewId);
  const placeholder = document.getElementById(previewId.replace("preview", "placeholder"));
  const hiddenInput = document.getElementById(hiddenInputId);

  // --- عرض معاينة فورية (Blob URL) أثناء الرفع ---
  const localPreview = URL.createObjectURL(file);
  if (previewImg) {
    previewImg.src = localPreview;
    previewImg.classList.remove("hidden");
  }
  if (placeholder) placeholder.classList.add("hidden");
  if (window.showToast) window.showToast("جاري رفع الصورة إلى Cloudinary...", "info", 3000);

  // --- تحديد مجلد الرفع بناءً على نوع الصورة ---
  let folder = "sheikh-app/products";
  if (previewId.startsWith("c-")) folder = "sheikh-app/categories";
  if (previewId.startsWith("banner-")) folder = "sheikh-app/banners";

  try {
    // الخطوة 1: جلب التوقيع من الـ Backend
    const signRes = await fetch("/api/cloudinary-sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });

    if (!signRes.ok) throw new Error("Sign API error");
    const { signature, timestamp, apiKey, cloudName } = await signRes.json();

    // الخطوة 2: رفع الملف مباشرة لـ Cloudinary
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", folder);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!uploadRes.ok) throw new Error("Cloudinary upload failed");

    const data = await uploadRes.json();
    const cdnUrl = data.secure_url;

    // الخطوة 3: تحديث الـ Preview والحقل المخفي بالرابط النهائي
    if (previewImg) previewImg.src = cdnUrl;
    if (hiddenInput) hiddenInput.value = cdnUrl;
    URL.revokeObjectURL(localPreview);
    if (window.showToast) window.showToast("✅ تم رفع الصورة بنجاح!", "success");

  } catch (err) {
    console.warn("Cloudinary upload failed, falling back to Base64:", err.message);
    // --- Fallback: Base64 (يُستخدم في البيئة المحلية بدون ENV vars) ---
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement("canvas");
        let width = img.width, height = img.height;
        if (width > maxSize) { height *= maxSize / width; width = maxSize; }
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const quality = maxSize >= 1200 ? 0.95 : 0.6;
        const base64 = canvas.toDataURL("image/jpeg", quality);
        if (previewImg) { previewImg.src = base64; previewImg.classList.remove("hidden"); }
        if (hiddenInput) hiddenInput.value = base64;
        if (window.showToast) window.showToast("⚠️ تم حفظ الصورة محلياً (Base64)", "warning");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
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

// حقن CSS مخصص لتغيير توزيع المنتجات ليصبح 5 في الصف على الكمبيوتر و 2 في الموبايل
(function injectGlobalLayoutCSS() {
  if (document.getElementById('global-layout-styles')) return;
  const style = document.createElement('style');
  style.id = 'global-layout-styles';
  style.textContent = `
    /* منع التمرير الأفقي العام وتعديل البادنج */
    html, body { overflow-x: hidden; width: 100%; position: relative; }
    .container, #main-content { max-width: 100%; overflow-x: hidden; padding-left: 0.5rem; padding-right: 0.5rem; }

    /* هواتف: 2 منتجات في الصف (طلب المستخدم) وتحسين الأحجام */
    @media (max-width: 640px) {
      #products-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 12px !important;
        padding: 8px !important;
      }
      #products-grid > div { padding: 10px !important; border-radius: 1.25rem !important; }
      #products-grid h4 { font-size: 13px !important; min-height: 2.8rem !important; margin-bottom: 8px !important; }
      #products-grid .relative.h-36 { height: 120px !important; }
      #products-grid .p-3 { padding: 10px !important; }
      
      /* تحسين حجم الأزرار والسعر للموبايل */
      .price-block button { padding: 4px 6px !important; font-size: 9px !important; }
      .add-to-cart-btn { padding: 10px !important; }
      .add-to-cart-btn i { width: 1.25rem !important; height: 1.25rem !important; }
      
      /* ضبط لوحة التحكم للهواتف */
      .is-admin main { padding: 10px !important; }
      #admin-p-list, #admin-o-list { gap: 12px !important; }
      
      /* جعل تبويبات الإدارة قابلة للسحب لليمين واليسار */
      [id^="admin-tab-"] {
        min-width: 85px !important;
        flex: 0 0 auto !important;
        white-space: nowrap !important;
      }
    }

    /* شاشات كبيرة: 5 منتجات في الصف لزيادة الكفاءة */
    @media (min-width: 1024px) {
      #products-grid {
        grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
        gap: 20px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
