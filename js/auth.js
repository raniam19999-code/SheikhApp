/* ========================================================
   auth.js: تسجيل الدخول وإدارة الصلاحيات
======================================================== */
import * as RBAC from "./rbac.js";

export async function initAuth() {
  // تفعيل بقاء تسجيل الدخول حتى عند إغلاق المتصفح
  try {
    const { setPersistence, browserLocalPersistence } = window.authUtils;
    if (setPersistence && browserLocalPersistence) {
        await setPersistence(window.auth, browserLocalPersistence);
    }
  } catch(e) {
    console.warn("Auth persistence error:", e);
  }

  if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
    try {
      await window.authUtils.signInWithCustomToken(window.auth, __initial_auth_token);
    } catch(e) {
      console.error("Token login failed:", e);
    }
  } else {
    // ننتظر قليلاً للتأكد من استعادة الجلسة من التخزين المحلي قبل محاولة الدخول كمجهول
    setTimeout(async () => {
      if (!window.auth.currentUser) {
        try {
          await window.authUtils.signInAnonymously(window.auth);
        } catch (e) {
          // تسجيل الخطأ في الكونسول مع توضيح للمطور
          if (e.code === "auth/admin-restricted-operation") {
            console.warn("Firebase Auth Notice: Anonymous login is restricted. Please enable 'Anonymous' in Firebase Console -> Auth -> Sign-in method.");
          } else {
            console.error("Anonymous auth error:", e.code, e.message);
          }
        }
      }
    }, 1500);
  }
}

export function listenToAuth() {
  window.authUtils.onAuthStateChanged(window.auth, async (user) => {
    // تنظيف أي مستمع سابق لضمان سرعة الأداء وعدم تداخل الجلسات
    if (window.unsubs.userProfile) {
      window.unsubs.userProfile();
      delete window.unsubs.userProfile;
    }

    window.currentUser = user;
    const authView = document.getElementById("auth-view");
    const profileView = document.getElementById("profile-view");

    if (user && !user.isAnonymous) {
      authView.classList.add("hidden");
      profileView.classList.remove("hidden");
      document.getElementById("profile-email").innerText = user.email;
      // إظهار اسم المستخدم إذا كان مسجلاً عبر جوجل لزيادة احترافية الواجهة
      if (user.displayName && document.getElementById("profile-name")) {
          document.getElementById("profile-name").innerText = user.displayName;
      }

      const uRef = window.firestoreUtils.doc(
        window.db,
        "artifacts",
        window.appId,
        "users",
        user.uid,
      );

      // جلب الرتبة من Firestore (الموظفين أو المستخدمين) مع دعم حالة الأوفلاين
      const staffRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "staff", user.uid);
      
      try {
        const staffSnap = await window.firestoreUtils.getDoc(staffRef);
        if (staffSnap.exists()) {
            window.currentUserRole = String(staffSnap.data().role || 'user').trim().toLowerCase();
        } else {
            const userDoc = await window.firestoreUtils.getDoc(uRef);
            window.currentUserRole = userDoc.exists() ? String(userDoc.data().role || 'user').trim().toLowerCase() : 'user';
        }
      } catch (offlineErr) {
        console.warn("Offline mode - using fallback role detection:", offlineErr.message);
        // في حالة الأوفلاين: إذا كان البريد هو المدير الأساسي، نمنحه صلاحية admin
        if (user.email && user.email.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase()) {
            window.currentUserRole = "admin";
        } else {
            // محاولة استرجاع الرتبة من التخزين المحلي
            const cachedRole = localStorage.getItem("cachedRole_" + user.uid);
            window.currentUserRole = cachedRole || "user";
        }
      }
      
      // حفظ الرتبة في التخزين المحلي للاستخدام في حالة الأوفلاين مستقبلاً
      if (window.currentUserRole && window.currentUserRole !== "user") {
        localStorage.setItem("cachedRole_" + user.uid, window.currentUserRole);
      }

      RBAC.applyUIPermissions(); // تطبيق الصلاحيات فوراً بعد التعيين كما طلبت

      // الاستمرار في مراقبة التغييرات لضمان استقرار النظام
      window.unsubs.userProfile = window.firestoreUtils.onSnapshot(uRef, async (uDoc) => {
        const data = uDoc.exists() ? uDoc.data() : {};
        
        if (user.email?.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase() && data.role !== "admin") {
          await window.firestoreUtils.setDoc(uRef, { role: "admin" }, { merge: true });
          return;
        }

        // تنظيف الرتبة وتوحيدها لضمان العمل الفوري
        const userRole = String(data.role || "user").trim().toLowerCase();
        window.currentUserRole = userRole;

        // تحديث المسمى الوظيفي فوراً في الملف الشخصي (Profile)
        const roleLabel = RBAC.ROLE_LABELS[userRole] || "موظف مسؤول";
        const roleElem = document.getElementById("profile-role");
        if (roleElem) roleElem.innerText = roleLabel;

        if (userRole !== "user") {
          document.body.classList.add("is-admin");
          // إظهار كافة أقسام لوحة التحكم للموظفين (ستقوم صلاحيات RBAC بتصفية المحتوى لاحقاً)
          document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
          
          document.getElementById("admin-badge")?.classList.remove("hidden");
          document.getElementById("admin-notification-badge")?.classList.remove("hidden");

          if(user.email && user.email.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase()) {
              document.getElementById("admin-tab-bot")?.classList.remove("hidden");
          }
          if (!window.unsubs.orders && typeof window.listenToOrders === "function")
            window.unsubs.orders = window.listenToOrders();
          
          // بدء الاستماع للإشعارات الإدارية للمراجعين والمديرين
          if (userRole === "admin" || userRole === "reviewer") {
              if (!window.unsubs.systemNotifications) {
                  const startTime = Date.now(); // تجنب إظهار الإشعارات القديمة عند التحميل
                  const q = window.firestoreUtils.query(
                      window.firestoreUtils.collection(window.db, "artifacts", window.appId, "notifications"),
                      window.firestoreUtils.limit(5)
                  );
                  window.unsubs.systemNotifications = window.firestoreUtils.onSnapshot(q, (snap) => {
                      snap.docChanges().forEach((change) => {
                          if (change.type === "added") {
                              const nData = change.doc.data();
                              // التأكد أن الإشعار جديد (بعد فتح الصفحة)
                              const isNew = nData.createdAt && (nData.createdAt.seconds * 1000) > startTime;
                              if (isNew && window.createNotification) {
                                  window.createNotification(
                                      nData.title,
                                      nData.message,
                                      nData.type || 'info',
                                      nData.icon || 'bell',
                                      "فتح المراجعة",
                                      () => window.showAdminSubTab(nData.targetTab || 'review')
                                  );
                              }
                          }
                      });
                  });
              }
          }

          window.renderAdminProducts();
          window.renderAdminCategories();
        } else {
          document.body.classList.remove("is-admin");
          if (!window.unsubs.myOrders && typeof window.loadUserOrders === "function")
            window.unsubs.myOrders = window.loadUserOrders();
        }
        
        // تطبيق قيود الواجهة فوراً للجميع (أدمن أو مستخدم) لضمان دقة البيانات المعروضة
        RBAC.applyUIPermissions();
      });

      if (!window.unsubs.userCart)
        window.unsubs.userCart = window.listenToUserCart(user.uid);
    } else {
      window.currentUserRole = null;
      authView.classList.remove("hidden");
      profileView.classList.add("hidden");
      document.body.classList.remove("is-admin");
      if (window.unsubs.userProfile) {
        window.unsubs.userProfile();
        delete window.unsubs.userProfile;
      }
      if (window.unsubs.userCart) {
        window.unsubs.userCart();
        delete window.unsubs.userCart;
      }
      window.userFirestoreCart = [];
      window.updateCartBadge();
    }
  });
}

export async function handleAuth() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!email || !pass) return alert("البيانات ناقصة");
  if (pass.length < 6)
    return window.showToast(
      "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      "warning",
    );
  try {
    if (window.authMode === "signup") {
      const cleanEmail = email.toLowerCase();
      const res = await window.authUtils.createUserWithEmailAndPassword(
        window.auth,
        cleanEmail,
        pass,
      );
      const role = cleanEmail === window.PRIMARY_ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
      await window.firestoreUtils.setDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "users",
          res.user.uid,
        ),
        {
          email: cleanEmail,
          role,
          uid: res.user.uid,
          createdAt: window.firestoreUtils.serverTimestamp(),
        },
      );
    } else {
      await window.authUtils.signInWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
    }
    window.showNotification("تمت العملية بنجاح");
  } catch (e) {
    let errorMsg = "خطأ: " + e.code;
    if (e.code === "auth/admin-restricted-operation") {
      errorMsg = "خدمة التسجيل معطلة حالياً. (تأكد من تفعيل Anonymous و Sign-up من إعدادات Firebase).";
      console.error("Firebase Auth Error: 'admin-restricted-operation' usually means you need to enable 'Anonymous' or 'Email/Password' providers and 'Enable create (sign-up)' in the Firebase Console.");
    } else if (e.code === "auth/email-already-in-use") {
      errorMsg = "البريد الإلكتروني مسجل بالفعل.";
    } else if (e.code === "auth/weak-password") {
      errorMsg = "كلمة المرور ضعيفة جداً.";
    }
    console.warn("Auth Error:", e.code, e.message);
    window.showToast(errorMsg, "error");
  }
}

export function toggleAuthMode() {
  window.authMode = window.authMode === "login" ? "signup" : "login";
  document.getElementById("auth-title").innerText =
    window.authMode === "login" ? "تسجيل الدخول" : "حساب جديد";
  document
    .getElementById("signup-fields")
    .classList.toggle("hidden", window.authMode === "login");
}

export async function logout() {
  await window.authUtils.signOut(window.auth);
  window.location.reload();
}

export function showLoginModal() {
  document
    .getElementById("login-required-modal")
    .classList.replace("hidden", "flex");
}

export function closeLoginModal() {
  document
    .getElementById("login-required-modal")
    .classList.replace("flex", "hidden");
}

export async function handleModalAuth() {
  const email = document.getElementById("modal-email").value.trim();
  const pass = document.getElementById("modal-password").value.trim();
  if (!email || !pass)
    return window.showToast("يرجى إدخال البيانات المطلوبة", "warning");

  try {
    if (window.modalAuthMode === "signup") {
      const res = await window.authUtils.createUserWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
      const role = email === window.PRIMARY_ADMIN_EMAIL ? "admin" : "user";
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
          createdAt: window.firestoreUtils.serverTimestamp(),
        },
      );
    } else {
      await window.authUtils.signInWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
    }
    closeLoginModal();
    window.showNotification("تمت العملية بنجاح");
  } catch (e) {
    let errorMsg = "خطأ في البيانات أو الخدمة غير مفعلة";
    if (e.code === "auth/invalid-email")
      errorMsg = "البريد الإلكتروني غير صحيح";
    if (e.code === "auth/email-already-in-use")
      errorMsg = "هذا البريد مسجل بالفعل";
    if (e.code === "auth/user-not-found") errorMsg = "الحساب غير موجود";
    if (e.code === "auth/wrong-password") errorMsg = "كلمة المرور خاطئة";
    if (e.code === "auth/invalid-credential")
      errorMsg = "بيانات الدخول غير صحيحة";
    if (e.code === "auth/weak-password")
      errorMsg = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";

    console.error("Auth Error:", e.code, e.message);
    window.showToast(errorMsg, "error");
  }
}

export async function signInWithGoogle() {
  try {
    const provider = new window.authUtils.GoogleAuthProvider();
    // فرض ظهور نافذة اختيار الحساب لضمان عدم حدوث تعليق في المتصفح
    provider.setCustomParameters({ prompt: 'select_account' });
    
    window.showToast("جاري الاتصال بحساب Google...", "info", 2000);
    const res = await window.authUtils.signInWithPopup(window.auth, provider);
    const user = res.user;
    const uRef = window.firestoreUtils.doc(
      window.db,
      "artifacts",
      window.appId,
      "users",
      user.uid,
    );
    const uDoc = await window.firestoreUtils.getDoc(uRef);

    if (!uDoc.exists()) {
      const email = (user.email || "").toLowerCase();
      let role = email === window.PRIMARY_ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
      await window.firestoreUtils.setDoc(uRef, {
        email: email,
        role: role,
        uid: user.uid,
        name: user.displayName,
        createdAt: window.firestoreUtils.serverTimestamp(),
      });
    }
    window.showNotification("تم تسجيل الدخول بنجاح!");
    if (document.getElementById("login-required-modal"))
      window.closeLoginModal();
  } catch (e) {
    console.error(e);
    if (e.code !== "auth/popup-closed-by-user") {
      window.showToast("فشل تسجيل الدخول بجوجل", "error");
    }
  }
}

export function openAddAdminModal() {
  document.getElementById("add-admin-modal").classList.toggle("hidden");
}

export function toggleModalAuthMode() {
  window.modalAuthMode = window.modalAuthMode === "login" ? "signup" : "login";
  document.getElementById("modal-auth-title").innerText =
    window.modalAuthMode === "login" ? "تسجيل الدخول" : "إنشاء حساب";
  document
    .getElementById("modal-signup-fields")
    .classList.toggle("hidden", window.modalAuthMode === "login");
}

export async function promoteUserToAdmin() {
  const email = document.getElementById("new-admin-email").value.trim();
  // جلب الرتبة المختارة من القائمة المنسدلة في المودال
  const role = document.getElementById("new-admin-role")?.value || "creator";

  if (!email)
    return window.showToast("يرجى إدخال البريد الإلكتروني", "warning");

  const usersColl = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "users"
  );

  try {
    const q = window.firestoreUtils.query(usersColl, window.firestoreUtils.where("email", "==", email.toLowerCase()));
    const snap = await window.firestoreUtils.getDocs(q);
    if (snap.empty) {
      // محاولة البحث بدون lowerCase كخيار أخير
      const q2 = window.firestoreUtils.query(usersColl, window.firestoreUtils.where("email", "==", email));
      const snap2 = await window.firestoreUtils.getDocs(q2);
      if (snap2.empty) return window.showToast("لم يتم العثور على مستخدم بهذا البريد", "error");
      var userDoc = snap2.docs[0];
    } else {
      var userDoc = snap.docs[0];
    }

    const uid = userDoc.id;

    // 1. تحديث الرتبة في ملف المستخدم العام
    await window.firestoreUtils.updateDoc(userDoc.ref, {
      role: role, // تعيين الرتبة المحددة (importer, inventory, etc)
      promotedAt: window.firestoreUtils.serverTimestamp()
    });
    
    // 2. إضافة السجل إلى مسار الموظفين (staff) لضمان التعرف السريع
    const staffDocRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "staff", uid);
    await window.firestoreUtils.setDoc(staffDocRef, {
        email: email.toLowerCase(),
        role: role,
        updatedAt: window.firestoreUtils.serverTimestamp()
    }, { merge: true });

    // عرض رسالة توضح الرتبة التي تم تعيينها بناءً على المسميات في rbac.js
    const roleLabel = RBAC.ROLE_LABELS[role] || role;
    window.showToast(`تم تعيين المستخدم كـ ${roleLabel} بنجاح`, "success");
    document.getElementById("add-admin-modal").classList.add("hidden");
  } catch (e) {
    window.showToast("فشل في الترقية", "error");
  }
}

window.demoteStaff = async function(userId) {
    if(!confirm("هل أنت متأكد من إلغاء صلاحيات هذا المسؤول وإرجاعه مستخدماً عادياً؟")) return;
    try {
        const userRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "users", userId);
        const staffDocRef = window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "staff", userId);

        // إلغاء الرتبة من ملف المستخدم
        await window.firestoreUtils.updateDoc(userRef, { 
            role: "user",
            demotedAt: window.firestoreUtils.serverTimestamp()
        });
        
        // حذف السجل من مسار الموظفين
        await window.firestoreUtils.deleteDoc(staffDocRef);

        window.showToast("تم إلغاء صلاحيات المسؤول بنجاح", "success");
        if(window.renderStaffManagement) window.renderStaffManagement();
    } catch(e) { window.showToast("فشل الإجراء", "error"); }
}

window.editStaffRole = function(email) {
    const emailInput = document.getElementById("new-admin-email");
    const modal = document.getElementById("add-admin-modal");
    
    if (emailInput) emailInput.value = email;
    // إظهار النافذة مباشرة بدلاً من التبديل (Toggle) لضمان الفتح
    if (modal) modal.classList.remove("hidden");
    window.showToast("اختر الرتبة الجديدة لهذا الموظف ثم اضغط تعيين", "info");
};
