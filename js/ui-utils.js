/* ========================================================
   ui-utils.js: التنبيهات، التبويبات، والوظائف العامة
======================================================== */

// دالة أمان لتشغيل الأيقونات للتأكد من وجود المكتبة
function safeCreateIcons() {
  try {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  } catch (e) {
    console.warn("Lucide icons failed to load", e);
  }
}

export function showTab(id) {
  if (id === "checkout" && (!window.currentUser || window.currentUser.isAnonymous)) {
    if (window.showLoginModal) {
      window.showLoginModal();
      return;
    }
  }

  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.remove("text-primary");
    b.classList.add("text-slate-400");
    const iconBg = b.querySelector(".nav-icon-bg");
    if (iconBg) iconBg.classList.remove("bg-emerald-50");
  });

  const activeNav = document.getElementById("nav-" + id);
  if (activeNav) {
    activeNav.classList.remove("text-slate-400");
    activeNav.classList.add("text-primary");
    const activeIconBg = activeNav.querySelector(".nav-icon-bg");
    if (activeIconBg) activeIconBg.classList.add("bg-emerald-50");
  }

  if (id === "cart") window.renderCart();
  window.scrollTo({ top: 0, behavior: "smooth" });
  safeCreateIcons();
}

// ربط الدالة بالنافذة لتشغيلها من الـ HTML
window.showTab = showTab;

export function showNotification(m) {
  const existing = document.getElementById("custom-toast");
  if (existing) existing.remove();
  const d = document.createElement("div");
  d.id = "custom-toast";
  d.className =
    "fixed top-5 md:top-8 left-1/2 -translate-x-1/2 bg-[#1B4332] backdrop-blur-md text-white px-6 py-4 rounded-2xl text-sm font-bold z-[2000] shadow-2xl flex items-center gap-3 modal-enter border border-emerald-500/50 max-w-[90vw]";
  d.innerHTML = `<i data-lucide="stars" class="w-5 h-5 text-amber-400 animate-pulse"></i> ${m}`;
  document.body.appendChild(d);
  safeCreateIcons();
  setTimeout(() => {
    d.style.animation = "fadeInUp 0.3s ease-in reverse forwards";
    setTimeout(() => d.remove(), 300);
  }, 3500);
}

export function showToast(
  message,
  type = "success",
  duration = 4000,
  onClick = null,
) {
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
  const activeColor = colors[type] || colors.info;
  const activeIcon = icons[type] || icons.info;
  toast.className = `bg-gradient-to-r ${activeColor} text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 border border-white/20 backdrop-blur-xl animate-fade-in-up pointer-events-auto cursor-pointer transform transition-all duration-300 active:scale-95 max-w-[95vw]`;
  toast.innerHTML = `<i data-lucide="${activeIcon}" class="w-5 h-5 flex-shrink-0 mt-0.5 animate-bounce"></i><div class="flex-1"><p class="font-bold text-sm leading-tight">${message}</p></div><button onclick="this.parentElement.remove()" class="text-white/70 hover:text-white transition-colors ml-2"><i data-lucide="x" class="w-4 h-4"></i></button>`;
  if (onClick) toast.onclick = onClick;
  container.appendChild(toast);
  safeCreateIcons();
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function createNotification(
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
  window.notifications.unshift(notification);
  if (window.notifications.length > 10) window.notifications.pop();
  updateNotificationPanel();
  updateNotificationBadge();
}

export function updateNotificationPanel() {
  const list = document.getElementById("notifications-list");
  if (!list) return;
  if (window.notifications.length === 0) {
    list.innerHTML = `<div class="px-6 py-8 text-center text-slate-400 flex flex-col items-center gap-2"><i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i><p class="font-bold text-sm">لا توجد إشعارات حالياً</p></div>`;
  } else {
    list.innerHTML = window.notifications
      .map(
        (n) => `
      <div class="px-6 py-4 hover:bg-emerald-50/50 transition-colors cursor-pointer group ${n.read ? "opacity-60" : "bg-emerald-50/20"}">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-slate-800 text-sm">${n.title}</p>
            <p class="text-xs text-slate-600 mt-0.5">${n.message}</p>
          </div>
        </div>
        ${n.actionText ? `<button onclick="handleNotificationAction(${n.id})" class="mt-2 w-full text-xs font-bold py-2 rounded-lg bg-[#1B4332] text-white">${n.actionText}</button>` : ""}
      </div>`,
      )
      .join("");
  }
  safeCreateIcons();
}

export function updateNotificationBadge() {
  const badge = document.getElementById("header-notification-badge");
  const unread = window.notifications.filter((n) => !n.read).length;
  badge.classList.toggle("hidden", unread === 0);
  badge.innerText = unread > 9 ? "+9" : unread;
}

export function toggleNotificationPanel() {
  const panel = document.getElementById("notification-panel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    window.notifications.forEach((n) => (n.read = true));
    updateNotificationBadge();
  }
}

export function handleNotificationAction(id) {
  const n = window.notifications.find((x) => x.id === id);
  if (n && n.actionFn) n.actionFn();
  // إخفاء اللوحة يتم فقط عبر الضغط على أيقونة الإشعارات كما طلب المستخدم
}

export function clearAllNotifications() {
  window.notifications = [];
  updateNotificationPanel();
  updateNotificationBadge();
}
window.clearAllNotifications = clearAllNotifications;
window.toggleNotificationPanel = toggleNotificationPanel;

export function getLocationGPS() {
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
        btn.classList.replace("text-emerald-500", "text-white");
        btn.classList.replace("bg-emerald-50", "bg-emerald-500");
        showNotification("تم التقاط موقعك بنجاح");
      },
      () => {
        btn.innerHTML = ogHtml;
        alert("فشل في تحديد الموقع.");
      },
      { enableHighAccuracy: true },
    );
  } else {
    alert("متصفحك لا يدعم تحديد الموقع.");
  }
}
window.getLocationGPS = getLocationGPS;

export function triggerPWAInstall() {
  if (!window.deferredPrompt) return;
  window.deferredPrompt.prompt();
  window.deferredPrompt.userChoice.then(({ outcome }) => {
    if (outcome === "accepted")
      document.getElementById("install-banner").classList.add("hidden");
    window.deferredPrompt = null;
  });
}
window.triggerPWAInstall = triggerPWAInstall;

export function navigateBack() {
  // العودة للحالة الرئيسية (عرض كل المنتجات والأقسام)
  window.currentParentId = null;
  window.activeSubCategoryName = null;

  const title = document.getElementById("current-category-title");
  if (title) {
    title.innerHTML = `<i data-lucide="grid" class="w-5 h-5 text-[#1B4332]"></i> قائمة المنتجات`;
  }

  if (typeof window.renderCategories === "function") window.renderCategories(); // Render top bar categories
  if (typeof window.renderSubcategoriesInMainGrid === "function")
    window.renderSubcategoriesInMainGrid(null); // Show default subcategories in main grid

  safeCreateIcons();
}

export function togglePaymentUI() {
  const method = document.querySelector(
    'input[name="payment-method"]:checked',
  ).value;
  document
    .getElementById("visa-form")
    .classList.toggle("hidden", method !== "visa");
}

export function formatCC(input) {
  let v = input.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
  let matches = v.match(/\d{4,16}/g);
  let match = (matches && matches[0]) || "";
  let parts = [];
  for (let i = 0, len = match.length; i < len; i += 4) {
    parts.push(match.substring(i, i + 4));
  }
  input.value = parts.length ? parts.join(" ") : v;
}

export function formatExp(input) {
  let v = input.value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
  if (v.length >= 2) {
    input.value = v.substring(0, 2) + "/" + v.substring(2, 4);
  } else {
    input.value = v;
  }
}
