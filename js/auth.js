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
      
      // دالة موحدة لتحديد الرتبة من مصادر متعددة لضمان الاستقرار
      const detectAndApplyRole = async (profileData = {}) => {
          let detectedRole = 'user';
          
          try {
              // 1. الأولوية القصوى للمدير الأساسي
              if (user.email && user.email.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase()) {
                  detectedRole = "admin";
              } 
              else {
                  // 2. التحقق من مسار الموظفين (المصدر المعتمد للترقيات)
                  const staffSnap = await window.firestoreUtils.getDoc(staffRef);
                  if (staffSnap.exists()) {
                      detectedRole = String(staffSnap.data().role || 'user').trim().toLowerCase();
                  } 
                  // 3. التحقق من حقل الرتبة في ملف المستخدم (كخيار احتياطي)
                  else if (profileData.role) {
                      detectedRole = String(profileData.role).trim().toLowerCase();
                  }
                  // 4. الوضع الأوفلاين / كاش
                  else {
                      detectedRole = localStorage.getItem("cachedRole_" + user.uid) || "user";
                  }
              }
          } catch (e) {
              console.warn("Role detection error, falling back:", e);
              detectedRole = localStorage.getItem("cachedRole_" + user.uid) || "user";
          }

          window.currentUserRole = detectedRole;
          if (detectedRole !== "user") {
              localStorage.setItem("cachedRole_" + user.uid, detectedRole);
              document.body.classList.add("is-admin");
          } else {
              document.body.classList.remove("is-admin");
          }

          // تطبيق الصلاحيات على الواجهة
          RBAC.applyUIPermissions();
          
          // تحديث المسمى الوظيفي في البروفايل
          const roleLabel = RBAC.ROLE_LABELS[detectedRole] || "موظف مسؤول";
          const roleElem = document.getElementById("profile-role");
          if (roleElem) roleElem.innerText = roleLabel;

          return detectedRole;
      };

      // الجلب الأولي للرتبة لتجنب التأخير
      await detectAndApplyRole();

      // الاستمرار في مراقبة التغييرات في ملف المستخدم لضمان التزامن
      window.unsubs.userProfile = window.firestoreUtils.onSnapshot(uRef, async (uDoc) => {
        const data = uDoc.exists() ? uDoc.data() : {};
        
        // تحديث واجهة المستخدم بالاسم والبيانات الفعلية
        if (data.name) {
            document.getElementById("profile-email").innerText = data.name;
        } else {
            document.getElementById("profile-email").innerText = user.email;
        }

        // إعادة التحقق من الرتبة عند حدوث أي تغيير في بيانات المستخدم
        const userRole = await detectAndApplyRole(data);

        if (userRole !== "user") {
          // إظهار أقسام الإدارة
          document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
          document.getElementById("admin-badge")?.classList.remove("hidden");
          document.getElementById("admin-notification-badge")?.classList.remove("hidden");

          if(user.email && user.email.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase()) {
              document.getElementById("admin-tab-bot")?.classList.remove("hidden");
          }

          if (!window.unsubs.orders && typeof window.listenToOrders === "function")
            window.unsubs.orders = window.listenToOrders();
          
          // إشعارات النظام للمراجعين والمديرين
          if (userRole === "admin" || userRole === "reviewer") {
              if (!window.unsubs.systemNotifications) {
                  const startTime = Date.now();
                  const q = window.firestoreUtils.query(
                      window.firestoreUtils.collection(window.db, "artifacts", window.appId, "notifications"),
                      window.firestoreUtils.limit(5)
                  );
                  window.unsubs.systemNotifications = window.firestoreUtils.onSnapshot(q, (snap) => {
                      snap.docChanges().forEach((change) => {
                          if (change.type === "added") {
                              const nData = change.doc.data();
                              const isNew = nData.createdAt && (nData.createdAt.seconds * 1000) > startTime;
                              if (isNew && window.createNotification) {
                                  window.createNotification(
                                      nData.title, nData.message, nData.type || 'info', nData.icon || 'bell',
                                      "فتح المراجعة", () => window.showAdminSubTab(nData.targetTab || 'review')
                                  );
                              }
                          }
                      });
                  });
              }
          }

          if (typeof window.renderAdminProducts === "function") window.renderAdminProducts();
          if (typeof window.renderAdminCategories === "function") window.renderAdminCategories();
        } else {
          if (!window.unsubs.myOrders && typeof window.loadUserOrders === "function")
            window.unsubs.myOrders = window.loadUserOrders();
        }
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
  const nameEl = document.getElementById("full-name");
  const phoneEl = document.getElementById("phone");
  const genderEl = document.getElementById("gender");

  const name = nameEl ? nameEl.value.trim() : "";
  const phone = phoneEl ? phoneEl.value.trim() : "";
  const gender = genderEl ? genderEl.value : "male";

  if (!phone) return window.showToast("يرجى إدخال رقم الهاتف", "warning");
  if (phone.length < 10) return window.showToast("رقم الهاتف يجب أن يكون 10 أرقام على الأقل", "warning");
  if (!name && window.authMode === "signup") return window.showToast("يرجى إدخال الاسم لإنشاء الحساب", "warning");

  // تنظيف رقم الهاتف من أي مسافات أو رموز
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d]/g, '');
  const email = `${cleanPhone}@sheikh-app.com`;
  const pass = `pass_${cleanPhone}`;

  try {
    if (window.authMode === "signup") {
      console.log("Attempting Signup for:", email);
      const res = await window.authUtils.createUserWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
      
      const role = email.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
      
      await window.firestoreUtils.setDoc(
        window.firestoreUtils.doc(
          window.db,
          "artifacts",
          window.appId,
          "users",
          res.user.uid,
        ),
        {
          email: email,
          name: name || "مستخدم جديد",
          phone: cleanPhone,
          gender: gender,
          role,
          uid: res.user.uid,
          createdAt: window.firestoreUtils.serverTimestamp(),
        },
      );
    } else {
      console.log("Attempting Login for:", email);
      try {
        await window.authUtils.signInWithEmailAndPassword(
          window.auth,
          email,
          pass,
        );
      } catch (loginErr) {
        console.error("Login inner error:", loginErr.code);
        if (loginErr.code === "auth/user-not-found" || loginErr.code === "auth/invalid-credential") {
          // إذا لم يجد الحساب أو البيانات غير صحيحة (قد يكون حساباً جديداً)
          if (name) {
              window.authMode = "signup";
              return handleAuth();
          } else {
              return window.showToast("هذا الرقم غير مسجل، يرجى كتابة اسمك والضغط مرة أخرى لإنشاء حساب", "info");
          }
        } else {
          throw loginErr;
        }
      }
    }
    if (window.showNotification) window.showNotification("تمت العملية بنجاح");
    else window.showToast("تم تسجيل الدخول بنجاح", "success");
  } catch (e) {
    console.error("Auth Global Error:", e.code, e.message);
    let errorMsg = "حدث خطأ أثناء الاتصال بـ Firebase: " + e.code;
    
    if (e.code === "auth/admin-restricted-operation") {
      errorMsg = "التسجيل معطل من إعدادات Firebase (Admin Restricted).";
    } else if (e.code === "auth/email-already-in-use") {
      window.authMode = "login";
      return handleAuth();
    } else if (e.code === "auth/invalid-email") {
      errorMsg = "بيانات رقم الهاتف غير صالحة.";
    } else if (e.code === "auth/network-request-failed") {
      errorMsg = "فشل الاتصال بالإنترنت، يرجى المحاولة لاحقاً.";
    } else if (e.code === "auth/too-many-requests") {
        errorMsg = "محاولات كثيرة خاطئة، تم حظر الدخول مؤقتاً.";
    }
    
    window.showToast(errorMsg, "error");
  }
}

export function toggleAuthMode() {
  window.authMode = window.authMode === "login" ? "signup" : "login";
  document.getElementById("auth-title").innerText =
    window.authMode === "login" ? "تسجيل الدخول" : "حساب جديد";
  document.getElementById("auth-btn").innerText = 
    window.authMode === "login" ? "دخول" : "إنشاء حساب";
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
  const nameEl = document.getElementById("modal-full-name");
  const phoneEl = document.getElementById("modal-phone");
  const genderEl = document.getElementById("modal-gender");

  const name = nameEl ? nameEl.value.trim() : "";
  const phone = phoneEl ? phoneEl.value.trim() : "";
  const gender = genderEl ? genderEl.value : "male";

  if (!phone) return window.showToast("يرجى إدخال رقم الهاتف", "warning");

  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d]/g, '');
  const email = `${cleanPhone}@sheikh-app.com`;
  const pass = `pass_${cleanPhone}`;

  try {
    if (window.modalAuthMode === "signup") {
      const res = await window.authUtils.createUserWithEmailAndPassword(
        window.auth,
        email,
        pass,
      );
      const role = email.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
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
          name: name || "مستخدم جديد",
          phone: cleanPhone,
          gender,
          role,
          uid: res.user.uid,
          createdAt: window.firestoreUtils.serverTimestamp(),
        },
      );
    } else {
      try {
        await window.authUtils.signInWithEmailAndPassword(
          window.auth,
          email,
          pass,
        );
      } catch (loginErr) {
        if (loginErr.code === "auth/user-not-found" || loginErr.code === "auth/invalid-credential") {
          if (name) {
              window.modalAuthMode = "signup";
              return handleModalAuth();
          } else {
              return window.showToast("يرجى كتابة الاسم لإنشاء الحساب", "info");
          }
        } else {
          throw loginErr;
        }
      }
    }
    closeLoginModal();
    if (window.showNotification) window.showNotification("تمت العملية بنجاح");
    else window.showToast("تم الدخول بنجاح", "success");
  } catch (e) {
    console.error("Modal Auth Error:", e.code, e.message);
    let errorMsg = "خطأ في البيانات أو الخدمة غير مفعلة";
    if (e.code === "auth/invalid-email") errorMsg = "البيانات غير صحيحة";
    if (e.code === "auth/email-already-in-use") {
        window.modalAuthMode = "login";
        return handleModalAuth();
    }
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
  document.getElementById("modal-auth-btn").innerText = 
    window.modalAuthMode === "login" ? "دخول" : "إنشاء حساب";
}

export async function promoteUserToAdmin() {
  if (window.currentUserRole !== 'admin') {
      return window.showToast("عفواً، المدير العام فقط هو من يحق له تعديل صلاحيات الموظفين", "error");
  }

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
    if (window.currentUserRole !== 'admin') {
        return window.showToast("عفواً، المدير العام فقط هو من يحق له إزالة الموظفين", "error");
    }
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

export function openAddAdminModal_Legacy() { // Renamed just in case
    openAddAdminModal();
}

window.openAddAdminModal = openAddAdminModal;
window.promoteUserToAdmin = promoteUserToAdmin;
window.toggleModalAuthMode = toggleModalAuthMode;
