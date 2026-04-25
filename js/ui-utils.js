/* ========================================================
   ui-utils.js: التنبيهات، التبويبات، والوظائف العامة
======================================================== */

// تعريف صوت التنبيه "Pop" الخفيف
const notificationSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");

window.playNotificationSound = function() {
  try {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(e => console.warn("Sound blocked by browser until user interaction"));
  } catch (e) {}
};

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
  
  if (window.playNotificationSound) window.playNotificationSound();
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
      <div class="px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer group ${n.read ? "opacity-60" : "bg-emerald-50/30"}">
        <div class="flex items-start gap-4">
          ${!n.read ? '<div class="w-2.5 h-2.5 bg-red-500 rounded-full mt-1.5 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse"></div>' : '<div class="w-2.5 h-2.5 shrink-0 mt-1.5"></div>'}
          <div class="min-w-0 flex-1">
            <p class="font-black text-slate-800 text-sm">${n.title}</p>
            <p class="text-xs text-slate-500 mt-1 font-semibold leading-relaxed">${n.message}</p>
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

export function toggleNotificationPanel(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById("notification-panel");
  if (!panel) return;

  const isHidden = panel.classList.contains("hidden");
  
  if (isHidden) {
    panel.classList.remove("hidden");
    updateNotificationPanel(); // تم نقل هذه الدالة لضمان أن النافذة تفتح أولاً ثم يتم تحديث محتواها
    safeCreateIcons();
  } else {
    if (window.notifications) window.notifications.forEach(n => n.read = true);
    updateNotificationBadge();
    panel.classList.add("hidden");
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

/**
 * إظهار شريط تقدم لعمليات الخلفية الكبيرة
 */
export function showProgress(id, title, total) {
  const container = document.getElementById("notification-container");
  if (!container) return;
  
  let progressDiv = document.getElementById(`progress-${id}`);
  if (!progressDiv) {
    progressDiv = document.createElement("div");
    progressDiv.id = `progress-${id}`;
    progressDiv.className = "bg-white p-5 rounded-[2rem] shadow-2xl border border-emerald-100 w-80 pointer-events-auto animate-fade-in-up flex flex-col gap-3 mb-3 transition-all duration-300";
    container.appendChild(progressDiv);
  }
  
  progressDiv.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-inner">
        <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-black text-slate-800 truncate">${title}</p>
        <p id="text-${id}" class="text-[9px] font-bold text-slate-400 mt-0.5">جاري التحضير...</p>
      </div>
    </div>
    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
      <div id="bar-${id}" class="bg-emerald-500 h-full transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]" style="width: 0%"></div>
    </div>
    <div class="flex justify-end">
       <span id="percent-${id}" class="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">0%</span>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

export function updateProgress(id, current, total) {
  const percent = Math.round((current / total) * 100);
  const bar = document.getElementById(`bar-${id}`);
  const text = document.getElementById(`text-${id}`);
  const per = document.getElementById(`percent-${id}`);
  if (bar) bar.style.width = `${percent}%`;
  if (text) text.innerText = `تمت معالجة ${current} من أصل ${total}`;
  if (per) per.innerText = `${percent}%`;
}

export function hideProgress(id) {
  const el = document.getElementById(`progress-${id}`);
  if (el) {
    el.style.opacity = "0";
    el.style.transform = "scale(0.95) translateY(10px)";
    setTimeout(() => el.remove(), 300);
  }
}
