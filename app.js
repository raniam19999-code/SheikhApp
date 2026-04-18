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
window.itemsPerPage = 10;
window.currentRenderLimit = 10;
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
          <div class="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl sm:rounded-[2.5rem] bg-white shadow-lg border-2 border-slate-50 relative overflow-hidden group-active:scale-95 transition-transform duration-200">
            <div class="category-image-fill" style="background-image: url('${c.img || "img/logo.png"}');"></div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
          <span class="text-[10px] sm:text-[12px] font-black text-slate-700 text-center leading-tight max-w-[80px] sm:max-w-[110px] group-hover:text-emerald-800 transition-colors uppercase tracking-tight">${c.name}</span>
        </div>
        `;
      })
      .join("");
  } else {
    // دخلنا في قسم رئيسي، الكل يختفي ونظهر فقط زر الرجوع في الشريط العلوي
    html += `
      <div onclick="window.navigateBackCategories()" class="flex flex-col items-center gap-3 shrink-0 cursor-pointer group snap-item">
        <div class="w-28 sm:w-32 h-28 sm:h-32 rounded-[2.5rem] bg-slate-50 shadow-md border-2 border-slate-100 flex items-center justify-center overflow-hidden group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-500 group-hover:-translate-y-2 transition-all duration-500">
          <i data-lucide="arrow-right" class="w-10 h-10 group-hover:scale-125 transition-transform duration-500"></i>
        </div>
        <span class="text-[11px] sm:text-xs font-black text-slate-400 group-hover:text-emerald-700 transition-colors uppercase tracking-wide">رجوع للأقسام</span>
      </div>
    `;
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

      // التحقق من صلاحية المدير لإظهار زر التعديل السريع
      const isAdmin = document.body.classList.contains("is-admin");
      const editBtn = isAdmin
        ? `
        <button onclick="event.stopPropagation(); window.openProductModal(${JSON.stringify(p).replace(/"/g, "&quot;")})" 
                class="absolute top-3 right-3 bg-white/90 backdrop-blur p-2 rounded-xl text-blue-600 shadow-sm border border-slate-100 hover:bg-blue-600 hover:text-white transition-all z-30" 
                title="تعديل المنتج">
          <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>
      `
        : "";

      return `
        <div class="bg-white rounded-3xl sm:rounded-[2.5rem] p-3 sm:p-4 border border-slate-100 shadow-sm active:scale-[0.98] sm:hover:shadow-2xl sm:hover:shadow-emerald-100/50 sm:hover:-translate-y-1.5 transition-all duration-300 group relative ${isOutOfStock ? "opacity-75" : ""}">
            ${editBtn}
            ${isOutOfStock ? `<span class="absolute top-3 ${isAdmin ? "left-12" : "left-3"} bg-red-500 text-white text-[8px] px-2.5 py-1 rounded-full z-20 font-black shadow-lg">نفذت الكمية</span>` : ""}
            
            <div class="relative h-32 sm:h-44 mb-3 sm:mb-4 rounded-2xl sm:rounded-[2rem] overflow-hidden bg-slate-50 border border-slate-50 shadow-inner">
                <img src="${p.img || "img/logo.png"}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" loading="lazy">
                <div class="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>

            <div class="px-1 text-right">
                <p class="text-[10px] text-emerald-600 font-black mb-1.5 tracking-wide uppercase">${p.category || "عام"}</p>
                <h4 class="font-bold text-slate-800 text-xs sm:text-sm mb-2 leading-tight group-hover:text-emerald-700 transition-colors line-clamp-2 min-h-[2.5rem]">${p.name}</h4>
                
                <div class="bg-slate-50/80 p-2 sm:p-3 rounded-2xl sm:rounded-[1.5rem] border border-slate-100/60 mb-3 shadow-sm">
                    <div class="flex items-center justify-between text-[9px] sm:text-[11px] mb-2 pb-2 border-b border-slate-200/50">
                        <span class="flex items-center gap-1.5 font-mono text-slate-500"><i data-lucide="tag" class="w-3.5 h-3.5 text-slate-400"></i> ${p.sku || "---"}</span>
                        <span class="flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">${p.unitMeasurement || "متوفر"}</span>
                    </div>
                    <div class="product-price-wrapper min-h-[40px] sm:min-h-[50px] flex items-center justify-center">
                        ${priceBlock}
                    </div>
                </div>

                <div class="mt-2 sm:mt-4 flex items-center gap-2">
                    <div class="flex-[1.2] flex items-center bg-slate-50/80 rounded-[1.25rem] border border-slate-100 p-1">
                        <button onclick="const inp=this.nextElementSibling; inp.stepUp();" class="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-lg transition-all active:scale-95">+</button>
                        <input type="number" id="qty-${p.id}" value="1" min="1" class="w-full bg-transparent text-center text-sm font-black text-slate-800 outline-none">
                        <button onclick="const inp=this.previousElementSibling; inp.stepDown();" class="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-all active:scale-95 px-2.5">-</button>
                    </div>
                    
                    <button 
                        onclick="window.addToCart('${p.id}', '${safeName}', ${defaultPrice}, 'bag')"
                        data-id="${p.id}"
                        class="add-to-cart-btn p-3 sm:p-4 bg-[#1B4332] text-white rounded-2xl sm:rounded-[1.25rem] shadow-xl shadow-emerald-100 hover:bg-[#2D6A4F] active:scale-90 transition-all duration-300 ${isOutOfStock ? "grayscale cursor-not-allowed" : ""}"
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
          ? `<button onclick="event.stopPropagation(); window.openCategoryModal(${JSON.stringify(sub).replace(/"/g, "&quot;")})" 
                     class="absolute top-3 right-3 bg-white/90 backdrop-blur p-2 rounded-xl text-blue-600 shadow-sm border border-slate-100 hover:bg-blue-600 hover:text-white transition-all z-30" 
                     title="تعديل القسم">
               <i data-lucide="edit-3" class="w-4 h-4"></i>
             </button>` 
          : "";

        return `
        <div onclick="window.handleCategoryClick('${sub.id}', '${sub.name}', ${hasSubs})" class="bg-white rounded-[2rem] p-3 sm:p-4 border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-emerald-100/50 hover:-translate-y-1.5 transition-all duration-500 group cursor-pointer relative overflow-hidden flex flex-col justify-between">
          ${editBtn}
          <div class="relative h-32 sm:h-40 mb-3 rounded-[1.5rem] overflow-hidden bg-slate-50 border border-slate-50 shadow-inner w-full">
            <div class="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-700 ease-out" style="background-image: url('${sub.img || "img/logo.png"}');"></div>
            <div class="absolute inset-0 bg-gradient-to-t from-[#1B4332]/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          </div>
          <div class="px-1 text-center mt-auto">
              <p class="text-[10px] text-emerald-600 font-black mb-1.5 tracking-wide uppercase">${parentCat ? parentCat.name : ""}</p>
              <h5 class="font-black text-slate-800 text-sm sm:text-base leading-tight group-hover:text-emerald-700 transition-colors uppercase tracking-tight">${sub.name}</h5>
              <span class="text-[10px] text-slate-400 font-bold mt-2 inline-flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 group-hover:bg-emerald-50 group-hover:text-emerald-600 group-hover:border-emerald-100 transition-colors uppercase"><i data-lucide="arrow-left" class="w-3 h-3"></i> المنتجات</span>
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
      titleEl.innerHTML = `<i data-lucide="folder" class="w-5 h-5 text-[#1B4332]"></i> أقسام: ${displayTitle}`;
    }
  }

  if (window.lucide) lucide.createIcons();
};

async function startApp() {
  if (window.lucide) window.lucide.createIcons();

  // بدء جلب البيانات ومراقبة حالة المستخدم فوراً
  listenToCategories();
  listenToProducts();
  Auth.initAuth();
  Auth.listenToAuth();

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
    title.innerHTML = `<i data-lucide="folder" class="w-5 h-5 text-[#1B4332]"></i> قسم: ${catName}`;
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
    titleElem.innerHTML = `<i data-lucide="search" class="w-5 h-5 text-emerald-500"></i> نتائج البحث: ${term}`;
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
        window.showToast(
          "تم استخدام الرابط المباشر - الصورة جاهزة للحفظ ✅",
          "success",
        );
      }
    };
    img.onerror = () => {
      window.showToast(
        "رابط الصورة غير صالح أو لا يسمح بالعرض الخارجي ❌",
        "error",
      );
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
