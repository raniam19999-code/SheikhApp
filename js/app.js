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
// **هام جداً: استبدلي هذا البريد الإلكتروني ببريدك الخاص ليكون هو حساب المدير الأساسي**
const PRIMARY_ADMIN_EMAIL = "raniam19999@gmail.com";

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
};

let userFirestoreCart = []; // This will hold the cart items fetched from Firestore
let cart = []; // السلة المحلية للمستخدمين غير المسجلين
let products = [];
let categories = [];
window.products = products; // تصدير المنتجات لملف البوت
window.categories = categories; // تصدير الأقسام لملف البوت
let currentUser = null;
let authMode = "login";
let editingId = null;
let editingType = null;
let unsubs = {};
let lastOrdersCount = 0;
let lastUserOrdersCount = 0;
let notifications = [];
let modalAuthMode = "login"; // 'login' or 'signup' for the login-required modal

function isAdminUser() {
  // التحقق من أن المستخدم مسجل، ليس مجهولاً، ولديه دور المدير المخزن في الجلسة
  return (
    currentUser &&
    !currentUser.isAnonymous &&
    window.currentUserRole === "admin"
  );
}

function ensureAdmin(actionName) {
  if (!isAdminUser()) {
    alert(`هذه الميزة متاحة للمدير فقط (${actionName}).`);
    return false;
  }
  return true;
}

document.body.style.paddingBottom = "calc(5rem + env(safe-area-inset-bottom))";

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
});

let loadAttempts = 0;
const init = setInterval(() => {
  loadAttempts++;
  if (window.db && window.auth) {
    clearInterval(init);
    startApp();
  } else if (loadAttempts > 50) { // توقف بعد 5 ثواني إذا لم يتم التحميل
    clearInterval(init);
    console.error("Firebase failed to load.");
    if (window.location.protocol === 'file:') {
      alert("عذراً: يجب تشغيل الموقع عبر 'Live Server' أو سيرفر محلي. لا يمكن تشغيله بفتح الملف مباشرة.");
    } else {
      alert("فشل الاتصال بسيرفرات Firebase. تأكد من جودة الإنترنت لديك ومن عدم وجود حظر على الـ DNS.");
    }
  }
}, 100);

async function startApp() {
  lucide.createIcons();
  
  // التأكد من تسجيل الـ Service Worker بشكل صحيح عند بدء التطبيق
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
    } catch (e) {
      console.warn("Service Worker registration failed", e);
    }
  }

  await initAuth();

  // متغير لتتبع المستوى الحالي في الأقسام
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

  // عرض المنتجات والأقسام للجميع حتى لو لم يسجل الدخول
  if (!unsubs.categories) unsubs.categories = listenToCategories();
  if (!unsubs.products) unsubs.products = listenToProducts();

  // إضافة الأقسام الافتراضية للجملة
  await initializeDefaultCategories();
  await seedFridgeSubCategories();

  listenToAuth();
}

async function seedFridgeSubCategories() {
  try {
    const catsRef = window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "categories",
    );
    // تغيير المعرف لضمان تشغيله مرة أخرى إذا فشل السكريبت السابق
    const checkDoc = await window.firestoreUtils.getDoc(
      window.firestoreUtils.doc(catsRef, "init_fridge_subcats_5"),
    );
    if (!checkDoc.exists()) {
      // إعطاء وقت كافي (8 ثوان) لتحميل categories من listener
      setTimeout(async () => {
        // البحث بمرونة للتعرف على "الثلاجة" أو "الثلاجه"
        let fridge = categories.find(
          (c) => c.name && c.name.includes("ثلاج") && !c.parentId,
        );

        if (!fridge) {
          console.log("إنشاء قسم الثلاجة الرئيسي لأنه غير موجود...");
          const newFridgeRef = await window.firestoreUtils.addDoc(catsRef, {
            name: "الثلاجة",
            parentId: "",
            img: "",
            order: 0,
          });
          fridge = { id: newFridgeRef.id, name: "الثلاجة" };
          // إضافة مؤقتة للمصفوفة
          categories.push(fridge);
        }

        if (fridge) {
          const subCatsToCreate = [
            "قسم الجبن",
            "قسم اللحوم",
            "قسم مشتقات الالبان",
            "قسم اللانشون وصوصات الطعام",
            "قسم الحلاوه",
            "قسم الزبده والسمنه",
            "قسم الحلويات",
            "قسم السي فود",
            "قسم المخللات",
            "منتجات اخري خاصه بالثلاجه",
          ];

          for (const subName of subCatsToCreate) {
            const alreadyExists = categories.some(
              (c) => c.parentId === fridge.id && c.name === subName,
            );
            if (!alreadyExists) {
              await window.firestoreUtils.addDoc(catsRef, {
                name: subName,
                parentId: fridge.id,
                img: "",
                order: subCatsToCreate.indexOf(subName),
              });
            }
          }
          await window.firestoreUtils.setDoc(
            window.firestoreUtils.doc(catsRef, "init_fridge_subcats_5"),
            { initialized: true },
          );
          console.log("تم إنشاء أقسام الثلاجة بنجاح!");
        }
      }, 5000);
    }
  } catch (e) {
    console.error("Error seeding fridge subcategories", e);
  }
}

async function initializeDefaultCategories() {
  try {
    // تعريف الهيكل الجديد المطلوب
    const defaultBranches = [
      { name: "الثلاجة", img: "", parentId: "" },
      { name: "البقالة", img: "", parentId: "" },
      { name: "المنظفات", img: "", parentId: "" },
      { name: "المشروبات", img: "", parentId: "" },
      // { name: "أدوات منزلية", img: "", parentId: "" },
    ];

    const categoriesRef = window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "categories",
    );
    const existingCategories = await window.firestoreUtils.getDoc(
      window.firestoreUtils.doc(categoriesRef, "init_check"),
    );

    if (!existingCategories.exists()) {
      for (const category of defaultBranches) {
        await window.firestoreUtils.addDoc(categoriesRef, category);
      }
      await window.firestoreUtils.setDoc(
        window.firestoreUtils.doc(categoriesRef, "init_check"),
        { initialized: true },
      );
      console.log("تم إضافة الأقسام الافتراضية للجملة");
    }
  } catch (error) {
    console.error("خطأ في إضافة الأقسام الافتراضية:", error);
  }
}

function navigateBack() {
  if (window.activeSubCategoryName !== null) {
    // We are looking at products of a subcategory.
    // Go back to the subcategories folder view.
    window.activeSubCategoryName = null;
    const parent = categories.find((c) => c.id === window.currentParentId);
    document.getElementById("current-category-title").innerHTML =
      `<i data-lucide="folder" class="w-5 h-5 text-emerald-500"></i> فرع: ${parent ? parent.name : ""}`;

    renderCategories();
    renderSubCategoriesAsGrid(window.currentParentId);
  } else {
    // We are looking at the subcategories folder view.
    // Go back to its parent.
    const currentCat = categories.find((c) => c.id === window.currentParentId);
    window.currentParentId = currentCat ? currentCat.parentId || null : null;

    if (window.currentParentId === null) {
      document.getElementById("current-category-title").innerHTML =
        `<i data-lucide="grid" class="w-5 h-5 text-[#1B4332]"></i> الأقسام الرئيسية`;
      window.activeSubCategoryName = null;
      renderCategories();
      renderProducts(products); // عرض كل المنتجات عند العودة للرئيسية
    } else {
      const parent = categories.find((c) => c.id === window.currentParentId);
      document.getElementById("current-category-title").innerHTML =
        `<i data-lucide="folder" class="w-5 h-5 text-emerald-500"></i> فرع: ${parent.name}`;

      renderCategories();
      renderSubCategoriesAsGrid(window.currentParentId);
    }
  }

  updateBulkAddButton();
  lucide.createIcons();
}

async function initAuth() {
  try {
    if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
      await window.authUtils.signInWithCustomToken(
        window.auth,
        __initial_auth_token,
      );
    } else {
      try {
        await window.authUtils.signInAnonymously(window.auth);
      } catch (e) {
        if (
          e.code === "auth/admin-restricted-operation" ||
          e.code === "auth/operation-not-allowed"
        ) {
          console.warn(
            "Firebase anonymous sign-in is disabled for this project. الرجاء تسجيل الدخول بالبريد الإلكتروني وكلمة المرور.",
          );
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    console.error("Auth Init Error", e);
  }
}

function listenToAuth() {
  window.authUtils.onAuthStateChanged(window.auth, async (user) => {
    currentUser = user;
    window.currentUser = user; // تصدير المستخدم لملف البوت
    const authView = document.getElementById("auth-view");
    const profileView = document.getElementById("profile-view");

    if (user && !user.isAnonymous) {
      authView.classList.add("hidden");
      profileView.classList.remove("hidden");
      document.getElementById("profile-email").innerText =
        user.email || "مستخدم مسجل";

      const uDoc = await window.firestoreUtils.getDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "users",
          user.uid,
        ),
      );
      const data = uDoc.exists() ? uDoc.data() : {};

      // تحديث بيانات المستخدم في الكائن العام لضمان عمل البوت بشكل صحيح
      if (data.gender) window.currentUser.gender = data.gender;
      if (data.name) window.currentUser.displayName = data.name;
      if (data.phone) window.currentUser.phone = data.phone;

      // التحقق من البريد الإلكتروني للمدير الأساسي وتعيين الدور إذا لم يكن موجوداً
      if (
        user.email &&
        PRIMARY_ADMIN_EMAIL &&
        user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase() &&
        data.role !== "admin"
      ) {
        await window.firestoreUtils.setDoc(
          window.firestoreUtils.doc(
            window.db,
            "artifacts",
            window.appId,
            "users",
            user.uid,
          ),
          { role: "admin" },
          { merge: true },
        );
        data.role = "admin"; // تحديث الدور محلياً بعد التعيين
      }

      if (data.role === "admin") {
        window.currentUserRole = "admin";
        document.body.classList.add("is-admin");
        document.getElementById("admin-badge").classList.remove("hidden");
        document.getElementById("profile-role").innerText = "مدير النظام";
        document.getElementById("profile-role").className =
          "text-[11px] text-amber-500 font-black mb-1";

        const addAdminContainer = document.getElementById(
          "add-admin-container",
        );
        if (addAdminContainer) {
          if (
            user.email &&
            typeof PRIMARY_ADMIN_EMAIL !== "undefined" &&
            user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()
          ) {
            addAdminContainer.classList.remove("hidden");
          } else {
            addAdminContainer.classList.add("hidden");
          }
        }

        if (unsubs.myOrders) {
          unsubs.myOrders();
          delete unsubs.myOrders;
        }
        if (!unsubs.orders) unsubs.orders = listenToOrders();
        // Setup Firestore cart listener for admin
        if (unsubs.userCart) {
          unsubs.userCart();
          delete unsubs.userCart;
        }
        unsubs.userCart = listenToUserCart(user.uid);
      } else {
        window.currentUserRole = "user";
        document.body.classList.remove("is-admin");
        document.getElementById("admin-badge").classList.add("hidden");
        document.getElementById("profile-role").innerText = "عميل مميز";
        document.getElementById("profile-role").className =
          "text-[11px] text-emerald-400 font-black mb-1";

        if (unsubs.orders) {
          unsubs.orders();
          delete unsubs.orders;
        }
        // Setup Firestore cart listener for regular user
        if (unsubs.userCart) {
          unsubs.userCart();
          delete unsubs.userCart;
        }
        unsubs.userCart = listenToUserCart(user.uid);
        if (!unsubs.myOrders) unsubs.myOrders = loadUserOrders();
      }

      // إذا كان المستخدم جديداً وليس له دور، عينه كـ 'user'
      if (!uDoc.exists() && user.email) {
        await window.firestoreUtils.setDoc(
          window.firestoreUtils.doc(
            window.db,
            "artifacts",
            window.appId,
            "users",
            user.uid,
          ),
          {
            email: user.email,
            role: "user",
            uid: user.uid,
            createdAt: window.firestoreUtils.serverTimestamp(),
          },
        );
        window.currentUserRole = "user";
      }
    } else {
      window.currentUserRole = null;
      authView.classList.remove("hidden");
      profileView.classList.add("hidden");
      document.body.classList.remove("is-admin");
      if (unsubs.orders) {
        unsubs.orders();
        delete unsubs.orders;
      }
      if (unsubs.myOrders) {
        unsubs.myOrders();
        delete unsubs.myOrders;
      }
      // Clear user cart and unsubscribe when user logs out
      if (unsubs.userCart) {
        unsubs.userCart();
        delete unsubs.userCart;
      }
      userFirestoreCart = [];
      updateCartBadge(); // Update badge to 0
    }
  });
}

function listenToUserCart(uid) {
  const q = window.firestoreUtils.query(
    window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "users",
      uid,
      "cartItems",
    ),
  );
  return window.firestoreUtils.onSnapshot(
    q,
    (snap) => {
      userFirestoreCart = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCart(); // Re-render cart whenever it changes in Firestore
      updateCartBadge();
    },
    (error) => console.error("Error listening to user cart:", error),
  );
}
function updateCartBadge() {
  const badge = document.getElementById("cart-badge");
  let totalItems = 0;
  if (currentUser && !currentUser.isAnonymous) {
    totalItems = userFirestoreCart.reduce(
      (sum, item) => sum + (item.orderedQuantity || 0),
      0,
    );
  } else {
    totalItems = cart.reduce(
      (sum, item) => sum + (item.orderedQuantity || 0),
      0,
    );
  }
  badge.innerText = totalItems || 0;
  if (!totalItems || totalItems <= 0) badge.classList.add("scale-0");
  else badge.classList.remove("scale-0");
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
  return window.firestoreUtils.onSnapshot(
    q,
    (snap) => {
      categories = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.name && c.name.trim() && c.id !== "init_check");
      window.categories = categories; // تحديث المرجع للبوت
      renderCategories();
      updateCategorySelects();
      if (document.body.classList.contains("is-admin")) renderAdminCategories();
    },
    (error) => console.error(error),
  );
}

function getCategoryImageValue() {
  const base64 = document.getElementById("c-img-base64").value.trim();
  const url = document.getElementById("c-img-url")
    ? document.getElementById("c-img-url").value.trim()
    : "";
  return base64 || url;
}

function applyCategoryImageUrl() {
  const url = document.getElementById("c-img-url").value.trim();
  if (!url) return;
  const preview = document.getElementById("c-img-preview");
  preview.src = url;
  preview.classList.remove("hidden");
  document.getElementById("c-img-base64").value = url;
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
  return window.firestoreUtils.onSnapshot(
    q,
    (snap) => {
      products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      window.products = products; // تحديث المرجع للبوت
      renderProducts();
      if (document.body.classList.contains("is-admin")) renderAdminProducts();
    },
    (error) => console.error(error),
  );
}

/* ========================================================
   Image Upload & Compression Logic (Base64 for Firestore)
======================================================== */
function handleImageUpload(event, previewId, base64Id, maxWidth) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function (e) {
    const img = new Image();
    img.src = e.target.result;
    img.onload = function () {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL("image/webp", 0.8);

      document.getElementById(base64Id).value = compressedDataUrl;
      const preview = document.getElementById(previewId);
      preview.src = compressedDataUrl;
      preview.classList.remove("hidden");
    };
  };
}

/* ========================================================
   GPS Location Logic
======================================================== */
function getLocationGPS() {
  if (navigator.geolocation) {
    const btn = document.getElementById("btn-gps");
    const ogHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> جاري التحديد...`;
    lucide.createIcons();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById("order-coords").value =
          `${pos.coords.latitude},${pos.coords.longitude}`;
        document.getElementById("order-address").value +=
          ` [تم تحديد الموقع عبر GPS]`;
        btn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> تم التحديد`;
        btn.classList.remove(
          "text-emerald-500",
          "bg-emerald-50",
          "hover:bg-emerald-100",
        );
        btn.classList.add("text-white", "bg-emerald-500");
        lucide.createIcons();
        showNotification("تم التقاط موقعك بنجاح");
      },
      (error) => {
        btn.innerHTML = ogHtml;
        alert(
          "فشل في تحديد الموقع. يرجى التأكد من تفعيل خدمة الـ GPS في جهازك وإعطاء الصلاحية للمتصفح.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  } else {
    alert("متصفحك لا يدعم تحديد الموقع.");
  }
}

/* ========================================================
   Payment UI Logic
======================================================== */
function togglePaymentUI() {
  const method = document.querySelector(
    'input[name="payment-method"]:checked',
  ).value;
  const visaForm = document.getElementById("visa-form");
  const btn = document.getElementById("btn-place-order");

  if (method === "visa") {
    visaForm.classList.remove("hidden");
    btn.innerHTML = `<i data-lucide="credit-card" class="w-6 h-6"></i> ادفع وأتمم الطلب`;
  } else {
    visaForm.classList.add("hidden");
    btn.innerHTML = `<i data-lucide="check-circle" class="w-6 h-6"></i> إتمام الطلب الآن`;
  }
  lucide.createIcons();
}

function formatCC(input) {
  let v = input.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
  let matches = v.match(/\d{4,16}/g);
  let match = (matches && matches[0]) || "";
  let parts = [];
  for (let i = 0, len = match.length; i < len; i += 4) {
    parts.push(match.substring(i, i + 4));
  }
  if (parts.length) {
    input.value = parts.join(" ");
  } else {
    input.value = v;
  }
}

function formatExp(input) {
  let v = input.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
  if (v.length >= 2) {
    input.value = v.substring(0, 2) + "/" + v.substring(2, 4);
  } else {
    input.value = v;
  }
}

/* ========================================================
   Render Functions
======================================================== */
function escapeHTML(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function renderCategories() {
  const container = document.getElementById("categories-container");

  // Always display only top-level categories in the top scroll bar
  const visibleCategories = categories.filter(
    (c) => !c.parentId || c.parentId === "",
  );

  if (visibleCategories.length === 0) {
    container.innerHTML = `<div class="text-sm font-bold text-slate-400 py-6 w-full text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">لا توجد أقسام رئيسية</div>`;
    return;
  }

  let html = "";

  html += visibleCategories
    .map((c, i) => {
      // إذا كان القسم الحالي أو القسم الأعلى منه هو نفس القسم، نجعله مفعلاً (Active)
      let isActive = false;
      if (window.currentParentId === c.id) isActive = true;
      if (window.activeSubCategoryName) {
        // إذا كنا عرضنا قسم فرعي، نتأكد إذا كان ينتمي لهذا القسم الرئيسي
        const currentSubCat = categories.find(
          (sub) =>
            sub.name === window.activeSubCategoryName && sub.parentId === c.id,
        );
        if (currentSubCat || window.currentParentId === c.id) isActive = true;
      }

      return `
        <div onclick="filterByCategory('${c.id}')" class="snap-item flex-shrink-0 w-20 sm:w-24 flex flex-col items-center cursor-pointer group animate-fade-in-up stagger-delay-${(i % 3) + 1}">
            <div class="w-20 h-24 sm:w-24 sm:h-28 ${isActive ? "bg-emerald-50 border-emerald-300 shadow-md" : "bg-white border-slate-100"} rounded-[1.5rem] flex items-center justify-center mb-2 shadow-sm border overflow-hidden relative transition-all duration-300 transform group-hover:-translate-y-1 group-active:scale-95 group-hover:shadow-md group-hover:border-emerald-200">
                ${
                  c.img
                    ? `<img src="${c.img}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-${isActive ? "100" : "90"}">`
                    : `<i data-lucide="layers" class="${isActive ? "text-emerald-600" : "text-emerald-500"} w-8 h-8 sm:w-10 sm:h-10 transition-transform group-hover:scale-110"></i>`
                }
                ${isActive ? `<div class="absolute bottom-0 w-full h-1.5 bg-emerald-500"></div>` : ""}
                <div class="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <span class="text-[11px] sm:text-xs font-black ${isActive ? "text-emerald-800" : "text-slate-700"} text-center leading-tight transition-colors">${c.name}</span>
        </div>
      `;
    })
    .join("");

  container.innerHTML = html;
  lucide.createIcons();
}

function renderSubCategoriesAsGrid(parentId) {
  const grid = document.getElementById("products-grid");
  const subCats = categories.filter((c) => c.parentId === parentId);

  let html = "";

  // زر إضافة قسم فرعي للمدير
  if (isAdminUser()) {
    html += `
        <div onclick="openCategoryModal('${parentId}')" class="bg-slate-50 rounded-[1.5rem] p-4 sm:p-6 border-2 border-dashed border-slate-300 cursor-pointer shadow-sm hover:shadow-md transition-all hover:bg-slate-100 group flex flex-col items-center justify-center text-center">
            <div class="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm border border-slate-200 group-hover:scale-110 transition-transform text-slate-400 group-hover:text-amber-500">
                <i data-lucide="plus" class="w-8 h-8 sm:w-10 sm:h-10"></i>
            </div>
            <h4 class="text-sm sm:text-base font-black text-slate-500 group-hover:text-amber-600 transition-colors">إضافة قسم فرعي</h4>
        </div>
    `;
  }

  if (subCats.length === 0 && !isAdminUser()) {
    grid.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                <i data-lucide="layers" class="w-16 h-16 mb-4 text-slate-300"></i>
                <p class="text-lg font-black text-slate-500">لا توجد أقسام فرعية بعد</p>
            </div>`;
    lucide.createIcons();
    return;
  }

  html += subCats
    .map(
      (c, i) => `
        <div onclick="filterByCategory('${c.id}')" class="bg-gradient-to-br from-emerald-50 to-emerald-100/40 rounded-[1.5rem] p-4 sm:p-6 border border-emerald-100 cursor-pointer shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group flex flex-col items-center justify-center text-center animate-fade-in-up stagger-delay-${(i % 4) + 1}">
            <div class="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm border border-emerald-50 group-hover:scale-110 transition-transform text-emerald-500 relative">
                ${
                  c.img
                    ? `<img src="${c.img}" class="w-full h-full object-cover rounded-full">`
                    : `<i data-lucide="folder-open" class="w-8 h-8 sm:w-10 sm:h-10"></i>`
                }
                ${isAdminUser() ? `<button onclick="event.stopPropagation(); editCategory('${c.id}')" class="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-amber-500 w-8 h-8 flex items-center justify-center rounded-full shadow border border-slate-100 transition-colors"><i data-lucide="edit-2" class="w-4 h-4"></i></button>` : ""}
            </div>
            <h4 class="text-sm sm:text-base font-black text-slate-800 group-hover:text-[#1B4332] transition-colors">${c.name}</h4>
        </div>
  `,
    )
    .join("");

  grid.innerHTML = html;
  lucide.createIcons();
}

function filterByCategory(catId) {
  if (catId === "all") {
    window.currentParentId = null;
    window.activeSubCategoryName = null;
    document.getElementById("current-category-title").innerHTML =
      `<i data-lucide="grid" class="w-5 h-5 text-[#1B4332]"></i> الأقسام الرئيسية`;
    renderCategories();
    renderProducts(products);
    updateBulkAddButton();
    return;
  }

  // إصلاح الخطأ: البحث عن القسم بالمعرف أو بالاسم لضمان التوافق
  const cat = categories.find((c) => c.id === catId || c.name === catId);

  // حماية لمنع الانهيار في حال لم يتم العثور على القسم
  if (!cat) return;

  const hasChildren = categories.some((c) => c.parentId === cat.id);

  if (hasChildren) {
    // إذا كان قسماً رئيسياً يحتوي على أقسام فرعية، ندخل بداخله
    window.currentParentId = cat.id;
    window.activeSubCategoryName = null;
    document.getElementById("current-category-title").innerHTML =
      `<i data-lucide="folder" class="w-5 h-5 text-emerald-500"></i> فرع: ${cat.name}`;
    renderCategories();
    renderSubCategoriesAsGrid(cat.id);
  } else {
    // إذا كان قسماً فرعياً (نهائي)، نعرض المنتجات
    window.activeSubCategoryName = cat.name;
    document.getElementById("current-category-title").innerHTML =
      `<i data-lucide="filter" class="w-5 h-5 text-emerald-500"></i> قسم: ${cat.name}`;
    const filtered = products.filter((p) => p.category === cat.name);
    // تحديث الأقسام في الشريط العلوي لتظل تظهر أقسام نفس المستوى
    if (cat.parentId !== window.currentParentId) {
      window.currentParentId = cat.parentId;
      renderCategories();
    }
    renderProducts(filtered);
  }
  updateBulkAddButton();
  lucide.createIcons();
}

function updateBulkAddButton() {
  const container = document.getElementById("bulk-add-container");
  if (!container) return;

  if (isAdminUser() && window.activeSubCategoryName) {
    container.innerHTML = `
            <button onclick="openBulkImportModal()" class="text-xs bg-amber-500 text-white px-4 py-2 rounded-full font-bold hover:bg-amber-600 transition-all shadow-sm flex items-center gap-1.5 animate-bounce">
                <i data-lucide="plus-circle" class="w-4 h-4"></i> إضافة سريعة لـ ${window.activeSubCategoryName}
            </button>
        `;
  } else {
    container.innerHTML = "";
  }
  lucide.createIcons();
}

function searchProducts(term) {
  if (!term) return renderProducts(products);
  term = term.toLowerCase();
  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term)),
  );
  document.getElementById("current-category-title").innerHTML =
    `<i data-lucide="search" class="w-5 h-5 text-emerald-500"></i> نتائج البحث`;
  renderProducts(filtered);
}

function renderProducts(data = products) {
  const grid = document.getElementById("products-grid");
  if (data.length === 0) {
    grid.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                <i data-lucide="package-open" class="w-16 h-16 mb-4 text-slate-300"></i>
                <p class="text-lg font-black text-slate-500">لا توجد منتجات هنا بعد</p>
            </div>`;
    lucide.createIcons();
    return;
  }
  grid.innerHTML = data
    .map(
      (p, i) => `
        <div class="bg-white rounded-[1.5rem] p-3 border border-slate-100 card-shadow relative group flex flex-col h-full animate-fade-in-up stagger-delay-${(i % 4) + 1}">
            <div class="h-32 sm:h-36 bg-slate-50 rounded-xl mb-3 overflow-hidden flex items-center justify-center relative">
                ${
                  p.img
                    ? `<img src="${p.img}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">`
                    : `<i data-lucide="image" class="w-10 h-10 text-slate-200"></i>`
                }
                <span class="absolute top-2 right-2 bg-[#1B4332]/90 backdrop-blur-md text-[10px] px-2.5 py-1 rounded-lg text-white font-bold shadow-sm border border-emerald-400/30">${p.category || "عام"}</span>
                ${p.maxOrderQuantity ? `<span class="absolute bottom-2 left-2 bg-amber-500/90 backdrop-blur-md text-[8px] px-2 py-1 rounded-lg text-white font-black shadow-sm border border-amber-300/20">أقصى حد: ${p.maxOrderQuantity}</span>` : ""}
                ${
                  isAdminUser()
                    ? `
                <div class="absolute top-2 left-2 flex gap-1 z-10">
                    <button onclick="event.stopPropagation(); editProduct('${p.id}')" class="bg-white/90 backdrop-blur w-7 h-7 flex items-center justify-center rounded-lg shadow-sm border border-slate-200 text-slate-400 hover:text-blue-500 transition-colors"><i data-lucide="edit-2" class="w-3.5 h-3.5"></i></button>
                    <button onclick="event.stopPropagation(); deleteDocConfirm('products', '${p.id}', '${escapeHTML(p.name)}')" class="bg-white/90 backdrop-blur w-7 h-7 flex items-center justify-center rounded-lg shadow-sm border border-slate-200 text-slate-400 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
                `
                    : ""
                }
            </div>
            <div class="flex-1 flex flex-col px-1">
                <h4 class="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2 leading-tight mb-2">${p.name}</h4>
                <div class="text-[10px] text-emerald-700 font-bold mb-1">${p.unit || "قطعة"} • ${p.price} ج.م</div>
                <p class="text-[9px] text-slate-400 font-bold mb-2">أقل كمية: ${p.minOrderQuantity || 1} ${p.unit || ""}</p>
                <div class="mt-auto pt-2 flex items-center justify-between border-t border-slate-50">
                    <div class="flex-1">
                        <input type="number" id="qty-${p.id}" 
                            value="${p.minOrderQuantity || 1}" 
                            min="${p.minOrderQuantity || 1}" 
                            max="${p.maxOrderQuantity || ""}" 
                            class="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-bold focus:outline-none focus:border-emerald-500"
                            placeholder="كمية">
                    </div>
                    <button onclick="addToCart('${p.id}', '${escapeHTML(p.name)}', ${p.price}, '${p.unit || "قطعة"}')" class="w-8 h-8 sm:w-10 sm:h-10 bg-[#1B4332] text-white rounded-lg sm:rounded-xl flex items-center justify-center hover:bg-[#2D6A4F] transition-all active:scale-90 shadow-lg shadow-emerald-900/10 ml-2">
                        <i data-lucide="plus" class="w-4 h-4 sm:w-5 sm:h-5"></i>
                    </button>
                </div>
            </div>
        </div>
    `,
    )
    .join("");
  lucide.createIcons();
}

/* ========================================================
   Admin Logic
======================================================== */
function showAdminSubTab(type) {
  if (!ensureAdmin("عرض لوحة الإدارة")) return;
  ["p", "c", "o"].forEach((t) => {
    document.getElementById(`admin-tab-${t}`).className =
      "flex-1 py-3 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 transition-all";
    document.getElementById(`admin-${t}-list`).classList.add("hidden");
  });
  document.getElementById(`admin-tab-${type}`).className =
    "flex-1 py-3 rounded-xl text-xs font-black bg-white shadow-sm text-primary transition-all relative";
  document.getElementById(`admin-${type}-list`).classList.remove("hidden");
  document
    .getElementById(`admin-${type}-list`)
    .classList.add("animate-fade-in-up");
}

function renderAdminProducts() {
  const container = document.getElementById("admin-p-list");
  container.innerHTML = products
    .map(
      (p) => `
        <div class="bg-white p-3 rounded-2xl border border-slate-100 flex items-center justify-between card-shadow">
            <div class="flex items-center gap-3 w-2/3">
                <div class="w-14 h-14 bg-slate-50 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-50">
                    ${p.img ? `<img src="${p.img}" class="w-full h-full object-cover">` : `<i data-lucide="image" class="w-5 h-5 text-slate-300"></i>`}
                </div>
                <div class="truncate">
                    <p class="font-black text-sm text-slate-800 truncate">${p.name}</p>
                    <p class="text-emerald-500 text-xs font-bold mt-1">${p.price} ج.م/${p.unit || "قطعة"} <span class="text-slate-400 font-normal">| ${p.category || "بدون قسم"}</span></p>
                    <p class="text-slate-400 text-[10px] font-bold"> الأدنى: ${p.minOrderQuantity || 1} | الأقصى: ${p.maxOrderQuantity || "∞"} | المخزون: ${p.stock || 0}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="updateProductPrice('${p.id}')" title="تحديث السعر فقط" class="p-2.5 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors"><i data-lucide="dollar-sign" class="w-4 h-4"></i></button>
                <button onclick="editProduct('${p.id}')" class="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="deleteDocConfirm('products', '${p.id}')" class="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>
    `,
    )
    .join("");
  lucide.createIcons();
}

function renderAdminCategories() {
  const container = document.getElementById("admin-c-list");
  container.innerHTML = categories
    .map(
      (c) => `
        <div class="bg-white p-3 rounded-2xl border border-slate-100 flex items-center justify-between card-shadow">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden border border-slate-50">
                    ${c.img ? `<img src="${c.img}" class="w-full h-full object-cover">` : `<i data-lucide="folder" class="w-6 h-6 text-[#1B4332]"></i>`}
                </div>
                <div>
                    <p class="font-black text-sm text-slate-800">${c.name}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="editCategory('${c.id}')" title="تعديل القسم" class="p-2.5 bg-slate-50 text-slate-500 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition-colors"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="deleteDocConfirm('categories', '${c.id}')" title="حذف القسم" class="p-2.5 bg-slate-50 text-slate-500 rounded-xl hover:bg-red-50 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>
    `,
    )
    .join("");
  lucide.createIcons();
}

async function saveProduct() {
  if (!ensureAdmin("حفظ المنتج")) return;
  const btn = document.getElementById("btn-save-prod");
  const originalText = btn.innerText;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
  lucide.createIcons();
  btn.disabled = true;

  const codeField = document.getElementById("p-code").value.trim();
  const data = {
    name: document.getElementById("p-name").value.trim(),
    price: Number(document.getElementById("p-price").value),
    unit: document.getElementById("p-unit").value,
    quantities: document
      .getElementById("p-quantities")
      .value.split(",")
      .map((q) => parseFloat(q.trim()))
      .filter((q) => !isNaN(q)),
    minOrderQuantity: Number(document.getElementById("p-min-qty")?.value || 1),
    maxOrderQuantity: document.getElementById("p-max-qty")?.value
      ? Number(document.getElementById("p-max-qty").value)
      : null,
    stock: Number(document.getElementById("p-stock")?.value || 0),
    img: document.getElementById("p-img-base64").value,
    category: document.getElementById("p-cat").value,
    code: codeField || "",
  };

  if (!data.name || !data.price || !data.category || !data.unit) {
    alert("يرجى إكمال البيانات الأساسية (الاسم، السعر، القسم، الوحدة)");
    btn.innerText = originalText;
    btn.disabled = false;
    return;
  }

  // التحقق من عدم تكرار المنتج (الاسم في نفس القسم أو الكود)
  const isDuplicate = products.find(
    (p) =>
      (p.name.toLowerCase().trim() === data.name.toLowerCase().trim() &&
        p.category === data.category &&
        p.id !== editingId) ||
      (data.code &&
        p.code.toLowerCase().trim() === data.code.toLowerCase().trim() &&
        p.id !== editingId),
  );

  if (isDuplicate) {
    alert(
      "عذراً، هذا المنتج موجود بالفعل في هذا القسم (سواء بالاسم أو بالكود).",
    );
    btn.innerText = originalText;
    btn.disabled = false;
    return;
  }

  if (data.quantities.length === 0) {
    data.quantities = [1]; // افتراضياً كمية واحدة إذا لم يتم تحديد كميات
  }

  if (!data.code) {
    data.code = `P-${Date.now()}`;
  }

  try {
    if (editingId && editingType === "product") {
      await window.firestoreUtils.updateDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "public",
          "data",
          "products",
          editingId,
        ),
        data,
      );
      showNotification("تم تعديل المنتج بنجاح");
    } else {
      await window.firestoreUtils.addDoc(
        window.firestoreUtils.collection(
          window.db,
          "artifacts",
          window.appId,
          "public",
          "data",
          "products",
        ),
        data,
      );
      showNotification("تمت إضافة المنتج بنجاح");
    }
    closeModals();
  } catch (e) {
    alert("حدث خطأ أثناء الحفظ. قد تكون الصورة كبيرة جداً.");
    console.error(e);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

async function saveCategory() {
  if (!ensureAdmin("حفظ القسم")) return;
  const btn = document.getElementById("btn-save-cat");
  const originalText = btn.innerText;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
  lucide.createIcons();
  btn.disabled = true;

  const name = document.getElementById("c-name").value.trim();
  const parentId = document.getElementById("c-parent").value;
  const img = getCategoryImageValue();

  if (!name) {
    alert("اسم القسم مطلوب");
    btn.innerText = originalText;
    btn.disabled = false;
    return;
  }

  // التحقق من عدم تكرار القسم
  const isDuplicate = categories.find(
    (c) =>
      c.name.toLowerCase().trim() === name.toLowerCase().trim() &&
      c.id !== editingId,
  );
  if (isDuplicate) {
    alert("هذا القسم موجود بالفعل.");
    btn.innerText = originalText;
    btn.disabled = false;
    return;
  }

  try {
    if (editingId && editingType === "category") {
      await window.firestoreUtils.updateDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "public",
          "data",
          "categories",
          editingId,
        ),
        { name, img, parentId },
      );
      showNotification("تم تحديث القسم");
    } else {
      await window.firestoreUtils.addDoc(
        window.firestoreUtils.collection(
          window.db,
          "artifacts",
          window.appId,
          "public",
          "data",
          "categories",
        ),
        { name, img, parentId },
      );
      showNotification("تم إضافة قسم جديد");
    }
    closeModals();
  } catch (e) {
    alert("حدث خطأ");
    console.error(e);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

async function confirmOrder(orderId, event) {
  if (!ensureAdmin("تأكيد الطلب")) return;
  const target = event ? event.target : null;
  const btn = target ? target.closest("button") : null; // Ensure event is defined
  const originalHtml = btn ? btn.innerHTML : ""; // Ensure btn is not null

  if (btn) {
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> جاري.. .`;
    btn.disabled = true;
  }
  lucide.createIcons();

  try {
    // تحديث حالة الطلب
    await window.firestoreUtils.updateDoc(
      window.firestoreUtils.doc(
        window.db,
        "artifacts",
        window.appId,
        "public",
        "data",
        "orders",
        orderId,
      ),
      { status: "مؤكد", confirmedAt: window.firestoreUtils.serverTimestamp() },
    );

    showToast("✅ تم تأكيد الطلب بنجاح!", "success", 3000);

    // إضافة إشعار في الـ notification panel
    createNotification(
      "✨ تم تأكيد الطلب",
      "تم تأكيد أحد الطلبات بنجاح سيتم إرساله قريباً.",
      "success",
      "check",
      "عرض الطلب",
      () => showTab("account"),
    );
  } catch (e) {
    console.error(e);
    alert("فشل تأكيد الطلب");
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

async function deleteDocConfirm(col, id) {
  if (!ensureAdmin("حذف العنصر")) return;
  if (confirm("هل أنت متأكد من عملية الحذف؟ لا يمكن التراجع عن هذا الإجراء.")) {
    try {
      await window.firestoreUtils.deleteDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "public",
          "data",
          col,
          id,
        ),
      );
      showNotification("تم الحذف بنجاح");
    } catch (e) {
      alert("فشل الحذف");
    }
  }
}

function updateCategorySelects() {
  const select = document.getElementById("p-cat");
  const bulkSelect = document.getElementById("bulk-cat");
  const bulkPriceSelect = document.getElementById("bulk-price-cat");
  const parentSelect = document.getElementById("c-parent");

  // تحديث قائمة الأقسام الرئيسية في نافذة إضافة الأقسام
  if (parentSelect) {
    const mainCats = categories.filter((c) => !c.parentId || c.parentId === "");
    parentSelect.innerHTML =
      '<option value="">-- قسم رئيسي --</option>' +
      mainCats
        .map((c) => `<option value="${c.id}">${c.name}</option>`)
        .join("");
  }

  const currentVal = select ? select.value : "";
  const currentBulk = bulkSelect ? bulkSelect.value : "";
  const currentBulkPrice = bulkPriceSelect ? bulkPriceSelect.value : "";
  const options =
    '<option value="">-- اختر القسم التابع له --</option>' +
    categories
      .map((c) => `<option value="${c.name}">${c.name}</option>`)
      .join("");
  const bulkPriceOptions =
    '<option value="">-- كل الأقسام (تحديث شامل) --</option>' +
    categories
      .map((c) => `<option value="${c.name}">${c.name}</option>`)
      .join("");
  if (select) {
    select.innerHTML = options;
    if (currentVal) select.value = currentVal;
  }
  if (bulkSelect) {
    bulkSelect.innerHTML = options;
    if (currentBulk) bulkSelect.value = currentBulk;
  }
  if (bulkPriceSelect) {
    bulkPriceSelect.innerHTML = bulkPriceOptions;
    if (currentBulkPrice) bulkPriceSelect.value = currentBulkPrice;
  }
}

/* ========================================================
   Modal Handlers
======================================================== */
function resetImageUpload(previewId, base64Id, inputId, urlId) {
  document.getElementById(base64Id).value = "";
  document.getElementById(previewId).src = "";
  document.getElementById(previewId).classList.add("hidden");
  document.getElementById(inputId).value = "";
  if (urlId) document.getElementById(urlId).value = "";
}

function openProductModal() {
  if (!ensureAdmin("فتح نافذة إضافة أو تعديل المنتج")) return;
  editingId = null;
  editingType = "product";
  document.getElementById("p-name").value = "";
  document.getElementById("p-price").value = "";
  document.getElementById("p-unit").value = "كيلو";
  document.getElementById("p-quantities").value = "5,10,20,50,100";
  document.getElementById("p-cat").value = "";
  if (document.getElementById("p-min-qty"))
    document.getElementById("p-min-qty").value = "1";
  if (document.getElementById("p-max-qty"))
    document.getElementById("p-max-qty").value = "";
  if (document.getElementById("p-stock"))
    document.getElementById("p-stock").value = "100";
  document.getElementById("p-code").value = "";
  resetImageUpload("p-img-preview", "p-img-base64", "p-img-upload");

  const m = document.getElementById("product-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}
function openCategoryModal(parentId = "") {
  if (!ensureAdmin("فتح نافذة إضافة أو تعديل القسم")) return;
  editingId = null;
  editingType = "category";
  document.getElementById("c-name").value = "";

  // تحديث قائمة الأقسام قبل تعيين القيمة
  updateCategorySelects();

  const parentSelect = document.getElementById("c-parent");
  if (parentSelect) {
    if (typeof parentId === "string" && parentId.length > 0) {
      parentSelect.value = parentId;
    } else {
      parentSelect.value = "";
    }
  }

  resetImageUpload(
    "c-img-preview",
    "c-img-base64",
    "c-img-upload",
    "c-img-url",
  );

  const m = document.getElementById("category-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function openBulkImportModal() {
  editingId = null;
  editingType = null;
  document.getElementById("bulk-sheet-data").value = "";
  document.getElementById("bulk-unit").value = "كيلو";
  document.getElementById("bulk-quantities").value = "5,10,20,50,100";
  const keywordInput = document.getElementById("bulk-keywords");
  if (keywordInput) keywordInput.value = "";

  // إخفاء حقول الإعدادات إذا كنا نضيف لقسم محدد لتبسيط الواجهة
  const modalTitle = document.querySelector("#bulk-import-modal h3");
  if (window.activeSubCategoryName) {
    modalTitle.innerText = `إضافة سريعة إلى: ${window.activeSubCategoryName}`;
  }

  const m = document.getElementById("bulk-import-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function closeBulkImportModal() {
  const m = document.getElementById("bulk-import-modal");
  m.classList.add("hidden");
  m.classList.remove("flex");
}

// دالة ذكية لتحليل أسطر الشيت والتعرف على البيانات
function parseBulkProductRows(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line);
  const products = [];
  if (rows.length === 0) return products;

  const separators = [",", "\t", "|", ";"];
  let sep = ",";
  let maxFields = 0;
  separators.forEach((s) => {
    const count = rows[0].split(s).length;
    if (count > maxFields) {
      maxFields = count;
      sep = s;
    }
  });

  rows.forEach((line) => {
    const cells = line.split(sep).map((c) => c.trim());
    if (cells.length < 2) return;

    let price = 0;
    let potentialNames = [];
    let code = "";

    cells.forEach((cell) => {
      const num = parseFloat(cell.replace(/[^0-9.]/g, ""));
      // إذا كان رقم منطقي (سعر) وليس ضخماً جداً كأنه باركود
      if (!isNaN(num) && num > 0 && num < 1000000 && price === 0) {
        price = num;
      }
      // إذا كان نص يحتوي على حروف (اسم محتمل)
      else if (/[a-zA-Z\u0600-\u06FF]/.test(cell)) {
        potentialNames.push(cell);
      }
      // إذا كان رقماً طويلاً (باركود محتمل)
      else if (!isNaN(parseFloat(cell)) && cell.length >= 4 && code === "") {
        code = cell;
      }
    });

    // اختيار أطول نص ليكون هو اسم المنتج (لتجنب كلمات مثل "تام" أو "نعم")
    let name =
      potentialNames.length > 0
        ? potentialNames.reduce((a, b) => (a.length > b.length ? a : b))
        : "";

    if (name && price > 0) {
      products.push({ name, price, code, category: "عام" });
    }
  });
  return products;
}

async function extractTextFromPDF(file) {
  if (!window.pdfjsLib) throw new Error("pdfjsLib غير محمل");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.172/pdf.worker.min.js";
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

async function handleBulkFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  let dataText = "";
  try {
    if (["csv", "tsv", "txt"].includes(ext)) {
      dataText = await file.text();
    } else if (["xls", "xlsx"].includes(ext)) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      dataText = XLSX.utils.sheet_to_csv(sheet);
    } else if (ext === "pdf") {
      dataText = await extractTextFromPDF(file);
    } else {
      alert("نوع الملف غير مدعوم. استخدم PDF أو Excel أو CSV.");
      return;
    }
    document.getElementById("bulk-sheet-data").value = dataText.trim();
    showNotification("تم تحميل الملف بنجاح، تحقق من البيانات قبل الإضافة.");
  } catch (e) {
    console.error(e);
    alert("فشل تحميل الملف. تأكد من أنه صالح وحاول مرة أخرى.");
  } finally {
    event.target.value = "";
  }
}

// تحسين دالة التنظيف لتكون أكثر شمولاً وتعامل مع الحالات المختلفة في النصوص العربية لضمان تطابق أفضل مع الكلمات الدلالية
function normalizeArabic(text) {
  if (!text) return "";
  let str = text
    .toString()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
  const hindiDigits = [
    /٠/g,
    /١/g,
    /٢/g,
    /٣/g,
    /٤/g,
    /٥/g,
    /٦/g,
    /٧/g,
    /٨/g,
    /٩/g,
  ];
  const englishDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let i = 0; i < 10; i++)
    str = str.replace(hindiDigits[i], englishDigits[i]);
  return str
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\bال(?=[^ ]{3,})/g, "")
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// توحيد دالة الحفظ وإصلاح مسار Firebase واستخدام الأدوات الصحيحة
async function saveBulkProducts() {
  if (!ensureAdmin("إضافة المنتجات دفعة واحدة")) return;
  const activeCat = window.activeSubCategoryName;
  if (!activeCat) return alert("يرجى اختيار قسم فرعي أولاً");

  const btn = document.getElementById("btn-save-bulk");
  const raw = document.getElementById("bulk-sheet-data").value;
  const keywordsInput =
    document.getElementById("bulk-keywords")?.value.trim() || "";
  const keywords = keywordsInput
    .split(",")
    .map((k) => normalizeArabic(k))
    .filter((k) => k);

  if (!raw.trim()) return alert("يرجى لصق بيانات الجدول أولاً");

  let allItems = parseBulkProductRows(raw);
  let itemsToSave = allItems.filter((item) => {
    if (!item || !item.name) return false;
    if (keywords.length === 0) return true;

    const normalizedName = normalizeArabic(item.name);
    // البحث الذكي: يجب أن يحتوي الاسم على كل الكلمات الموجودة في إحدى العبارات الدالة
    return keywords.some((keywordPhrase) => {
      const words = keywordPhrase.split(/\s+/).filter((w) => w.length > 0);
      return words.every((word) => normalizedName.includes(word));
    });
  });

  if (itemsToSave.length === 0)
    return alert(
      "لم يتم العثور على منتجات مطابقة للكلمات الدالة في هذا الجدول.",
    );

  btn.disabled = true;
  const originalText = btn.innerText;
  try {
    const unit = document.getElementById("bulk-unit").value || "كيلو";
    const quantities = document
      .getElementById("bulk-quantities")
      .value.split(",")
      .map((q) => parseFloat(q.trim()))
      .filter((q) => !isNaN(q));
    const productsRef = window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "products",
    );

    const chunkSize = 400;
    for (let i = 0; i < itemsToSave.length; i += chunkSize) {
      const chunk = itemsToSave.slice(i, i + chunkSize);
      const batch = window.firestoreUtils.writeBatch(window.db);
      chunk.forEach((item) => {
        const newDocRef = window.firestoreUtils.doc(productsRef);
        batch.set(newDocRef, {
          name: item.name,
          price: parseFloat(item.price) || 0,
          category: activeCat,
          unit: unit,
          quantities: quantities.length ? quantities : [1],
          code:
            item.code || `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          img: "",
          stock: 100,
          minOrderQuantity: 1,
          createdAt: window.firestoreUtils.serverTimestamp(),
        });
      });
      await batch.commit();
    }
    showNotification(
      `تمت إضافة ${itemsToSave.length} منتجاً بنجاح في قسم ${activeCat}`,
    );
    closeBulkImportModal();
    filterByCategory(activeCat);
  } catch (err) {
    alert("فشل الحفظ: " + err.message);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}
function closeModals() {
  document.getElementById("product-modal").classList.add("hidden");
  document.getElementById("product-modal").classList.remove("flex");
  document.getElementById("category-modal").classList.add("hidden");
  document.getElementById("category-modal").classList.remove("flex");
  editingId = null;
  editingType = null;
}

function editProduct(id) {
  if (!ensureAdmin("تعديل المنتج")) return;
  const p = products.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  editingType = "product";
  document.getElementById("p-name").value = p.name;
  document.getElementById("p-price").value = p.price;
  document.getElementById("p-unit").value = p.unit || "كيلو";
  document.getElementById("p-quantities").value = (p.quantities || [1]).join(
    ",",
  );
  if (document.getElementById("p-min-qty"))
    document.getElementById("p-min-qty").value = p.minOrderQuantity || 1;
  if (document.getElementById("p-max-qty"))
    document.getElementById("p-max-qty").value = p.maxOrderQuantity || "";
  if (document.getElementById("p-stock"))
    document.getElementById("p-stock").value = p.stock || 0;
  document.getElementById("p-cat").value = p.category || "";

  if (p.img) {
    document.getElementById("p-img-base64").value = p.img;
    document.getElementById("p-img-preview").src = p.img;
    document.getElementById("p-img-preview").classList.remove("hidden");
  } else {
    resetImageUpload("p-img-preview", "p-img-base64", "p-img-upload");
  }
  document.getElementById("p-code").value = p.code || "";

  const m = document.getElementById("product-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function editCategory(id) {
  if (!ensureAdmin("تعديل القسم")) return;
  const c = categories.find((x) => x.id === id);
  if (!c) return;
  editingId = id;
  editingType = "category";
  document.getElementById("c-name").value = c.name;
  document.getElementById("c-parent").value = c.parentId || "";

  if (c.img) {
    document.getElementById("c-img-base64").value = c.img;
    document.getElementById("c-img-preview").src = c.img;
    document.getElementById("c-img-preview").classList.remove("hidden");
    if (typeof c.img === "string" && c.img.startsWith("http")) {
      document.getElementById("c-img-url").value = c.img;
    } else {
      document.getElementById("c-img-url").value = "";
    }
  } else {
    resetImageUpload(
      "c-img-preview",
      "c-img-base64",
      "c-img-upload",
      "c-img-url",
    );
  }

  const m = document.getElementById("category-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function updateProductPrice(id) {
  if (!ensureAdmin("تحديث سعر المنتج")) return;
  const p = products.find((x) => x.id === id);
  if (!p) return;

  const content = document.getElementById("price-update-content");
  content.innerHTML = `
        <div class="text-center mb-4">
            <div class="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <i data-lucide="dollar-sign" class="w-8 h-8 text-amber-600"></i>
            </div>
            <h4 class="font-bold text-slate-800 mb-1">${p.name}</h4>
            <p class="text-slate-500 text-sm">السعر الحالي: ${p.price} ج.م/${p.unit || "قطعة"}</p>
        </div>
        <div>
            <label class="text-[11px] font-bold text-slate-500 mb-1.5 block">السعر الجديد (ج.م)</label>
            <input type="number" id="new-price" placeholder="${p.price}" step="0.01" class="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:border-amber-300 focus:ring-4 focus:ring-amber-50 font-semibold text-slate-800" dir="ltr">
        </div>
        <div class="pt-2">
            <button onclick="savePriceUpdate('${id}')" class="w-full bg-[#1B4332] text-white py-4 rounded-2xl font-black shadow-xl shadow-slate-200 hover:bg-[#2D6A4F] transition-colors text-lg">تحديث السعر</button>
        </div>
    `;

  const m = document.getElementById("price-update-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
  document.getElementById("new-price").focus();
  lucide.createIcons();
}

function closePriceUpdateModal() {
  const m = document.getElementById("price-update-modal");
  m.classList.add("hidden");
  m.classList.remove("flex");
}

async function savePriceUpdate(productId) {
  if (!ensureAdmin("حفظ تحديث السعر")) return;
  const newPrice = Number(document.getElementById("new-price").value);
  if (!newPrice || newPrice <= 0) {
    alert("يرجى إدخال سعر صالح أكبر من صفر.");
    return;
  }

  try {
    await window.firestoreUtils.updateDoc(
      window.firestoreUtils.doc(
        window.db,
        "artifacts",
        window.appId,
        "public",
        "data",
        "products",
        productId,
      ),
      {
        price: newPrice,
      },
    );
    showNotification("تم تحديث السعر بنجاح!");
    closePriceUpdateModal();
  } catch (e) {
    console.error(e);
    alert("فشل تحديث السعر. حاول مرة أخرى.");
  }
}

function openBulkPriceUpdateModal() {
  if (!ensureAdmin("فتح نافذة تحديث أسعار القسم")) return;
  document.getElementById("bulk-price-data").value = "";
  document.getElementById("bulk-price-percentage").value = ""; // Clear percentage input
  updateCategorySelects();
  const bulkSelect = document.getElementById("bulk-price-cat");
  if (bulkSelect && !bulkSelect.value && categories.length) {
    bulkSelect.value = categories[0].name;
  }

  const m = document.getElementById("bulk-price-update-modal");
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function closeBulkPriceUpdateModal() {
  const m = document.getElementById("bulk-price-update-modal");
  m.classList.add("hidden");
  m.classList.remove("flex");
  document.getElementById("bulk-price-data").value = "";
  document.getElementById("bulk-price-percentage").value = ""; // Clear percentage input
}

function parseBulkPriceData(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line);
  const priceUpdates = [];
  if (rows.length === 0) return priceUpdates;

  const separators = [",", "\t", "|", ";"];
  let sep = ",";
  let maxFields = 0;
  separators.forEach((s) => {
    const count = rows[0].split(s).length;
    if (count > maxFields) {
      maxFields = count;
      sep = s;
    }
  });

  rows.forEach((line) => {
    const cells = line
      .split(sep)
      .map((c) => c.trim())
      .filter((c) => c !== "");
    if (cells.length < 2) return;

    let price = 0;
    let potentialNames = [];
    let code = "";

    cells.forEach((cell) => {
      const hasLetters = /[a-zA-Z\u0600-\u06FF]/.test(cell);
      const num = parseFloat(cell.replace(/[^0-9.]/g, ""));
      const isLongCode = !hasLetters && cell.replace(/[^0-9]/g, "").length >= 4;

      if (isLongCode && code === "") {
        code = cell;
      } else if (!hasLetters && !isNaN(num) && num > 0 && price === 0) {
        price = num;
      } else if (hasLetters) {
        potentialNames.push(cell);
      }
    });

    if (price === 0 && potentialNames.length > 0) {
      // Fallback: the price cell might have letters like "10 ج.م" or "10 EGP"
      for (let i = potentialNames.length - 1; i >= 0; i--) {
        let pName = potentialNames[i];
        let pNum = parseFloat(pName.replace(/[^0-9.]/g, ""));
        if (!isNaN(pNum) && pNum > 0) {
          price = pNum;
          potentialNames.splice(i, 1);
          break;
        }
      }
    }

    let name = "";
    let category = "";
    if (potentialNames.length > 0) {
      name = potentialNames.reduce((a, b) => (a.length > b.length ? a : b));
      if (potentialNames.length > 1) {
        const others = potentialNames.filter((n) => n !== name);
        category = others[0];
      }
    }

    if (name && price > 0) {
      priceUpdates.push({ code, name, price, category });
    }
  });
  return priceUpdates;
}

async function handleBulkPriceFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  let dataText = "";
  try {
    if (["csv", "tsv", "txt"].includes(ext)) {
      dataText = await file.text();
    } else if (["xls", "xlsx"].includes(ext)) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      dataText = XLSX.utils.sheet_to_csv(sheet);
    } else if (ext === "pdf") {
      dataText = await extractTextFromPDF(file);
    } else {
      alert("نوع الملف غير مدعوم. استخدم PDF أو Excel أو CSV أو TXT.");
      return;
    }
    document.getElementById("bulk-price-data").value = dataText.trim();
    showNotification("تم تحميل الملف بنجاح، تحقق من البيانات قبل التحديث.");
  } catch (e) {
    console.error(e);
    alert("فشل تحميل الملف. تأكد من أنه صالح وحاول مرة أخرى.");
  } finally {
    event.target.value = "";
  }
}

async function saveBulkPriceUpdates() {
  if (!ensureAdmin("تحديث أسعار القسم دفعة واحدة")) return;
  const btn = document.getElementById("btn-save-bulk-prices");
  const originalText = btn.innerText;
  const categoryFilter = document.getElementById("bulk-price-cat").value.trim();
  const rawPriceData = document.getElementById("bulk-price-data").value.trim();
  const percentageIncrease = parseFloat(
    document.getElementById("bulk-price-percentage").value,
  );

  if (!rawPriceData && isNaN(percentageIncrease)) {
    alert("يرجى لصق/رفع بيانات الأسعار، أو إدخال نسبة مئوية للزيادة.");
    return;
  }
  if (!rawPriceData && !categoryFilter && !isNaN(percentageIncrease)) {
    alert(
      "يرجى اختيار القسم لتطبيق نسبة الزيادة المئوية عليه، أو رفع ملف لتحديث الأسعار في كل المتجر.",
    );
    return;
  }

  const updates = [];
  const notFound = [];

  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i> جاري التحديث...`;
  lucide.createIcons();
  btn.disabled = true;

  try {
    const productsRef = window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "products",
    );
    const productsToUpdate = categoryFilter
      ? products.filter(
          (p) =>
            (p.category || "").toLowerCase().trim() ===
            categoryFilter.toLowerCase().trim(),
        )
      : products;

    if (rawPriceData) {
      // Case 1: Update prices from pasted data
      const parsedPriceUpdates = parseBulkPriceData(rawPriceData);
      if (parsedPriceUpdates.length === 0) {
        alert(
          "لم يتم العثور على بيانات أسعار صالحة في النص الملصق. تأكد من أن كل سطر يحتوي على اسم وسعر.",
        );
        btn.innerText = originalText;
        btn.disabled = false;
        return;
      }

      const productsMapByCode = new Map();
      const productsMapByNameCategory = new Map();
      const productsMapByName = new Map(); // Will map name => array of products
      productsToUpdate.forEach((p) => {
        if (p.code) {
          const codeKey = p.code.toLowerCase().trim();
          if (!productsMapByCode.has(codeKey))
            productsMapByCode.set(codeKey, []);
          productsMapByCode.get(codeKey).push(p);
        }
        const nameKey = p.name.toLowerCase().trim();
        const categoryKey = `${nameKey}|${(p.category || "").toLowerCase().trim()}`;

        if (!productsMapByNameCategory.has(categoryKey)) {
          productsMapByNameCategory.set(categoryKey, []);
        }
        productsMapByNameCategory.get(categoryKey).push(p);

        if (!productsMapByName.has(nameKey)) {
          productsMapByName.set(nameKey, []);
        }
        productsMapByName.get(nameKey).push(p);
      });

      parsedPriceUpdates.forEach((update) => {
        const keyName = update.name.toLowerCase().trim();
        const updateCategory =
          update.category && update.category.trim()
            ? update.category.toLowerCase().trim()
            : categoryFilter
              ? categoryFilter.toLowerCase().trim()
              : "";
        const keyCategory = `${keyName}|${updateCategory}`;
        let targetProducts = [];

        if (
          update.code &&
          productsMapByCode.has(update.code.toLowerCase().trim())
        ) {
          targetProducts = productsMapByCode.get(
            update.code.toLowerCase().trim(),
          );
        } else if (
          updateCategory &&
          productsMapByNameCategory.has(keyCategory)
        ) {
          targetProducts = productsMapByNameCategory.get(keyCategory);
        } else if (productsMapByName.has(keyName)) {
          targetProducts = productsMapByName.get(keyName);
        }

        if (targetProducts.length > 0) {
          targetProducts.forEach((product) => {
            updates.push({
              id: product.id,
              name: product.name,
              category: product.category,
              oldPrice: product.price,
              newPrice: update.price,
            });
          });
        } else {
          notFound.push(
            `${update.name}${update.category ? " (" + update.category + ")" : ""}`,
          );
        }
      });
    } else if (!isNaN(percentageIncrease) && percentageIncrease !== 0) {
      // Case 2: Apply percentage increase to all products in the selected category
      if (productsToUpdate.length === 0) {
        alert("لا توجد منتجات لتطبيق الزيادة المئوية عليها.");
        btn.innerText = originalText;
        btn.disabled = false;
        return;
      }
      productsToUpdate.forEach((p) => {
        const newPrice = p.price * (1 + percentageIncrease / 100);
        updates.push({
          id: p.id,
          name: p.name,
          category: p.category,
          oldPrice: p.price,
          newPrice: newPrice,
        });
      });
    }

    if (updates.length === 0) {
      alert("لم يتم العثور على أي منتجات مطابقة لتحديثها.");
      btn.innerText = originalText;
      btn.disabled = false;
      return;
    }

    // Display summary
    const catDisplayName = categoryFilter
      ? `قسم "${categoryFilter}"`
      : "سائر الأقسام";
    let summary = `سيتم تحديث ${updates.length} منتج في ${catDisplayName}:\n\n`;

    // Sort array so it's grouped somewhat nicely
    updates.forEach((u) => {
      const oldP = Number(u.oldPrice || 0);
      const newP = Number(u.newPrice || 0);
      summary += `${u.name} ${u.category ? "(" + u.category + ")" : ""}: ${oldP.toFixed(2)} → ${newP.toFixed(2)} ج.م\n`;
    });
    if (notFound.length > 0) {
      summary += `\nالمنتجات غير الموجودة (${notFound.length}):\n${notFound.join(", ")}`;
    }

    if (!confirm(summary + "\n\nهل تريد المتابعة؟")) {
      btn.innerText = originalText;
      btn.disabled = false;
      return;
    }

    // Perform updates
    for (const update of updates) {
      await window.firestoreUtils.updateDoc(
        window.firestoreUtils.doc(productsRef, update.id),
        {
          price: update.newPrice,
        },
      );
    }
    showNotification(`تم تحديث أسعار ${updates.length} منتج بنجاح!`);
    if (notFound.length > 0) {
      alert(
        `تم تحديث ${updates.length} منتج، لكن لم يتم العثور على المنتجات التالية:\n${notFound.join("\n")}`,
      );
    }
    closeBulkPriceUpdateModal();
  } catch (e) {
    console.error(e);
    alert("حدث خطأ أثناء تحديث الأسعار. حاول مرة أخرى.");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

/* ========================================================
   Auth Logic
======================================================== */
function toggleAuthMode() {
  authMode = authMode === "login" ? "signup" : "login";
  document.getElementById("auth-title").innerText =
    authMode === "login" ? "تسجيل الدخول" : "حساب جديد";
  document.getElementById("auth-btn").innerText =
    authMode === "login" ? "دخول" : "إنشاء الحساب الآن";
  document.getElementById("auth-toggle").innerText =
    authMode === "login"
      ? "مستخدم جديد؟ اضغط هنا لإنشاء حساب"
      : "لديك حساب بالفعل؟ سجل دخولك";

  // إخفاء أو إظهار حقل كود المدير عند التبديل بين تسجيل الدخول وإنشاء حساب
  const signupFields = document.getElementById("signup-fields");
  if (authMode === "login") {
    signupFields.classList.add("hidden");
  } else {
    signupFields.classList.remove("hidden");
    signupFields.classList.add("animate-fade-in-up");
  }
}

async function handleAuth() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  const btn = document.getElementById("auth-btn");

  const name = document.getElementById("full-name").value.trim();
  const gender = document.getElementById("gender").value;
  const phone = document.getElementById("phone").value.trim();

  if (!email || !pass)
    return alert("يرجى إدخال البريد الإلكتروني وكلمة المرور");
  if (authMode === "signup" && (!name || !phone))
    return alert("يرجى إكمال الاسم ورقم الهاتف");

  const ogText = btn.innerText;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i>`;
  lucide.createIcons();
  btn.disabled = true;

  try {
    if (authMode === "signup") {
      const res = await window.authUtils.createUserWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
      let role = "user";
      // إذا كان البريد الإلكتروني هو بريد المدير الأساسي، فاجعله مديراً
      if (email === PRIMARY_ADMIN_EMAIL) {
        role = "admin";
      }
      await window.firestoreUtils.setDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "users",
          res.user.uid,
        ),
        {
          email,
          role,
          uid: res.user.uid,
          name,
          gender,
          phone,
          createdAt: window.firestoreUtils.serverTimestamp(),
        },
      );
      showNotification("تم إنشاء الحساب بنجاح!");
    } else {
      await window.authUtils.signInWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
      showNotification("مرحباً بعودتك!");
    }
  } catch (e) {
    let msg = "حدث خطأ غير متوقع.";
    if (e.code === "auth/email-already-in-use")
      msg = "هذا البريد مستخدم مسبقاً.";
    else if (e.code === "auth/user-not-found")
      msg = "هذا البريد غير مسجل، يرجى إنشاء حساب جديد أولاً.";
    else if (
      e.code === "auth/wrong-password" ||
      e.code === "auth/invalid-credential"
    )
      msg = "كلمة المرور غير صحيحة.";
    else if (e.code === "auth/weak-password") msg = "كلمة المرور ضعيفة جداً.";
    else if (e.code === "auth/invalid-email")
      msg = "البريد الإلكتروني غير صالح.";
    else if (e.code === "auth/missing-password")
      msg = "يرجى إدخال كلمة المرور.";
    else if (e.code === "auth/operation-not-allowed")
      msg = "تنبيه: يجب تفعيل Email/Password في إعدادات Firebase Console.";
    // تم إزالة رسالة الخطأ المكررة لـ 'auth/operation-not-allowed'
    else if (e.code === "auth/network-request-failed")
      msg = "فشل في الاتصال بالإنترنت.";
    console.error("Firebase Auth Error:", e.code, e.message);
    showToast(msg, "error");
  } finally {
    btn.innerText = ogText;
    btn.disabled = false;
  }
}

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const btn = document.getElementById("auth-btn"); // يمكن استخدام زر مختلف أو إنشاء زر جديد
  const ogText = btn.innerText;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i>`;
  lucide.createIcons();
  btn.disabled = true;

  try {
    const result = await window.authUtils.signInWithPopup(
      window.auth,
      provider,
    );
    const user = result.user;

    const userRef = window.firestoreUtils.doc(
      window.db,
      "artifacts",
      window.appId,
      "users",
      user.uid,
    );
    const userDoc = await window.firestoreUtils.getDoc(userRef);

    if (!userDoc.exists()) {
      // مستخدم جديد
      let role = "user";
      if (user.email === PRIMARY_ADMIN_EMAIL) {
        role = "admin";
      }
      await window.firestoreUtils.setDoc(userRef, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: role,
        uid: user.uid,
        createdAt: window.firestoreUtils.serverTimestamp(),
      });
      showNotification("تم إنشاء الحساب بنجاح وتسجيل الدخول!");
    } else {
      // مستخدم موجود
      await window.firestoreUtils.updateDoc(userRef, {
        lastLogin: window.firestoreUtils.serverTimestamp(),
      });
      showNotification("مرحباً بعودتك!");
    }
  } catch (error) {
    console.error("Google Sign-in Error:", error);
    alert("فشل تسجيل الدخول بحساب جوجل: " + error.message);
  } finally {
    btn.innerText = ogText;
    btn.disabled = false;
  }
}

async function logout() {
  await window.authUtils.signOut(window.auth);
  await initAuth();
  showTab("home");
}

/* ========================================================
   Cart & Checkout Logic
======================================================== */
function showTab(id) {
  // Check if user is logged in for account tab
  if (id === "account" && (!currentUser || currentUser.isAnonymous)) {
    showLoginModal();
    return;
  }

  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.remove("text-primary");
    b.classList.add("text-slate-400");
    b.querySelector(".nav-icon-bg").classList.remove("bg-emerald-50");
  });

  const activeNav = document.getElementById("nav-" + id);
  if (activeNav) {
    activeNav.classList.remove("text-slate-400");
    activeNav.classList.add("text-primary");
    activeNav.querySelector(".nav-icon-bg").classList.add("bg-emerald-50");
  }

  if (id === "cart") renderCart();
  window.scrollTo({ top: 0, behavior: "smooth" });
  lucide.createIcons();
}

async function addToCart(id, name, price, unit) {
  const qtySelect = document.getElementById(`qty-${id}`);
  const quantity = parseFloat(qtySelect ? qtySelect.value : 1);

  // التحقق من صلاحيات الكمية (الحدود التي وضعها الأدمن)
  const p = products.find((x) => x.id === id);
  if (p) {
    if (p.minOrderQuantity && quantity < p.minOrderQuantity) {
      showToast(
        `عذراً، أقل كمية للطلب من هذا الصنف هي ${p.minOrderQuantity} ${unit}`,
        "warning",
      );
      return;
    }
    if (p.maxOrderQuantity && quantity > p.maxOrderQuantity) {
      showToast(
        `عذراً، أقصى كمية مسموحة للطلب هي ${p.maxOrderQuantity} ${unit}`,
        "warning",
      );
      return;
    }
  }

  if (currentUser && !currentUser.isAnonymous) {
    // للمستخدم المسجل: الحفظ في Firestore
    try {
      const cartRef = window.firestoreUtils.collection(
        window.db,
        "artifacts",
        window.appId,
        "users",
        currentUser.uid,
        "cartItems",
      );
      const q = window.firestoreUtils.query(
        cartRef,
        window.firestoreUtils.where("productId", "==", id),
      );
      const querySnapshot = await window.firestoreUtils.getDocs(q);

      if (!querySnapshot.empty) {
        const docRef = querySnapshot.docs[0].ref;
        const existingQty = querySnapshot.docs[0].data().orderedQuantity || 0;
        const newTotal = existingQty + quantity;

        // فحص الحد الأقصى مرة أخرى عند التحديث للسلة
        if (p && p.maxOrderQuantity && newTotal > p.maxOrderQuantity) {
          showToast(
            `لقد بلغت الحد الأقصى المسموح به لهذا الصنف (${p.maxOrderQuantity} ${unit})`,
            "warning",
          );
          return;
        }

        await window.firestoreUtils.updateDoc(docRef, {
          orderedQuantity: newTotal,
        });
      } else {
        await window.firestoreUtils.addDoc(cartRef, {
          productId: id,
          productName: name,
          basePrice: price,
          orderedQuantity: quantity,
          selectedQuantityUnit: unit,
          addedAt: window.firestoreUtils.serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("Error adding to Firestore cart:", e);
      showToast("حدث خطأ أثناء إضافة المنتج للسلة", "error");
    }
  } else {
    // للمستخدم الزائر: الحفظ محلياً
    const existingItem = cart.find((item) => item.id === id);
    if (existingItem) {
      const newTotal = existingItem.orderedQuantity + quantity;
      if (p && p.maxOrderQuantity && newTotal > p.maxOrderQuantity) {
        showToast(
          `لا يمكنك تجاوز الحد الأقصى (${p.maxOrderQuantity})`,
          "warning",
        );
        return;
      }
      existingItem.orderedQuantity = newTotal;
      existingItem.sub = existingItem.orderedQuantity * price;
    } else {
      cart.push({
        id,
        name: name,
        price: price,
        basePrice: price,
        orderedQuantity: quantity,
        unit: unit,
        sub: price * quantity,
      });
    }
  }
  updateCartBadge();

  const badge = document.getElementById("cart-badge");
  if (badge) {
    badge.classList.add("scale-125");
    setTimeout(() => badge.classList.remove("scale-125"), 200);
  }

  showNotification(`تم إضافة ${quantity} ${unit} من ${name} للسلة`);
}

function renderCart() {
  const list = document.getElementById("cart-items");
  const sum = document.getElementById("cart-summary");

  const isLogged = currentUser && !currentUser.isAnonymous;
  const currentCart = isLogged ? userFirestoreCart : cart;

  if (currentCart.length === 0) {
    list.innerHTML = `
            <div class="text-center py-24 flex flex-col items-center">
                <div class="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4"><i data-lucide="shopping-cart" class="w-10 h-10 text-slate-300"></i></div>
                <p class="text-slate-400 font-bold mb-4 text-lg">سلة مشترياتك فارغة</p>
                <button onclick="showTab('home')" class="bg-slate-900 text-white text-sm font-bold rounded-xl px-8 py-3 hover:bg-slate-800 transition-colors">تصفح المنتجات</button>
            </div>`;
    sum.classList.add("hidden");
  } else {
    sum.classList.remove("hidden");
    sum.classList.add("animate-fade-in-up");

    let total = 0;
    let displayItems = [];

    if (isLogged) {
      total = currentCart.reduce(
        (s, i) => s + i.basePrice * (i.orderedQuantity || 1),
        0,
      );
      displayItems = currentCart.map((i) => ({
        id: i.id,
        qty: i.orderedQuantity || 1,
        sub: i.basePrice * (i.orderedQuantity || 1),
        displayName: i.productName,
        unit: i.selectedQuantityUnit,
      }));
    } else {
      total = cart.reduce((s, i) => s + i.sub, 0);
      displayItems = cart.map((i) => ({
        ...i,
        displayName: i.name,
        qty: i.orderedQuantity,
      }));
    }

    list.innerHTML = displayItems
      .map(
        (item, idx) => `
            <div class="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between card-shadow animate-fade-in-up stagger-delay-${(idx % 4) + 1}">
                <div class="flex items-center gap-3">
                    <div class="bg-emerald-50 text-emerald-600 font-black px-2 h-10 rounded-xl flex items-center justify-center text-sm border border-emerald-100">${item.qty} ${item.unit || ""}</div>
                    <div>
                        <p class="font-black text-sm text-slate-800">${item.displayName}</p>
                        <p class="text-primary text-sm font-black mt-1">${item.sub} <span class="text-[10px]">ج.م</span></p>
                    </div>
                </div>
                <button onclick="removeFromCart('${item.id}')" class="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2.5 rounded-xl transition-all"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
        `,
      )
      .join("");

    const subtotalElem = document.getElementById("subtotal");
    if (subtotalElem) subtotalElem.innerText = total + " ج.م";

    const totalElem = document.getElementById("total");
    if (totalElem) totalElem.innerText = total;
  }
  lucide.createIcons();
}

async function removeFromCart(id) {
  if (currentUser && !currentUser.isAnonymous) {
    try {
      await window.firestoreUtils.deleteDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "users",
          currentUser.uid,
          "cartItems",
          id,
        ),
      );
      // التحديث سيتم تلقائياً عبر onSnapshot
    } catch (e) {
      console.error("Error removing from Firestore:", e);
    }
  } else {
    cart = cart.filter((item) => item.id !== id);
  }
  updateCartBadge();
  renderCart();
}

async function placeOrder() {
  // التحقق من تسجيل الدخول
  if (!currentUser || currentUser.isAnonymous) {
    showLoginModal();
    return;
  }

  const name = document.getElementById("order-name").value.trim();
  const phone = document.getElementById("order-phone").value.trim();
  const addr = document.getElementById("order-address").value.trim();
  const coords = document.getElementById("order-coords").value;
  const paymentMethod = document.querySelector(
    'input[name="payment-method"]:checked',
  ).value;

  if (!name || !phone || !addr) return alert("يرجى إكمال بيانات التوصيل كاملة");

  if (!coords) {
    alert(
      "يرجى تحديد موقعك باستخدام زر (حدد موقعي GPS) المتواجد بجوار حقل العنوان للتأكد من تغطية التوصيل.",
    );
    return;
  }

  const [lat, lon] = coords.split(",").map(Number);
  const isAdmin =
    currentUser &&
    !currentUser.isAnonymous &&
    window.currentUserRole === "admin";

  // Bounding box for Greater Cairo (approx)
  if (!isAdmin && (lat < 29.7 || lat > 30.3 || lon < 30.8 || lon > 31.8)) {
    alert(
      "عذراً، خدمات التوصيل لدينا تقتصر حالياً على محافظة القاهرة الكبرى وضواحيها فقط.",
    );
    return;
  }

  if (paymentMethod === "visa") {
    const ccNum = document.getElementById("cc-num").value;
    if (ccNum.length < 16) return alert("يرجى إدخال بيانات البطاقة بشكل صحيح");
  }

  const btn = document.getElementById("btn-place-order");
  const ogHtml = btn.innerHTML;
  btn.innerHTML = `<i data-lucide="loader" class="w-6 h-6 animate-spin"></i> جاري التأكيد...`;
  lucide.createIcons();
  btn.disabled = true;

  const total = userFirestoreCart.reduce(
    (s, i) => s + i.basePrice * (i.orderedQuantity || 0),
    0,
  );
  const orderItems = userFirestoreCart.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    basePrice: item.basePrice,
    selectedQuantityUnit: item.selectedQuantityUnit,
    orderedQuantity: item.orderedQuantity || 1,
    totalPrice: item.basePrice * (item.orderedQuantity || 1),
  }));
  const order = {
    items: orderItems, // Use the mapped orderItems
    total: total,
    name,
    phone,
    addr,
    coords,
    paymentMethod,
    userId: currentUser ? currentUser.uid : "guest",
    status: "قيد التجهيز",
    createdAt: window.firestoreUtils.serverTimestamp(),
    dateString: new Date().toLocaleString("ar-EG"),
  };

  try {
    await window.firestoreUtils.addDoc(
      window.firestoreUtils.collection(
        window.db,
        "artifacts",
        window.appId,
        "public",
        "data",
        "orders",
      ),
      order,
    );

    // Clear user's cart in Firestore
    const cartItemsRef = window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "users",
      currentUser.uid,
      "cartItems",
    );
    const snapshot = await window.firestoreUtils.getDocs(cartItemsRef);
    const batch = window.firestoreUtils.writeBatch(window.db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    document.getElementById("checkout").innerHTML = `
            <div class="text-center py-20 flex flex-col items-center animate-fade-in-up bg-white rounded-[3rem] shadow-xl border border-emerald-50">
                <div class="w-28 h-28 bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white rounded-full flex items-center justify-center mb-6 shadow-2xl modal-enter border-4 border-emerald-50"><i data-lucide="check-circle-2" class="w-14 h-14"></i></div>
                <h2 class="text-3xl font-black text-[#1B4332] mb-2">تم استلام طلبك بنجاح! 🎉</h2>
                <p class="text-slate-500 text-sm mb-8 font-bold">سنتواصل معك قريباً على رقم ${phone}</p>
                <button onclick="location.reload()" class="bg-[#1B4332] text-white font-bold py-4 px-10 rounded-2xl shadow-xl hover:shadow-2xl text-lg transition-all active:scale-95 border-b-4 border-emerald-900">العودة للرئيسية</button>
            </div>
        `;
    lucide.createIcons();

    // إشعار فاخر للمستخدم
    showToast("✨ تم تأكيد طلبك بنجاح!", "success", 4000, () => {
      showTab("tracking");
    });

    // إضافة إشعار للـ notification panel
    createNotification(
      "✅ تم تأكيد الطلب",
      `تم قبول طلبك برقم #${Math.floor(Math.random() * 10000)}. سنتواصل معك قريباً.`,
      "success",
      "check",
      "عرض الطلب",
      () => showTab("tracking"),
    );
  } catch (e) {
    alert("حدث خطأ أثناء إرسال الطلب، الرجاء المحاولة مرة أخرى.");
    btn.innerHTML = ogHtml;
    btn.disabled = false;
  }
}

function listenToOrders() {
  const q = window.firestoreUtils.query(
    window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "orders",
    ),
  );
  return window.firestoreUtils.onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.createdAt - a.createdAt);
      const container = document.getElementById("admin-o-list");

      if (orders.length > 0) {
        document
          .getElementById("admin-orders-badge")
          .classList.remove("hidden");
      } else {
        document.getElementById("admin-orders-badge").classList.add("hidden");
      }

      if (orders.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-400 py-10 text-sm font-bold bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">لا توجد طلبات واردة</p>`;
        return;
      }

      container.innerHTML = orders
        .map((o) => {
          const grouped = o.items.reduce((acc, item) => {
            const key = `${item.productName}-${item.selectedQuantityUnit}`;
            acc[key] = acc[key]
              ? { ...acc[key], qty: acc[key].qty + item.orderedQuantity }
              : { ...item, qty: item.orderedQuantity };
            return acc;
          }, {});
          const itemsHtml = `
            <table class="w-full mt-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <thead class="bg-slate-100">
                    <tr class="text-right">
                        <th class="p-2 border-b border-slate-200">المنتج (فاتورة مبيعات)</th>
                        <th class="p-2 border-b border-slate-200 text-center">الكمية</th>
                        <th class="p-2 border-b border-slate-200 text-left">الإجمالي</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${Object.values(grouped)
                      .map(
                        (i) => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-2 font-bold">${i.productName} <span class="text-[10px] text-slate-400 font-normal mr-1">${i.selectedQuantityUnit ? `(${i.selectedQuantityUnit})` : ""}</span></td>
                        <td class="p-2 text-center text-emerald-600 font-black" dir="ltr">${i.qty}</td>
                        <td class="p-2 text-left font-bold text-slate-800">${Number(i.basePrice * i.qty).toFixed(2)} ج.م</td>
                    </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
          `;

          return `
            <div class="bg-white p-5 rounded-[2rem] border border-slate-100 card-shadow relative overflow-hidden">
                <div class="absolute right-0 top-0 w-1.5 h-full ${o.status === "قيد التجهيز" ? "bg-amber-400" : "bg-emerald-500"}"></div>
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="text-sm font-black text-slate-800 flex items-center gap-1.5 mb-1"><i data-lucide="user" class="w-4 h-4 text-slate-400"></i> ${o.name}</p>
                        <p class="text-xs text-slate-500 flex items-center gap-1.5 font-semibold"><i data-lucide="phone" class="w-4 h-4 text-slate-400"></i> <a href="tel:${o.phone}" class="text-blue-500 hover:underline">${o.phone}</a></p>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        <span class="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] px-2.5 py-1 rounded-md font-bold">${o.status}</span>
                        <span class="text-[10px] font-bold ${o.paymentMethod === "visa" ? "text-amber-600 bg-amber-50" : "text-emerald-500 bg-emerald-50"} px-2 py-0.5 rounded">${o.paymentMethod === "visa" ? "فيزا" : "كاش"}</span>
                    </div>
                </div>
                <div class="bg-slate-50 p-3 rounded-2xl mb-4 border border-slate-100">
                    <p class="text-[10px] text-slate-400 font-bold mb-3">العنوان:</p>
                    <p class="text-xs text-slate-600">${o.addr}</p>
                    <div class="mt-2 pt-2 border-t border-slate-200">
                        <p class="text-[10px] text-slate-400 font-bold mb-1">تفاصيل المنتجات:</p>
                        ${itemsHtml}
                    </div>
                    ${
                      o.coords
                        ? `
                    <div class="mt-3 pt-3 border-t border-slate-200">
                        <a href="https://maps.google.com/?q=${o.coords}" target="_blank" class="text-emerald-600 text-[11px] font-bold flex items-center gap-1 hover:underline"><i data-lucide="map-pin" class="w-3 h-3"></i> موقع العميل على الخريطة</a>
                    </div>`
                        : ""
                    }
                </div>
                <div class="flex justify-between items-center bg-white gap-2">
                    <p class="font-black text-primary text-lg">${o.total} ج.م <span class="text-[10px] text-slate-400 font-bold ml-1">(${o.items.length} منتج)</span></p>
                    <div class="flex gap-2">
                        ${o.status === "قيد التجهيز" ? `<button onclick="confirmOrder('${o.id}')" class="text-white bg-[#1B4332] px-3.5 py-2 rounded-xl hover:shadow-lg active:scale-95 transition-all flex items-center gap-1.5 text-xs font-bold"><i data-lucide="check-circle" class="w-4 h-4"></i> تأكيد</button>` : `<span class="text-[#1B4332] bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5"><i data-lucide="check-circle-2" class="w-4 h-4"></i> مؤكد</span>`}
                        <button onclick="deleteDocConfirm('orders', '${o.id}')" class="text-red-400 bg-red-50 p-2.5 rounded-xl hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1 text-xs font-bold"><i data-lucide="trash-2" class="w-4 h-4"></i> حذف</button>
                    </div>
                </div>
            </div>
            `;
        })
        .join("");
      lucide.createIcons();

      // إشعارات للطلبات الجديدة
      if (typeof window.isFirstAdminOrdersLoad === "undefined") {
        window.isFirstAdminOrdersLoad = false;
        lastOrdersCount = orders.length;
      } else if (orders.length > lastOrdersCount) {
        const newOrdersCount = orders.length - lastOrdersCount;
        const newOrders = orders.slice(0, newOrdersCount);
        const newOrdersFromOthers = newOrders.filter(
          (o) => !currentUser || o.userId !== currentUser.uid,
        );

        if (newOrdersFromOthers.length > 0) {
          document
            .getElementById("admin-notification-badge")
            .classList.remove("hidden");

          // إنشاء إشعار في الـ notification panel
          createNotification(
            `🔔 ${newOrdersFromOthers.length} طلب جديد!`,
            `تم استقبال ${newOrdersFromOthers.length} طلب جديد. يرجى مراجعة الطلبات.`,
            "order",
            "package",
            "عرض الطلبات",
            () => showTab("account"),
          );

          showToast(
            `🔔 ${newOrdersFromOthers.length} طلب جديد!`,
            "info",
            5000,
            () => {
              showTab("account");
            },
          );
        }
      } else if (orders.length === 0) {
        document
          .getElementById("admin-notification-badge")
          .classList.add("hidden");
      }
      lastOrdersCount = orders.length;
    },
    (e) => console.error(e),
  );
}

function loadUserOrders() {
  const q = window.firestoreUtils.query(
    window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "orders",
    ),
  );
  return window.firestoreUtils.onSnapshot(
    q,
    (snap) => {
      if (!currentUser) return;
      const myOrders = snap.docs
        .map((d) => d.data())
        .filter((o) => o.userId === currentUser.uid)
        .sort((a, b) => b.createdAt - a.createdAt);
      const container = document.getElementById("orders-list");

      if (myOrders.length === 0) {
        container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 w-full">
                    <i data-lucide="package-x" class="w-16 h-16 mb-4 text-slate-300"></i>
                    <p class="text-lg font-black text-slate-500">لم تقم بطلب أي منتجات بعد</p>
                </div>`;
        lucide.createIcons();
        return;
      }

      container.innerHTML = myOrders
        .map((o, i) => {
          const grouped = o.items.reduce((acc, item) => {
            const key = `${item.productName}-${item.selectedQuantityUnit}`;
            acc[key] = acc[key]
              ? { ...acc[key], qty: acc[key].qty + item.orderedQuantity }
              : { ...item, qty: item.orderedQuantity };
            return acc;
          }, {});
          const itemsHtml = `
            <table class="w-full mt-2 text-xs text-slate-700 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                <thead class="bg-slate-50">
                    <tr class="text-right">
                        <th class="p-2 border-b border-slate-100">المنتج (فاتورة مبيعات)</th>
                        <th class="p-2 border-b border-slate-100 text-center">الكمية</th>
                        <th class="p-2 border-b border-slate-100 text-left">الإجمالي</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                    ${Object.values(grouped)
                      .map(
                        (item) => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="p-2 font-bold">${item.productName} <span class="text-[10px] text-slate-400 font-normal mr-1">${item.selectedQuantityUnit ? `(${item.selectedQuantityUnit})` : ""}</span></td>
                        <td class="p-2 text-center text-emerald-600 font-black" dir="ltr">${item.qty}</td>
                        <td class="p-2 text-left font-bold text-slate-800">${Number(item.basePrice * item.qty).toFixed(2)} ج.م</td>
                    </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
          `;

          return `
            <div class="bg-white p-5 rounded-[2rem] border border-slate-100 text-right mb-4 card-shadow animate-fade-in-up stagger-delay-${(i % 4) + 1} w-full">
                <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-50">
                   <div class="flex items-center gap-3">
                       <div class="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center"><i data-lucide="receipt" class="w-5 h-5 text-emerald-500"></i></div>
                       <div>
                           <p class="font-black text-sm text-slate-800">طلب رقم #${Math.floor(Math.random() * 10000)}</p>
                           <p class="text-[10px] text-slate-400 font-bold mt-0.5">${o.dateString ? o.dateString.split(" ")[0] : "اليوم"}</p>
                       </div>
                   </div>
                   <div class="flex items-center gap-2">
                       ${
                         o.status === "قيد التجهيز"
                           ? `
                       <span class="animate-pulse px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 font-bold text-[10px] text-amber-600 flex items-center gap-1.5">
                           <span class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span> قيد التجهيز
                       </span>
                       `
                           : `
                       <span class="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 font-bold text-[10px] text-emerald-600 flex items-center gap-1.5">
                           <i data-lucide="check-circle-2" class="w-4 h-4"></i> مؤكد ✓
                       </span>
                       `
                       }
                   </div>
                </div>
                
                <!-- تفاصيل المنتجات -->
                <div class="bg-slate-50 p-3 rounded-xl mb-4 border border-slate-100">
                    <p class="text-[10px] text-slate-400 font-bold mb-2">المنتجات المطلوبة:</p>
                    ${itemsHtml}
                </div>

                <div class="flex justify-between items-end">
                    <div>
                        <p class="text-slate-500 text-[11px] mb-1 font-bold">عدد المنتجات: <span class="font-black text-slate-700">${o.items.length}</span></p>
                        <p class="text-slate-500 text-[11px] font-bold">الإجمالي: <span class="font-black text-primary text-base">${o.total} ج.م</span></p>
                    </div>
                    <span class="text-[10px] font-bold ${o.paymentMethod === "visa" ? "text-amber-600 bg-amber-50 border border-amber-100" : "text-emerald-600 bg-emerald-50 border border-emerald-100"} px-3 py-1.5 rounded-xl">${o.paymentMethod === "visa" ? "دفع إلكتروني" : "الدفع عند الاستلام"}</span>
                </div>
            </div>
            `;
        })
        .join("");
      lucide.createIcons();

      // تحديث حالة الطلبات وإرسال إشعار للمستخدم
      if (typeof window.isFirstUserOrdersLoad === "undefined") {
        window.isFirstUserOrdersLoad = false;
        lastUserOrdersCount = myOrders.length;
        window.lastUserOrderStatus = {};
        myOrders.forEach((o) => (window.lastUserOrderStatus[o.id] = o.status));
      } else {
        if (myOrders.length > lastUserOrdersCount) {
          document
            .getElementById("user-orders-badge")
            .classList.remove("hidden");
          lastUserOrdersCount = myOrders.length;
        }

        myOrders.forEach((o) => {
          if (
            window.lastUserOrderStatus &&
            window.lastUserOrderStatus[o.id] &&
            window.lastUserOrderStatus[o.id] !== o.status
          ) {
            if (o.status === "مؤكد") {
              createNotification(
                "🎉 تم تأكيد طلبك!",
                "تم التحقق من طلبك وسيتم تجهيزه للشحن قريباً. شكراً لتسوقك معنا!",
                "success",
                "check",
                "عرض الطلب",
                () => showTab("tracking"),
              );
              showToast("🎉 تم تأكيد طلبك!", "success", 5000, () =>
                showTab("tracking"),
              );
            } else {
              createNotification(
                "✅ تحديث حالة الطلب",
                `تم تحديث حالة طلبك إلى: ${o.status}`,
                "info",
                "truck",
                "عرض الطلبات",
                () => showTab("tracking"),
              );
              showToast(`✅ حالة طلبك الآن: ${o.status}`, "info", 4000, () =>
                showTab("tracking"),
              );
            }
          }
          if (window.lastUserOrderStatus)
            window.lastUserOrderStatus[o.id] = o.status;
        });
      }
      lastUserOrdersCount = myOrders.length;
    },
    (e) => console.error(e),
  );
}

function showLoginModal() {
  const modal = document.getElementById("login-required-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.getElementById("modal-email").focus();
  // Reset to login mode when opening
  modalAuthMode = "login";
  document.getElementById("modal-auth-title").innerText = "تسجيل الدخول مطلوب";
  document.getElementById("modal-auth-btn").innerText = "دخول";
  document.getElementById("modal-auth-toggle").innerText =
    "مستخدم جديد؟ اضغط هنا لإنشاء حساب";
  document.getElementById("modal-signup-fields").classList.add("hidden");
  document.getElementById("modal-email").value = "";
  document.getElementById("modal-password").value = "";
  document.getElementById("modal-full-name").value = "";
  document.getElementById("modal-phone").value = "";
}

function closeLoginModal() {
  const modal = document.getElementById("login-required-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  // Reset to login mode when closing
  modalAuthMode = "login";
  document.getElementById("modal-auth-title").innerText = "تسجيل الدخول مطلوب";
  document.getElementById("modal-auth-btn").innerText = "دخول";
  document.getElementById("modal-auth-toggle").innerText =
    "مستخدم جديد؟ اضغط هنا لإنشاء حساب";
  document.getElementById("modal-signup-fields").classList.add("hidden");
  document.getElementById("modal-email").value = "";
  document.getElementById("modal-password").value = "";
  document.getElementById("modal-full-name").value = "";
  document.getElementById("modal-phone").value = "";
}

async function handleModalAuth() {
  const email = document.getElementById("modal-email").value.trim();
  const pass = document.getElementById("modal-password").value.trim();

  if (!email || !pass)
    return alert("يرجى إدخال البريد الإلكتروني وكلمة المرور");

  const btn = document.getElementById("modal-auth-btn");
  const ogText = btn.innerText;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i>`;
  lucide.createIcons();
  btn.disabled = true;

  try {
    if (modalAuthMode === "signup") {
      const name = document.getElementById("modal-full-name").value.trim();
      const gender = document.getElementById("modal-gender").value;
      const phone = document.getElementById("modal-phone").value.trim();
      if (!name || !phone)
        return showToast("يرجى إكمال الاسم ورقم الهاتف", "error");

      const res = await window.authUtils.createUserWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
      let role = "user";
      if (email === PRIMARY_ADMIN_EMAIL) {
        role = "admin";
      }
      await window.firestoreUtils.setDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "users",
          res.user.uid,
        ),
        {
          email,
          role,
          uid: res.user.uid,
          name,
          gender,
          phone,
          createdAt: window.firestoreUtils.serverTimestamp(),
        },
      );
      showToast("تم إنشاء الحساب بنجاح!", "success");
    } else {
      // login mode
      await window.authUtils.signInWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
      showToast("تم تسجيل الدخول بنجاح!", "success");
    }
    closeLoginModal(); // Close modal after successful auth
    setTimeout(() => showTab("account"), 500); // Open account tab after successful login/signup
  } catch (e) {
    let msg = "حدث خطأ غير متوقع.";
    if (
      e.code === "auth/wrong-password" ||
      e.code === "auth/user-not-found" ||
      e.code === "auth/invalid-credential"
    )
      msg = "بيانات الدخول غير صحيحة.";
    else if (e.code === "auth/invalid-email")
      msg = "البريد الإلكتروني غير صالح.";
    else if (e.code === "auth/email-already-in-use")
      msg = "هذا البريد مستخدم مسبقاً.";
    else if (e.code === "auth/weak-password") msg = "كلمة المرور ضعيفة جداً.";
    else if (e.code === "auth/missing-password")
      msg = "يرجى إدخال كلمة المرور.";
    else if (e.code === "auth/operation-not-allowed")
      msg = "خطأ: يجب تفعيل Email/Password في إعدادات Firebase Console.";
    else if (e.code === "auth/network-request-failed")
      msg = "فشل في الاتصال بالإنترنت.";
    console.error("Firebase Auth Error:", e.code, e.message);
    showToast(msg, "error");
  } finally {
    btn.innerText = ogText;
    btn.disabled = false;
  }
}

async function handleGoogleSignIn() {
  const btn = document.getElementById("modal-auth-btn"); // Assuming same spinner context or just a toast
  try {
    const provider = new GoogleAuthProvider();
    const res = await signInWithPopup(window.auth, provider);
    const email = res.user.email;
    const name = res.user.displayName || "";

    const userDocRef = window.firestoreUtils.doc(
      window.db,
      "artifacts",
      window.appId,
      "users",
      res.user.uid,
    );
    const userDocCheck = await window.firestoreUtils.getDoc(userDocRef);

    if (!userDocCheck.exists()) {
      let role = "user";
      if (email === PRIMARY_ADMIN_EMAIL) {
        role = "admin";
      }
      await window.firestoreUtils.setDoc(userDocRef, {
        email,
        role,
        uid: res.user.uid,
        name,
        gender: "male",
        phone: "",
        createdAt: window.firestoreUtils.serverTimestamp(),
      });
    }

    showToast("تم تسجيل الدخول بحساب جوجل بنجاح!", "success");
    closeLoginModal();
    setTimeout(() => showTab("account"), 500);
  } catch (e) {
    console.error("Google Sign-In Error", e);
    // User closed popup or other issues doesn't always need a toast, but good to have
    if (e.code !== "auth/popup-closed-by-user") {
      showToast("فشل تسجيل الدخول باستخدام جوجل.", "error");
    }
  }
}

function showNotification(m) {
  const existing = document.getElementById("custom-toast");
  if (existing) existing.remove();

  const d = document.createElement("div");
  d.id = "custom-toast";
  d.className =
    "fixed top-5 md:top-8 left-1/2 -translate-x-1/2 bg-[#1B4332] backdrop-blur-md text-white px-6 py-4 rounded-2xl text-sm font-bold z-[2000] shadow-2xl flex items-center gap-3 modal-enter border border-emerald-500/50 max-w-[90vw]";
  d.innerHTML = `<i data-lucide="stars" class="w-5 h-5 text-amber-400 animate-pulse"></i> ${m}`;
  document.body.appendChild(d);
  lucide.createIcons();

  setTimeout(() => {
    d.style.animation = "fadeInUp 0.3s ease-in reverse forwards";
    setTimeout(() => d.remove(), 300);
  }, 3500);
}

function showToast(message, type = "success", duration = 4000, onClick = null) {
  const container = document.getElementById("notification-container");
  const toast = document.createElement("div");

  const colors = {
    success: "from-[#1B4332] to-[#2D6A4F]",
    error: "from-red-800 to-red-950",
    info: "from-[#1B4332] to-slate-800",
    warning: "from-amber-500 to-amber-600",
  };

  const icons = {
    success: "check-circle-2",
    error: "alert-circle",
    info: "info",
    warning: "alert-triangle",
  };

  toast.className = `bg-gradient-to-r ${colors[type]} text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 border border-white/20 backdrop-blur-xl animate-fade-in-up pointer-events-auto cursor-pointer transform transition-all duration-300 hover:scale-105`;
  toast.innerHTML = `
        <i data-lucide="${icons[type]}" class="w-5 h-5 flex-shrink-0 mt-0.5 animate-bounce"></i>
        <div class="flex-1">
            <p class="font-bold text-sm leading-tight">${message}</p>
        </div>
        <button onclick="this.parentElement.remove()" class="text-white/70 hover:text-white transition-colors ml-2">
            <i data-lucide="x" class="w-4 h-4"></i>
        </button>
    `;

  if (onClick) toast.onclick = onClick;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ========================================================
   Notification System (Facebook Style)
======================================================== */
function toggleNotificationPanel() {
  const panel = document.getElementById("notification-panel");
  const badge = document.getElementById("header-notification-badge");

  panel.classList.toggle("hidden");

  if (!panel.classList.contains("hidden")) {
    document.addEventListener("click", closeNotificationOnClickOutside);
    if (badge) badge.classList.add("hidden");

    // Mark all as read
    let markedAny = false;
    if (typeof notifications !== "undefined") {
      notifications.forEach((n) => {
        if (!n.read) {
          n.read = true;
          markedAny = true;
        }
      });
      if (markedAny) {
        updateNotificationPanel();
        updateNotificationBadge();
      }
    }
  } else {
    document.removeEventListener("click", closeNotificationOnClickOutside);
  }
  if (window.lucide) lucide.createIcons();
}

function closeNotificationOnClickOutside(e) {
  const panel = document.getElementById("notification-panel");
  const bell = document.getElementById("notification-bell");
  if (!panel.contains(e.target) && !bell.contains(e.target)) {
    panel.classList.add("hidden");
    document.removeEventListener("click", closeNotificationOnClickOutside);
  }
}

function openAddAdminModal() {
  if (!ensureAdmin("فتح نافذة إضافة مدير")) return;
  const modal = document.getElementById("add-admin-modal");
  modal.classList.toggle("hidden");
  if (!modal.classList.contains("hidden")) {
    document.getElementById("new-admin-email").focus();
  }
}

async function promoteUserToAdmin() {
  if (!ensureAdmin("ترقية مستخدم إلى مدير")) return;
  const email = document.getElementById("new-admin-email").value.trim();
  if (!email) {
    alert("يرجى إدخال بريد إلكتروني صالح.");
    return;
  }

  try {
    // البحث عن المستخدم بالبريد الإلكتروني (يتطلب فهرسة في Firestore أو استخدام Cloud Functions)
    // لتبسيط الأمر حالياً، سنفترض أننا نعرف الـ UID أو نعتمد على تسجيل الدخول الأول للمستخدم
    // الطريقة الأكثر أماناً وفعالية هي استخدام Cloud Functions للبحث عن المستخدم بواسطة البريد الإلكتروني وتحديث دوره.
    // هنا، سنقوم بتحديث دور المستخدم إذا كان موجوداً بالفعل في مجموعة 'users'
    const usersRef = window.firestoreUtils.collection(
      window.db,
      "artifacts",
      window.appId,
      "users",
    );
    const q = window.firestoreUtils.query(
      usersRef,
      window.firestoreUtils.where("email", "==", email),
    );
    const querySnapshot = await window.firestoreUtils.getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      await window.firestoreUtils.updateDoc(userDoc.ref, { role: "admin" });
      showNotification(`تم ترقية ${email} إلى مدير بنجاح!`);
      document.getElementById("new-admin-email").value = "";
      openAddAdminModal(); // إغلاق النافذة
    } else {
      alert(
        "لم يتم العثور على مستخدم بهذا البريد الإلكتروني. يجب أن يسجل المستخدم الدخول مرة واحدة على الأقل.",
      );
    }
  } catch (e) {
    console.error("Error promoting user to admin:", e);
    alert("حدث خطأ أثناء ترقية المستخدم. حاول مرة أخرى.");
  }
}

function createNotification(
  title,
  message,
  type = "info",
  icon = "bell",
  actionText = null,
  actionFn = null,
) {
  const notification = {
    id: Date.now(),
    title,
    message,
    type,
    icon,
    actionText,
    actionFn,
    createdAt: new Date(),
    read: false,
  };

  notifications.unshift(notification);

  // Keep only last 10 notifications
  if (notifications.length > 10) {
    notifications.pop();
  }

  updateNotificationPanel();
  updateNotificationBadge();
}

function updateNotificationPanel() {
  const list = document.getElementById("notifications-list");

  if (notifications.length === 0) {
    list.innerHTML = `
            <div class="px-6 py-8 text-center text-slate-400 flex flex-col items-center gap-2">
                <i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>
                <p class="font-bold text-sm">لا توجد إشعارات حالياً</p>
            </div>
        `;
  } else {
    list.innerHTML = notifications
      .map((notif) => {
        const colors = {
          success: "from-[#1B4332] to-[#2D6A4F]",
          error: "from-red-500 to-pink-600",
          info: "from-[#1B4332] to-emerald-900",
          warning: "from-amber-500 to-orange-600",
          order: "from-emerald-600 to-[#1B4332]",
        };

        const icons = {
          bell: "bell",
          check: "check-circle-2",
          alert: "alert-circle",
          package: "package",
          truck: "truck",
        };

        const bgColor = colors[notif.type] || colors.info;
        const iconName = icons[notif.icon] || "bell";

        return `
            <div class="px-6 py-4 hover:bg-emerald-50/50 transition-colors cursor-pointer group ${notif.read ? "opacity-60" : "bg-emerald-50/20"}">
                <div class="flex items-start gap-3">
                    <div class="flex-shrink-0 w-12 h-12 bg-gradient-to-br ${bgColor} rounded-full flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                        <i data-lucide="${iconName}" class="w-6 h-6 text-white"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-slate-800 text-sm">${notif.title}</p>
                        <p class="text-xs text-slate-600 mt-0.5 line-clamp-2">${notif.message}</p>
                        <p class="text-[10px] text-slate-400 mt-1.5">${formatTimeAgo(notif.createdAt)}</p>
                    </div>
                </div>
                ${
                  notif.actionText
                    ? `
                <button onclick="handleNotificationAction(${notif.id})" class="mt-2 w-full text-xs font-bold text-center py-2 rounded-lg bg-[#1B4332] text-white hover:bg-[#2D6A4F] transition-colors">
                    ${notif.actionText}
                </button>
                `
                    : ""
                }
            </div>
            `;
      })
      .join("");
  }

  lucide.createIcons();
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return "الآن";
  if (seconds < 3600) return `منذ ${Math.floor(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `منذ ${Math.floor(seconds / 3600)} ساعة`;
  return `منذ ${Math.floor(seconds / 86400)} يوم`;
}

function updateNotificationBadge() {
  const badge = document.getElementById("header-notification-badge");
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (unreadCount > 0) {
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function handleNotificationAction(notifId) {
  const notif = notifications.find((n) => n.id === notifId);
  if (notif) {
    notif.read = true;
    if (notif.actionFn && typeof notif.actionFn === "function") {
      notif.actionFn();
    }
    document.getElementById("notification-panel").classList.add("hidden");
    updateNotificationPanel();
    updateNotificationBadge();
  }
}

function clearAllNotifications() {
  notifications = [];
  updateNotificationPanel();
  updateNotificationBadge();
}

// Function to toggle between login and signup modes in the modal
function toggleModalAuthMode() {
  modalAuthMode = modalAuthMode === "login" ? "signup" : "login";
  document.getElementById("modal-auth-title").innerText =
    modalAuthMode === "login" ? "تسجيل الدخول مطلوب" : "إنشاء حساب جديد";
  document.getElementById("modal-auth-btn").innerText =
    modalAuthMode === "login" ? "دخول" : "إنشاء الحساب الآن";
  document.getElementById("modal-auth-toggle").innerText =
    modalAuthMode === "login"
      ? "مستخدم جديد؟ اضغط هنا لإنشاء حساب"
      : "لديك حساب بالفعل؟ سجل دخولك";

  const signupFields = document.getElementById("modal-signup-fields");

  if (modalAuthMode === "login") {
    signupFields.classList.add("hidden");
  } else {
    signupFields.classList.remove("hidden");
    signupFields.classList.add("animate-fade-in-up");
  }
}

const exposedAppFunctions = {
  searchProducts,
  showTab,
  filterByCategory,
  getLocationGPS,
  togglePaymentUI,
  formatCC,
  formatExp,
  placeOrder,
  handleAuth,
  toggleAuthMode,
  logout,
  openCategoryModal,
  openProductModal,
  openBulkImportModal,
  closeBulkImportModal,
  closeModals,
  handleImageUpload,
  handleBulkFileUpload,
  saveProduct,
  saveCategory,
  saveBulkProducts,
  deleteDocConfirm,
  editProduct,
  editCategory,
  updateProductPrice,
  closePriceUpdateModal,
  savePriceUpdate,
  openBulkPriceUpdateModal,
  closeBulkPriceUpdateModal,
  handleBulkPriceFileUpload,
  saveBulkPriceUpdates,
  showAdminSubTab,
  removeFromCart,
  showLoginModal,
  closeLoginModal,
  handleModalAuth,
  handleGoogleSignIn, // Added this
  showNotification,
  openAddAdminModal,
  promoteUserToAdmin,
  toggleNotificationPanel,
  clearAllNotifications,
  handleNotificationAction,
  toggleModalAuthMode,
  confirmOrder,
  addToCart,
};
Object.entries(exposedAppFunctions).forEach(([name, fn]) => {
  if (typeof fn === "function") window[name] = fn;
});
