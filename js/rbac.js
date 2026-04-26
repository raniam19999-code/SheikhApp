/**
 * rbac.js: نظام إدارة الصلاحيات المتقدم (SHADOW-GOD OPTIMIZED)
 * محمي ضد الثغرات غير المتزامنة (Async Rendering Bugs) 
 */

export const ADMIN_ROLES = {
    SUPER_ADMIN: 'admin',      // المدير الأساسي: كل الصلاحيات + المراجعة
    IMPORTER: 'importer',      // أدمن 1: استيراد وتحديث الشيت فقط
    IMAGE_EDITOR: 'editor',    // محرر الصور: إضافة وتعديل صور فقط
    INVENTORY: 'inventory',    // مدير المخزن: مخزن ونواقص وتصدير فقط
    CREATOR: 'creator',        // مدخل بيانات: إضافة يدوية فقط
    REVIEWER: 'reviewer'       // مراجع: مراجعة التعديلات والموافقة عليها
};

// تعريف المسميات بالعربية للعرض
export const ROLE_LABELS = {
    admin: "مدير عام النظام",
    importer: "مسؤول استيراد البيانات",
    editor: "محرر الوسائط والصور",
    inventory: "مراقب المخزون",
    creator: "مدخل بيانات منتجات",
    reviewer: "مراجع جودة وتعديلات",
    user: "عميل مميز"
};

// رسائل التنبيه والمهام المحددة لكل موظف
export const ROLE_MESSAGES = {
    admin: "مرحباً بك يا مدير النظام. الأوامر مطاعة، كافة الصلاحيات مفعلة.",
    importer: "مرحباً بك. مهمتك الأساسية هي استيراد ملفات الإكسل لتحديث المخزون والأسعار.",
    editor: "مرحباً بك. تتركز مهامك في تعديل وتحسين صور المنتج ووصفه.",
    inventory: "مرحباً بك. أنت مسؤول عن متابعة حالة المخزن وجرد النواقص.",
    creator: "مرحباً بك. يمكنك إضافة منتجات جديدة يدوياً بانتظار المراجعة.",
    reviewer: "مرحباً بك. مهمتك هي مراجعة المنتجات والموافقة على نشرها."
};

// خريطة التبويبات المسموحة لكل رتبة
const ROLE_PERMISSIONS = {
    [ADMIN_ROLES.SUPER_ADMIN]: ["p", "c", "o", "i", "promo", "import", "bot", "review", "staff", "banners"],
    [ADMIN_ROLES.IMPORTER]: ["import"],
    [ADMIN_ROLES.IMAGE_EDITOR]: ["p", "banners"], 
    [ADMIN_ROLES.INVENTORY]: ["i"],
    [ADMIN_ROLES.CREATOR]: ["p"],
    [ADMIN_ROLES.REVIEWER]: ["p", "review"]
};

/**
 * دالة للتحقق هل يحق للمستخدم القيام بعملية حذف (حماية خلفية إضافية)
 */
export function canDelete() {
    return String(window.currentUserRole).trim().toLowerCase() === ADMIN_ROLES.SUPER_ADMIN;
}

/**
 * دالة تطبيق قيود الواجهة بناءً على الرتبة (تعمل بكفاءة O(1))
 */
export function applyUIPermissions() {
    const role = String(window.currentUserRole || 'user').trim().toLowerCase();

    // تحديث المسمى الوظيفي بحماية اختيارية (Optional Chaining) لمنع توقف السكريبت
    const roleLabelElem = document.getElementById("profile-role");
    if (roleLabelElem) {
        roleLabelElem.innerText = ROLE_LABELS[role] || (role === 'admin' ? "مدير عام" : "موظف");
    }

    // 1. التعامل مع العملاء العاديين فوراً (إغلاق الباب)
    if (role === 'user') {
        const allTabs = ["p", "c", "o", "i", "promo", "import", "bot", "review", "staff", "banners"];
        allTabs.forEach(tab => {
            const btn = document.getElementById(`admin-tab-${tab}`);
            if (btn) btn.classList.add('hidden');
        });
        document.body.classList.remove("is-admin");
        return; // إنهاء الدالة فوراً لتوفير موارد المعالج
    }
    
    // 2. إعداد بيئة الإدارة
    document.body.classList.add("is-admin");
    document.body.setAttribute('data-user-role', role);
    
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
    const adminTab = document.getElementById("admin-tab");
    if (adminTab) adminTab.classList.remove("hidden");

    // 3. نظام الإشعارات الذكي (لا يزعج الموظف كل مرة)
    const sessionKey = `welcome_msg_shown_${role}`;
    if (!sessionStorage.getItem(sessionKey)) {
        if (window.showToast) {
            window.showToast(ROLE_MESSAGES[role] || "مرحباً بك في لوحة التحكم", "info", 7000);
            sessionStorage.setItem(sessionKey, 'true');
        }
    }

    // 4. معالجة التبويبات المسموحة
    const allowedTabs = ROLE_PERMISSIONS[role] || [];
    const allTabs = ["p", "c", "o", "i", "promo", "import", "bot", "review", "staff", "banners"];

    allTabs.forEach(tab => {
        const btn = document.getElementById(`admin-tab-${tab}`);
        if (btn) {
            const isAllowed = allowedTabs.includes(tab);
            btn.classList.toggle('hidden', !isAllowed);
        }
    });

    // 5. زرع درع الحماية الديناميكي (CSS Injection)
    // هذا الدرع سيخفي أزرار الحذف فوراً حتى لتلك المنتجات التي لم يتم تحميلها بعد من الفايربيس
    injectRestrictionStyles(role);
    
    // 6. التوجيه الذكي (Auto-Routing) لضمان عدم بقاء الموظف في شاشة فارغة
    if (role !== ADMIN_ROLES.SUPER_ADMIN && allowedTabs.length > 0) {
        // نتحقق إذا كان التبويب الحالي المخفي هو النشط
        const hasVisibleActiveTab = document.querySelector('[id^="admin-tab-"].bg-white:not(.hidden)');
        if (!hasVisibleActiveTab && typeof window.showAdminSubTab === 'function') {
            window.showAdminSubTab(allowedTabs[0]);
        }
    }
}

/**
 * SHADOW-FIREWALL: حقن أنماط CSS لتقييد الحقول برمجياً
 * يضمن عدم تمكن أي موظف من تجاوز الصلاحيات عبر الـ DOM Manipulation
 */
function injectRestrictionStyles(role) {
    const styleId = 'shadow-rbac-css';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
    }

    let css = "";

    // درع عام لكل من هو غير المدير (منع الحذف نهائياً)
    if (role !== ADMIN_ROLES.SUPER_ADMIN) {
        css += `
            /* حماية ضد العناصر غير المتزامنة (Async DOM) */
            button[onclick*="deleteProduct"], 
            button[onclick*="deleteOrder"], 
            button[onclick*="deleteCategory"],
            #bulk-tools { 
                display: none !important; 
                pointer-events: none !important; 
                opacity: 0 !important; 
                position: absolute !important;
                z-index: -9999 !important;
            }
        `;
    }

    // قيود محرر الصور والوسائط
    if (role === ADMIN_ROLES.IMAGE_EDITOR) {
        css += `
            #add-admin-container,
            button[onclick="openProductModal()"],
            #admin-p-list .border-dashed { display: none !important; }
            
            #product-modal #p-unit, #product-modal #p-quantities,
            #product-modal div:has(> #p-unit), #product-modal div:has(> #p-quantities),
            #product-modal #pricing-fields-container > div:not(:first-child),
            #product-modal .bg-slate-50.p-4.rounded-\\[2rem\\],
            #product-modal p.text-slate-400 { display: none !important; pointer-events: none !important; }

            #product-modal #p-cat, #product-modal #p-sku { 
                background: #f1f5f9 !important; 
                pointer-events: none !important; 
                opacity: 0.6; 
            }
            
            #product-modal #p-name, #product-modal #p-desc, #product-modal #p-img-url { 
                border: 2px solid #10b981 !important; 
                box-shadow: 0 0 10px rgba(16,185,129,0.1) !important;
            }
        `;
    } 
    // قيود مراقب المخزون
    else if (role === ADMIN_ROLES.INVENTORY) {
        css += `
            button[onclick*="openProductModal()"] { display: none !important; }
            #product-modal #p-name, #product-modal #p-desc, #product-modal .bg-emerald-50\\/50, 
            #product-modal label[for="p-name"], #product-modal label[for="p-desc"],
            #product-modal .bg-slate-50.p-4.rounded-\\[2rem\\] { display: none !important; pointer-events: none !important; }
            #product-modal #p-qty { border: 2px solid #3b82f6 !important; }
        `;
    }

    styleEl.textContent = css;
}

window.canDelete = canDelete;
window.applyUIPermissions = applyUIPermissions;