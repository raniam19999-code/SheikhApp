/* ========================================================
   auth.js: تسجيل الدخول وإدارة الصلاحيات
======================================================== */

export async function initAuth() {
  if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
    await window.authUtils.signInWithCustomToken(
      window.auth,
      __initial_auth_token,
    );
  } else {
    try {
      await window.authUtils.signInAnonymously(window.auth);
    } catch (e) {
      console.warn("Auth Info:", e.code, e.message);
    }
  }
}

export function listenToAuth() {
  window.authUtils.onAuthStateChanged(window.auth, async (user) => {
    window.currentUser = user;
    const authView = document.getElementById("auth-view");
    const profileView = document.getElementById("profile-view");
    if (user && !user.isAnonymous) {
      authView.classList.add("hidden");
      profileView.classList.remove("hidden");
      document.getElementById("profile-email").innerText = user.email;
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
      if (
        user.email?.toLowerCase() ===
          window.PRIMARY_ADMIN_EMAIL.toLowerCase() &&
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
        data.role = "admin";
      }
      if (data.role === "admin") {
        window.currentUserRole = "admin";
        document.body.classList.add("is-admin");
        document.getElementById("admin-badge")?.classList.remove("hidden");
        document.getElementById("admin-tab")?.classList.remove("hidden");

        // Super Admin constraint
        if(user.email && user.email.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase()) {
            document.getElementById("admin-tab-bot")?.classList.remove("hidden");
        }
        if (
          !window.unsubs.orders &&
          typeof window.listenToOrders === "function"
        )
          window.unsubs.orders = window.listenToOrders();
        window.renderAdminProducts();
        window.renderAdminCategories();
      } else {
        window.currentUserRole = "user";
        document.body.classList.remove("is-admin");
        if (!window.unsubs.myOrders)
          window.unsubs.myOrders = window.loadUserOrders();
      }
      if (!window.unsubs.userCart)
        window.unsubs.userCart = window.listenToUserCart(user.uid);
    } else {
      window.currentUserRole = null;
      authView.classList.remove("hidden");
      profileView.classList.add("hidden");
      document.body.classList.remove("is-admin");
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
    window.showNotification("تمت العملية بنجاح");
  } catch (e) {
    let errorMsg = "خطأ: " + e.code;
    if (e.code === "auth/admin-restricted-operation") {
      errorMsg = "التسجيل موقوف، يجب تفعيل (Enable create sign-up) من إعدادات Firebase.";
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
  const provider = new window.authUtils.GoogleAuthProvider();
  try {
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
      let role =
        user.email?.toLowerCase() === window.PRIMARY_ADMIN_EMAIL.toLowerCase()
          ? "admin"
          : "user";
      await window.firestoreUtils.setDoc(uRef, {
        email: user.email,
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
  if (!email)
    return window.showToast("يرجى إدخال البريد الإلكتروني", "warning");

  try {
    const q = window.firestoreUtils.query(
      window.firestoreUtils.collection(
        window.db,
        "artifacts",
        window.appId,
        "users",
      ),
      window.firestoreUtils.where("email", "==", email.toLowerCase()),
    );
    const snap = await window.firestoreUtils.getDocs(q);
    if (snap.empty)
      return window.showToast("لم يتم العثور على مستخدم بهذا البريد", "error");

    await window.firestoreUtils.updateDoc(snap.docs[0].ref, { role: "admin" });
    window.showToast("تمت ترقية المستخدم لمدير بنجاح", "success");
    document.getElementById("add-admin-modal").classList.add("hidden");
  } catch (e) {
    window.showToast("فشل في الترقية", "error");
  }
}
