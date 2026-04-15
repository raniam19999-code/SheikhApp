/**
 * admin-logic.js: نظام إدارة المخزن والتحديث الشامل عبر إكسل
 */

// دالة لتنظيف النصوص العربية للمطابقة الدقيقة (تجاهل الهمزات والتاء المربوطة والمسافات)
function normalizeArabic(text) {
  if (typeof window.normalizeArabic === "function") return window.normalizeArabic(text);
  return String(text || "").trim().toLowerCase();
}

// دالة ذكية للبحث عن قيمة داخل الكائن (Row) بناءً على جزء من اسم العمود
function findValByParts(obj, parts) {
  const keys = Object.keys(obj);
  const norm = window.normalizeArabic || (t => String(t || "").trim().toLowerCase());
  
  // المرحلة 1: البحث عن تطابق تام (بعد التنظيف) لضمان دقة الاختيار (مثلاً "السعر" وليس "إجمالي السعر")
  for (const part of parts) {
    const cleanPart = norm(part);
    // نبحث عن تطابق تام لاسم العمود، مع التأكد أن القيمة ليست فارغة
    const foundKey = keys.find(k => norm(k) === cleanPart && obj[k] !== undefined && String(obj[k]).trim() !== "");
    if (foundKey) return obj[foundKey];
  }

  // المرحلة 2: البحث عن تطابق جزئي إذا لم نجد تطابقاً تاماً
  for (const part of parts) {
    const cleanPart = norm(part);
    // نبحث عن تطابق جزئي لاسم العمود، مع التأكد أن القيمة ليست فارغة
    const foundKey = keys.find(k => norm(k).includes(cleanPart) && obj[k] !== undefined && String(obj[k]).trim() !== "");

    if (
      foundKey &&
      obj[foundKey] !== undefined &&
      String(obj[foundKey]).trim() !== ""
    ) {
      return obj[foundKey];
    }
  }

  // المرحلة 2.5: إذا كنا نبحث عن سعر، ولم نجد مسمى، نبحث عن أول عمود يحتوي على رقم صالح
  if (parts.includes("السعر") || parts.includes("Price")) {
    // استبعاد الأعمدة التي من المستحيل أن تكون هي السعر (مثل الكمية، الكود، التليفون)
    const skipList = ["كميه", "كمية", "qty", "quantity", "كود", "sku", "id", "الرمز", "index", "تلفون", "هاتف", "mobile", "وحدة", "الوحدات", "كود الوحدات"];
    
    for (const k of keys.filter(key => !norm(key).includes("اجمال") && !skipList.some(s => norm(key).includes(s)))) {
      const val = obj[k];
      if (typeof val === "number" && val > 0) return val;
      const parsed = parseFloat(String(val).replace(/[^\d.-]/g, ''));
      if (!isNaN(parsed) && parsed > 0) return val;
    }
  }
  
  // المرحلة 3: التعامل مع الملفات التي تفتقد للعناوين (fallback)
  const emptyKeys = keys.filter((k) => k.includes("EMPTY")).reverse();
  if (parts.includes("كود") && emptyKeys.length > 0) return obj[emptyKeys[0]] || ""; 
  return "";
}

// دالة لمعالجة الأرقام التي تحتوي على فواصل (مثل 2,025.00) لضمان قراءتها بشكل صحيح
function parseExcelNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  
  // تحويل الأرقام العربية والفارسية إلى إنجليزية لضمان القراءة البرمجية
  let str = String(val)
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

  // إزالة العملات والرموز والفواصل والمسافات والحروف
  let cleaned = str.replace(/[^\d.-]/g, '').trim();
    
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function closeModals() {
  document.getElementById("product-modal").classList.add("hidden");
  document.getElementById("product-modal").classList.remove("flex");
  document.getElementById("category-modal").classList.add("hidden");
  document.getElementById("category-modal").classList.remove("flex");
  window.editingId = null;
}
window.closeModals = closeModals;

export function openProductModal(product = null) {
  window.editingId = product ? product.id : null;
  document.getElementById("modal-p-title").innerText = product
    ? "تعديل منتج"
    : "إضافة منتج جديد";

  updateCategorySelects();

  // تحديث قائمة الوحدات في المودال لتطابق المسميات الجديدة
  const unitSelect = document.getElementById("p-unit");
  if (unitSelect) {
    const units = [
      { val: "كيس", label: "كيس & شنطة" },
      { val: "قطعة", label: "قطعة" },
      { val: "علبة", label: "علبة" },
      { val: "كرتونة", label: "كرتونة" },
      { val: "جردل", label: "جردل" },
      { val: "صفيحة", label: "صفيحة" },
      { id: "شرنك", label: "شرنك" },
      { id: "رابطة", label: "رابطة (Bundle)" }
    ];
    unitSelect.innerHTML = units.map(u => `<option value="${u.val || u.id}">${u.label}</option>`).join("");
  }

  document.getElementById("p-name").value = product ? product.name : "";
  document.getElementById("p-cat").value = product
    ? product.categoryId || ""
    : "";
  document.getElementById("p-unit").value = product
    ? product.unitMeasurement || "كيس"
    : "كيس";
  document.getElementById("p-quantities").value = product
    ? product.availableQuantities || ""
    : "";
  document.getElementById("p-img-url").value = "";
  document.getElementById("p-img-base64").value = product
    ? product.img || ""
    : "";
  document.getElementById("p-img-preview").src = product
    ? product.img || ""
    : "";
  document
    .getElementById("p-img-preview")
    .classList.toggle("hidden", !product || !product.img);
  document
    .getElementById("p-img-placeholder")
    .classList.toggle("hidden", !!(product && product.img));

  if (window.injectPricingFields) window.injectPricingFields(product);

  document.getElementById("product-modal").classList.remove("hidden");
  document.getElementById("product-modal").classList.add("flex");
}
window.openProductModal = openProductModal;

export async function saveProduct() {
  const name = document.getElementById("p-name").value.trim();
  const categoryId = document.getElementById("p-cat").value;
  const unit = document.getElementById("p-unit").value;
  const quantities = document.getElementById("p-quantities").value;
  const img = document.getElementById("p-img-base64").value;

  if (!name || !categoryId)
    return window.showToast("يرجى إدخال الاسم والقسم", "warning");

  const pricing = window.getPricingValues ? window.getPricingValues() : { price: 0 };
  const categoryObj = window.categories.find((c) => c.id === categoryId);

  const data = {
    name,
    price: pricing.price, // التأكيد على حفظ السعر في الحقل الرئيسي
    categoryId,
    category: categoryObj ? categoryObj.name : "عام",
    unitMeasurement: unit, // تم التوحيد مع نظام جلب البيانات
    availableQuantities: quantities,
    img: img || document.getElementById("p-img-url").value, // استخدام الرابط المباشر إذا لم تكتمل عملية المعالجة
    ...pricing,
    updatedAt: window.firestoreUtils.serverTimestamp(),
  };

  const productsRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products",
  );

  try {
    if (window.editingId) {
      await window.firestoreUtils.updateDoc(
        window.firestoreUtils.doc(productsRef, window.editingId),
        data,
      );
      window.showToast("تم تحديث المنتج", "success");
    } else {
      await window.firestoreUtils.addDoc(productsRef, data);
      window.showToast("تم إضافة المنتج بنجاح", "success");
    }
    closeModals();
  } catch (e) {
    if (e.code === "permission-denied") {
      window.showToast("ليس لديك صلاحية للقيام بهذا الإجراء (تأكد من تسجيل الدخول كمدير)", "error");
    } else {
      window.showToast("خطأ في الحفظ: " + (e.message || "حدث خطأ غير متوقع"), "error");
    }
  }
}
window.saveProduct = saveProduct;

export function openCategoryModal(cat = null) {
  window.editingId = cat ? cat.id : null;
  document.getElementById("c-name").value = cat ? cat.name : "";
  document.getElementById("c-img-base64").value = cat ? cat.img || "" : "";
  document.getElementById("c-img-preview").src = cat ? cat.img || "" : "";
  document
    .getElementById("c-img-preview")
    .classList.toggle("hidden", !cat || !cat.img);

  const parentSelect = document.getElementById("c-parent");
  const options = (window.categories || [])
    .filter((c) => !c.parentId && (!cat || c.id !== cat.id))
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  parentSelect.innerHTML = `<option value="">-- قسم رئيسي --</option>${options}`;
  parentSelect.value = cat ? cat.parentId || "" : "";

  document.getElementById("category-modal").classList.remove("hidden");
  document.getElementById("category-modal").classList.add("flex");
}
window.openCategoryModal = openCategoryModal;

export async function saveCategory() {
  const name = document.getElementById("c-name").value.trim();
  const parentId = document.getElementById("c-parent").value;
  const img = document.getElementById("c-img-base64").value;

  if (!name) return window.showToast("يرجى إدخال اسم القسم", "warning");

  const data = {
    name,
    parentId,
    img: img || document.getElementById("c-img-url").value, // استخدام الرابط المباشر كاحتياط
    updatedAt: window.firestoreUtils.serverTimestamp(),
  };
  const ref = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "categories",
  );

  try {
    if (window.editingId) {
      await window.firestoreUtils.updateDoc(
        window.firestoreUtils.doc(ref, window.editingId),
        data,
      );
      window.showToast("تم تحديث القسم", "success");
    } else {
      await window.firestoreUtils.addDoc(ref, data);
      window.showToast("تم إضافة القسم بنجاح", "success");
    }
    closeModals();
  } catch (e) {
    window.showToast("خطأ في الحفظ", "error");
  }
}
window.saveCategory = saveCategory;

export function renderAdminProducts() {
  const list = document.getElementById("admin-p-list");
  if (!list) return;

  const productsCount = window.products ? window.products.length : 0;
  const categoriesCount = window.categories ? window.categories.length : 0;

  const addBtn = `<button onclick="openProductModal()" class="col-span-full border-2 border-dashed border-slate-200 p-4 rounded-2xl text-slate-400 font-bold text-sm hover:border-emerald-500 hover:text-emerald-500 transition-all">+ إضافة منتج جديد</button>`;

  const products = window.products || [];
  let html = products
    .map(
      (p) => `
    <div class="bg-white p-3 rounded-2xl border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 shadow-inner shrink-0 leading-[0]">
          <img src="${p.img || "img/logo.png"}" class="w-full h-full object-cover">
        </div>
        <div>
          <p class="font-bold text-xs text-slate-800">${p.name}</p>
          <div class="flex items-center gap-1 mt-0.5 whitespace-nowrap overflow-hidden">
            <span class="text-[9px] text-emerald-600 bg-emerald-50 px-1 rounded">${p.category}</span>
            <span class="text-[9px] text-slate-400 bg-slate-100 px-1 rounded font-mono">كود: ${p.sku || "—"}</span>
            <span class="text-[9px] text-amber-600 bg-amber-50 px-1 rounded font-bold">س: ${Number(p.price || (p.prices && p.prices.bag) || 0).toFixed(2)}</span>
            <span class="text-[9px] ${p.quantity <= 0 ? 'text-red-500 bg-red-50' : 'text-blue-500 bg-blue-50'} px-1 rounded font-bold">م: ${p.quantity || 0}</span>
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="openProductModal(${JSON.stringify(p).replace(/"/g, "&quot;")})" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
        <button onclick="deleteProduct('${p.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    </div>
  `,
    )
    .join(""); // Moved this line up

  list.innerHTML = `
    <div class="col-span-full bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <i data-lucide="package" class="w-6 h-6 text-emerald-600"></i>
        <p class="font-black text-slate-800 text-sm">إجمالي المنتجات: <span id="admin-products-count" class="text-emerald-600">${productsCount}</span></p>
      </div>
      <div class="flex items-center gap-3">
        <i data-lucide="folder" class="w-6 h-6 text-blue-600"></i>
        <p class="font-black text-slate-800 text-sm">إجمالي الأقسام: <span id="admin-categories-count" class="text-blue-600">${categoriesCount}</span></p>
      </div>
    </div>
    ${addBtn}
    ${html}
  `;
  if (window.lucide) lucide.createIcons();
}
window.renderAdminProducts = renderAdminProducts;

/**
 * تحديث الإحصائيات فقط (العدادات) دون رندرة كاملة للأصناف لضمان السرعة
 */
export function updateAdminStats() {
    const pCountSpan = document.getElementById("admin-products-count");
    const cCountSpan = document.getElementById("admin-categories-count");
    
    if (pCountSpan) {
        pCountSpan.innerText = window.products ? window.products.length : 0;
    }
    if (cCountSpan) {
        cCountSpan.innerText = window.categories ? window.categories.length : 0;
    }
}
window.updateAdminStats = updateAdminStats;

export function renderAdminCategories() {
  const list = document.getElementById("admin-c-list");
  if (!list) return;

  const categories = window.categories || [];
  let html = categories
    .map(
      (c) => `
    <div class="bg-white p-3 rounded-2xl border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full overflow-hidden border border-slate-100 shadow-inner shrink-0 leading-[0] relative">
          <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('${c.img || "img/logo.png"}');"></div>
        </div>
        <p class="font-bold text-xs text-slate-800">${c.name}</p>
      </div>
      <div class="flex gap-2">
        <button onclick="openCategoryModal(${JSON.stringify(c).replace(/"/g, "&quot;")})" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
        <button onclick="deleteCategory('${c.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    </div>
  `,
    )
    .join("");

  const addBtn = `<button onclick="openCategoryModal()" class="col-span-full border-2 border-dashed border-slate-200 p-4 rounded-2xl text-slate-400 font-bold text-sm hover:border-blue-500 hover:text-blue-500 transition-all">+ إضافة قسم جديد</button>`;
  list.innerHTML = addBtn + html;
  if (window.lucide) lucide.createIcons();
}

export async function deleteProduct(id) {
  if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
  try {
    await window.firestoreUtils.deleteDoc(
      window.firestoreUtils.doc(
        window.db,
        "artifacts",
        window.appId,
        "public",
        "data",
        "products",
        id,
      ),
    );
    window.showToast("تم حذف المنتج", "success");
  } catch (e) {
    window.showToast("خطأ في الحذف", "error");
  }
}
window.deleteProduct = deleteProduct;

export async function deleteCategory(id) {
  if (
    !confirm(
      "هل أنت متأكد من حذف هذا القسم؟ سيؤدي ذلك لإخفاء المنتجات المرتبطة به.",
    )
  )
    return;
  try {
    await window.firestoreUtils.deleteDoc(
      window.firestoreUtils.doc(
        window.db,
        "artifacts",
        window.appId,
        "public",
        "data",
        "categories",
        id,
      ),
    );
    window.showToast("تم حذف القسم", "success");
  } catch (e) {
    window.showToast("خطأ في الحذف", "error");
  }
}
window.deleteCategory = deleteCategory;

// 0. التبديل بين التبويبات الفرعية في لوحة التحكم
export function showAdminSubTab(tab) {
  const tabs = ["p", "c", "o", "i", "bot", "import"];
  tabs.forEach((t) => {
    const btn = document.getElementById(`admin-tab-${t}`);
    const list = document.getElementById(`admin-${t}-list`);
    if (btn) {
      const isActive = t === tab;
      btn.classList.toggle("bg-white", isActive);
      btn.classList.toggle("shadow-sm", isActive);
      btn.classList.toggle("text-[#1B4332]", isActive);
      btn.classList.toggle("font-black", isActive);
      btn.classList.toggle("text-slate-500", !isActive);
      btn.classList.toggle("font-bold", !isActive);
    }
    if (list) list.classList.toggle("hidden", t !== tab);
  });

  if (tab === "i") renderInventoryAudit();
  if (tab === "import") renderAdminImportTools();
  if (tab === "p" && typeof renderAdminProducts === "function")
    renderAdminProducts();
  if (tab === "c" && typeof renderAdminCategories === "function")
    renderAdminCategories();
  if (tab === "bot" && typeof window.renderBotResponses === "function")
    window.renderBotResponses();

  if (window.lucide) lucide.createIcons();
}
window.showAdminSubTab = showAdminSubTab;

// رندرة واجهة الاستيراد المخصصة
export function renderAdminImportTools() {
    const list = document.getElementById("admin-import-list");
    if (!list) return;
    
    list.innerHTML = `
        <div class="space-y-6 animate-fade-in-up">
            <div class="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                        <i data-lucide="file-spreadsheet" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h3 class="font-black text-slate-800 text-lg">استيراد المنتجات وتحديث الأسعار</h3>
                        <p class="text-xs text-slate-500 font-semibold">ارفع ملف إكسل يحتوي على (الكود، الصنف، السعر، القسم)</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onclick="document.getElementById('bulk-file-input').click()" class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] hover:border-emerald-500 hover:bg-emerald-50 transition-all group">
                        <i data-lucide="upload-cloud" class="w-10 h-10 text-slate-300 group-hover:text-emerald-500 mb-2"></i>
                        <span class="text-sm font-black text-slate-700">رفع ملف المنتجات الجديد</span>
                        <span class="text-[10px] text-slate-400">لإضافة أصناف جديدة بالكامل</span>
                    </button>
                    <button onclick="openBulkPriceUpdateModal()" class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] hover:border-amber-500 hover:bg-amber-50 transition-all group">
                        <i data-lucide="refresh-cw" class="w-10 h-10 text-slate-300 group-hover:text-amber-500 mb-2"></i>
                        <span class="text-sm font-black text-slate-700">تحديث الأسعار فقط</span>
                        <span class="text-[10px] text-slate-400">تحديث أسعار الأصناف الموجودة مسبقاً</span>
                    </button>
                    <button onclick="openBulkImportModal()" class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] hover:border-blue-500 hover:bg-blue-50 transition-all group md:col-span-2">
                        <i data-lucide="filter" class="w-10 h-10 text-slate-300 group-hover:text-blue-500 mb-2"></i>
                        <span class="text-sm font-black text-slate-700">إضافة سريعة بكلمات مفتاحية</span>
                        <span class="text-[10px] text-slate-400">رفع أصناف محددة فقط من ملف إكسل ضخم بناءً على كلمات دالة</span>
                    </button>
                </div>
                <input type="file" id="bulk-file-input" class="hidden" accept=".xlsx,.xls,.csv" onchange="handleBulkFileUpload(event)">
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

// 1. استيراد ومعالجة ملف الإكسل (Bulk Upload)
export async function handleBulkFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  window.showNotification("جاري قراءة الملف...");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) return alert("الملف فارغ!");

  // حفظ البيانات في المتغير العالمي ليتمكن نظام "الإضافة السريعة" من الوصول إليها
  window.lastUploadedRows = rows;

  if (confirm(`تم العثور على ${rows.length} صنف في الملف. هل تريد معالجة البيانات وتحديث المتجر الآن؟`)) {
    await processBulkProducts(rows);
  }
}
window.handleBulkFileUpload = handleBulkFileUpload;

/**
 * smartRowBasedUpdate: الدالة الذكية لمعالجة الأسطر وبناء اسم المنتج بالكامل
 */
export async function smartRowBasedUpdate(rows) {
  const productsRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products"
  );

  let batch = window.firestoreUtils.writeBatch(window.db);
  let opCount = 0; // عداد للعمليات داخل الباتش الحالي
  let updated = 0;
  let created = 0;

  window.isBulkUploading = true; // تفعيل وضع الرفع لمنع الرندرة المتكررة للواجهة
  
  // 1. تجميد نسخة من المنتجات الموجودة في لحظة البدء (snapshot)
  // هذا يمنع تداخل Firebase Listener مع عملية المطابقة أثناء رفع الآلاف
  const existingProductsSnapshot = [...(window.products || [])];
  const totalExisting = existingProductsSnapshot.length;
  console.log("إجمالي المنتجات المسجلة حالياً (snapshot):", totalExisting);

  // 2. بناء الفهرس الذكي للبحث السريع (O(1)) من النسخة المجمدة فقط
  const productMap = new Map();
  existingProductsSnapshot.forEach(p => {
    const key1 = normalizeArabic(p.name || "");
    const key2 = normalizeArabic(p.sku || "");
    if (key1) productMap.set(key1, p);
    if (key2) productMap.set(key2, p);
    if (key2) productMap.set(key2.replace(/^0+/, ''), p); // دعم الأكواد بدون أصفار
  });

  // تم إزالة التنبيه الأولي لتقليل الإزعاج بطلب من المستخدم
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const r = {};
      Object.keys(row).forEach(k => r[k.trim()] = row[k]);
      const values = Object.values(r).map(v => String(v || "").trim());

      const sku = String(findValByParts(r, ["كود", "SKU", "code", "ID", "باركود"])).trim();
      let price = parseExcelNumber(findValByParts(r, ["السعر", "جملة", "بيع", "Price", "100", "101", "102", "103"]));

      if (!price || price <= 0) {
        for (const val of values) {
          const num = parseExcelNumber(val);
          if (num > 0 && num < 100000) { price = num; break; }
        }
      }

      let qty = parseExcelNumber(findValByParts(r, ["كمية", "الكمية", "Stock"])) || 0;

      const nameParts = values.filter(v => {
        const isNumeric = /^\d+(\.\d+)?$/.test(v);
        const isPrice = !isNaN(parseExcelNumber(v)) && parseExcelNumber(v) > 0 && parseExcelNumber(v) < 100000;
        return v && !isNumeric && !isPrice && v.length > 1;
      });
      
      let fullName = nameParts.join(" ").replace(/\s+/g, " ").trim();
      // إذا وجدنا عمود صريح للاسم، نستخدمه لضمان الدقة
      const explicitName = String(findValByParts(r, ["الصنف", "الاسم", "البيان"])).trim();
      if (explicitName && explicitName.length > 2) fullName = explicitName;

      // استخراج القسم من الصف أو استخدامه من البيانات الممررة (حل مشكلة الأقسام الفرعية)
      // ملاحظة: saveBulkProducts بتمرر البيانات بمفاتيح "Category" و "categoryId"
      const rowCategory = r["Category"] || findValByParts(r, ["القسم", "المجموعة", "التصنيف", "Category"]) || "عام";
      const rowCatId = r["categoryId"] || "";

      if (!fullName && !sku) continue;

      // 3. المطابقة: هل المنتج موجود؟
      // ⚡ القاعدة: الأسماء معقدة ومتغيرة (مثل "جبن دومتي رومي *500*27")
      //    لذلك نعتمد على الكود (SKU) فقط للمطابقة
      //    إذا لم يوجد كود → نُضيف دائماً كمنتج جديد
      const normSku = normalizeArabic(sku);
      const cleanSku = normSku.replace(/^0+/, '');

      let product = null;

      if (normSku && normSku.length > 1) {
        // المطابقة بالكود فقط (الأكثر موثوقية للأسماء المعقدة)
        product = productMap.get(normSku) || productMap.get(cleanSku);

        // بحث احتياطي في الـ snapshot إذا فشل الـ Map
        if (!product) {
          product = existingProductsSnapshot.find(p => {
            const dbSku = normalizeArabic(p.sku || "").replace(/^0+/, '');
            return dbSku && dbSku.length > 1 && dbSku === cleanSku;
          });
        }
      }
      // إذا لم يوجد كود → لا نحاول المطابقة بالاسم المعقد → create مباشرة

      if (product) {
        // ✏️ تحديث المنتج الحالي (منع التكرار)
        const docRef = window.firestoreUtils.doc(productsRef, product.id || product.originalId);
        batch.update(docRef, {
          name: fullName || product.name,
          sku: sku || product.sku,
          price: price || product.price,
          quantity: qty || product.quantity || 0,
          category: rowCategory,
          categoryId: rowCatId,
          "prices.bag": price || product.price,
          "availableUnits.bag": true,
          updatedAt: window.firestoreUtils.serverTimestamp()
        });
        updated++;
      } else {
        const newDoc = window.firestoreUtils.doc(productsRef);
        batch.set(newDoc, {
          name: fullName,
          sku: sku,
          price: price,
          quantity: qty,
          prices: { bag: price },
          availableUnits: { bag: true },
          category: rowCategory,
          categoryId: rowCatId,
          status: qty > 0 ? "available" : "out_of_stock",
          updatedAt: window.firestoreUtils.serverTimestamp()
        });
        created++;
      }

      opCount++;
      if (opCount >= 450) { // تأمين قبل الوصول للحد الأقصى 500
        await batch.commit();
        batch = window.firestoreUtils.writeBatch(window.db);
        opCount = 0;
      }
    } catch (e) { console.error("Row error:", e, row); }
  }
  if (opCount > 0) {
    await batch.commit();
  }
  
  window.isBulkUploading = false; // إنهاء وضع الرفع
  // إعادة رندرة الواجهة مرة واحدة بعد الانتهاء
  if (typeof window.renderAdminProducts === "function") window.renderAdminProducts(); 
  window.showToast(`✅ تم إضافة ${created} منتج جديد | 🔄 تحديث ${updated} منتج موجود`, "success", 8000);
}

// استبدال الدالة القديمة بالدالة الذكية الجديدة
async function processBulkProducts(rows) { await smartRowBasedUpdate(rows); }
window.smartRowBasedUpdate = smartRowBasedUpdate;

function deriveStatus(qty, min) {
  if (qty <= 0) return "out_of_stock";
  if (qty <= min) return "low_stock";
  return "available";
}
window.deriveStatus = deriveStatus;

// وظائف المودال الخاص بالاستيراد بكلمات مفتاحية
export function openBulkImportModal() {
    const modal = document.getElementById("bulk-import-modal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    }
}
window.openBulkImportModal = openBulkImportModal;

export function closeBulkImportModal() {
    const modal = document.getElementById("bulk-import-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        // تم إزالة تصفير window.lastUploadedRows للحفاظ على البيانات المرفوعة
        // حتى لو أغلق المدمن النافذة بالخطأ أو أراد إضافة قسم آخر من نفس الملف
    }
}
window.closeBulkImportModal = closeBulkImportModal;

// معالجة وحفظ المنتجات المفلترة بالكلمات المفتاحية
export async function saveBulkProducts() {
    const keywords = document.getElementById("bulk-keywords").value.split(",").map(k => normalizeArabic(k)).filter(Boolean);
    const sheetDataText = document.getElementById("bulk-sheet-data").value.trim();
    const unit = document.getElementById("bulk-unit").value;
    const quantities = document.getElementById("bulk-quantities").value;
    const targetCatId = document.getElementById("bulk-import-cat").value;
    const targetCatObj = window.categories.find(c => c.id === targetCatId);
    
    let rows = window.lastUploadedRows || [];

    // إذا قام المستخدم بلصق نص يدوياً بدلاً من رفع ملف
    if (rows.length === 0 && sheetDataText) {
        const lines = sheetDataText.split("\n");
        rows = lines.map(line => {
            const parts = line.split(/[\t,]/);
            return { "الاسم": parts[0], "السعر": parts[1], "الكود": parts[2], "الكمية": parts[3] };
        }).filter(r => r.الاسم);
    }

    if (rows.length === 0) return window.showToast("يرجى رفع ملف أو لصق بيانات أولاً", "warning");

    // تصفية الصفوف بناءً على الكلمات المفتاحية (اختياري)
    let filteredRows = rows;
    if (keywords.length > 0) {
        filteredRows = rows.filter(row => {
            // تنظيف مفاتيح الصف (Headers) لضمان العثور على الأعمدة حتى لو بها مسافات زائدة في ملف الإكسل
            const r = {};
            Object.keys(row).forEach(k => r[k.trim()] = row[k]);
            
            const nameNormalized = normalizeArabic(findValByParts(r, ["صنف", "المنتج", "اسم", "البيان", "Name"]));
            const skuNormalized = normalizeArabic(findValByParts(r, ["كود", "SKU", "الرمز", "الباركود", "code"]));
            
            // البحث في الاسم أو الكود لضمان مرونة أكبر في الاستيراد السريع
            return keywords.some(k => nameNormalized.includes(k) || skuNormalized.includes(k));
        });
        if (filteredRows.length === 0) return window.showToast("لم يتم العثور على أصناف مطابقة للكلمات المفتاحية", "warning");
    }

    const countText = keywords.length > 0 ? `مطابق للفلترة` : `إجمالي`;
    if (confirm(`تم العثور على ${filteredRows.length} صنف ${countText}. هل تريد إضافتهم/تحديثهم الآن؟`)) {
        window.showNotification("جاري معالجة الأصناف المختارة...");
        
        // تعديل البيانات لتشمل الوحدة والكميات المحددة في المودال قبل الإرسال
        const rowsToProcess = filteredRows.map(r => {
            const rowCleaned = {};
            Object.keys(r).forEach(k => rowCleaned[k.trim()] = r[k]);
            
            // التأكد من وجود الأعمدة الأساسية
            const sku = String(findValByParts(rowCleaned, ["كود", "SKU", "الكود"])).trim();
            const name = String(findValByParts(rowCleaned, ["صنف", "اسم", "البيان", "Name"])).trim();
            const price = parseExcelNumber(findValByParts(rowCleaned, ["سعر", "Price", "جملة"]));
            const qty = parseExcelNumber(findValByParts(rowCleaned, ["كمية", "Stock", "الكمية", "مخزون"])) || 100;

            return {
                ...rowCleaned,
                "Name": name,
                "SKU": sku,
                "Price": price,
                "Quantity": qty,
                "Unit": unit,
                "Category": targetCatObj ? targetCatObj.name : "عام",
                "categoryId": targetCatId || "",
                "MinStock": 5,
                "AvailableQuantities": quantities 
            };
        });

        try {
            await processBulkProducts(rowsToProcess);
            closeBulkImportModal();
            document.getElementById("bulk-keywords").value = "";
            document.getElementById("bulk-sheet-data").value = "";
        } catch (e) {
            console.error(e);
            window.showToast("حدث خطأ أثناء الحفظ", "error");
        }
    }
}
window.saveBulkProducts = saveBulkProducts;

// 2. إدارة جرد المخزن والنواقص
export function renderInventoryAudit() {
  const list = document.getElementById("admin-i-list");
  if (!list) return;

  const products = window.products || [];

  let html = `
    <div class="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
      <div class="p-4 bg-slate-50 border-b flex justify-between items-center">
        <h4 class="font-black text-slate-800 text-sm">تقرير حالة المخزن</h4>
        <button onclick="exportShortageReport()" class="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold">تصدير النواقص</button>
      </div>
      <table class="w-full text-right text-xs">
        <thead>
          <tr class="bg-slate-50 text-slate-500">
            <th class="p-3">المنتج</th>
            <th class="p-3">المخزون</th>
            <th class="p-3">الحالة</th>
            <th class="p-3 text-center">تحديث سريع</th>
          </tr>
        </thead>
        <tbody class="divide-y">
  `;

  products
    .sort((a, b) => (a.quantity || 0) - (b.quantity || 0))
    .forEach((p) => {
      const qty = p.quantity || 0;
      const min = p.minThreshold || 5;
      let statusColor = "bg-emerald-500";
      let statusText = "متوفر";

      if (qty <= 0) {
        statusColor = "bg-red-500";
        statusText = "نفذت الكمية";
      } else if (qty <= min) {
        statusColor = "bg-amber-500";
        statusText = "كمية حرجة";
      }

      html += `
      <tr>
        <td class="p-4">
          <p class="font-bold text-slate-800">${p.name}</p>
          <p class="text-[10px] text-slate-400 font-mono">SKU: ${p.sku || "---"}</p>
          <p class="text-[9px] text-emerald-600 font-bold bg-emerald-50 inline-block px-1 rounded mt-0.5">${p.category || "عام"}</p>
        </td>
        <td class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-[10px] font-bold text-emerald-700">كيس: ${Number(p.prices?.bag || 0).toFixed(2)} <span class="currency-shic">EGP</span></span>
            <span class="text-[10px] font-bold text-blue-700">كرتونة: ${Number(p.prices?.carton || 0).toFixed(2)} <span class="currency-shic">EGP</span></span>
          </div>
        </td>
        <td class="p-4 font-mono font-black text-sm">${qty}</td>
        <td class="p-4">
          <span class="${statusColor} text-white px-2 py-0.5 rounded-md text-[9px] font-bold">${statusText}</span>
        </td>
        <td class="p-4">
          <div class="flex items-center justify-center gap-2">
            <input type="number" id="inline-qty-${p.id}" value="${qty}" class="w-12 p-1 border rounded text-center">
            <button onclick="updateProductQty('${p.id}')" class="text-emerald-600"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
          </div>
        </td>
      </tr>
    `;
    });

  html += `</tbody></table></div>`;
  list.innerHTML = html;
  lucide.createIcons();
}

// 2.1 وظائف مودال تحديث الأسعار (Bulk Price Update)
export function openBulkPriceUpdateModal() {
  const modal = document.getElementById("bulk-price-update-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    updateCategorySelects();
  }
}
window.openBulkPriceUpdateModal = openBulkPriceUpdateModal;

export function closeBulkPriceUpdateModal() {
  const modal = document.getElementById("bulk-price-update-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}
window.closeBulkPriceUpdateModal = closeBulkPriceUpdateModal;

export function updateCategorySelects() {
  const selects = ["p-cat", "bulk-price-cat", "bulk-import-cat"];
  
  selects.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      let cats = window.categories || [];
      // فلترة الأقسام لإظهار الأقسام الفرعية فقط عند إضافة منتج أو استيراد لضمان دقة البيانات
      if (id === "p-cat" || id === "bulk-import-cat") {
        cats = cats.filter(c => c.parentId);
      }

      const options = cats.map((c) => {
        const parent = (window.categories || []).find(p => p.id === c.parentId);
        // عرض اسم القسم الرئيسي بجانب الفرعي لسهولة التمييز (مثال: بقالة » جبن)
        const displayName = parent ? `${parent.name} » ${c.name}` : c.name;
        return `<option value="${c.id}">${displayName}</option>`;
      }).join("");

      let defaultText = "-- القسم التابع له--";
      if (id === "bulk-price-cat") defaultText = "-- كل الأقسام (تحديث شامل) --";
      if (id === "bulk-import-cat") defaultText = "-- اختيار قسم فرعي --";

      const extraOption = id === "bulk-price-cat" ? '<option value="none">-- منتجات بدون قسم --</option>' : '';
      el.innerHTML = `<option value="">${defaultText}</option>${extraOption}${options}`;
    }
  });
}

// معالجة رفع ملف الأسعار وتحويله لنص في منطقة المعاينة
export async function handleBulkPriceFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) return window.showToast("الملف فارغ أو غير مدعوم", "error");

    const textLines = rows
      .map((row) => {
        const r = {};
        Object.keys(row).forEach((k) => (r[k.trim()] = row[k]));

        // 1. استخراج السعر أولاً بأكثر الطرق دقة
        let price = parseExcelNumber(findValByParts(r, ["السعر", "بيع", "جمله", "جملة", "Price", "Wholesale", "100", "101", "102", "103", "104", "105"]));
        
        // إذا لم نجد السعر بالكلمات المفتاحية، نبحث عن أول رقم صالح في أي عمود (مع استثناء الأكواد الطويلة)
        if (isNaN(price) || price <= 0) {
            const values = Object.values(r).map(v => String(v || "").trim());
            for (const val of values) {
                const num = parseExcelNumber(val);
                if (num > 0 && num < 100000) { // سعر منطقي (ليس كود طويل)
                    price = num;
                    break;
                }
            }
        }
        if (isNaN(price) || price <= 0) return null; // إذا لم نجد سعراً صالحاً حتى بعد البحث المرن، نتجاهل السطر

        // 2. استخراج الكود والقسم من الأعمدة المحددة
        const sku = String(findValByParts(r, ["كود الصنف", "الكود", "كود", "SKU", "الرمز", "ID", "code"]) || "").trim();
        const cat = String(findValByParts(r, ["المجموعه", "اسم المجموعه", "القسم", "Category", "المجموعة", "التصنيف"])).trim();

        // 3. بناء الاسم الوصفي الكامل (fullName)
        let descriptiveParts = [];
        const nameFromColumn = String(findValByParts(r, ["الصنف", "صنف", "اسم", "البيان", "المنتج", "Item"]) || "").trim();
        
        if (nameFromColumn) {
            descriptiveParts.push(nameFromColumn);
        } else {
            // إذا لم يكن هناك عمود اسم صريح، نجمع كل القيم غير السعرية وغير الكودية وغير القسمية
            const priceKeywords = ["سعر", "price", "جمله", "wholesale", "100", "101", "102", "103", "104", "105"];
            const skuKeywords = ["كود", "sku", "id", "باركود"];
            const categoryKeywords = ["مجموعه", "قسم", "category", "تصنيف"];

            for (const key of Object.keys(r)) {
                const normalizedKey = normalizeArabic(key);
                const val = String(r[key] || "").trim();
                if (!val) continue;

                // إذا لم يكن العمود يمثل سعرًا أو كودًا أو قسمًا، نضيف قيمته إلى الأجزاء الوصفية
                if (!priceKeywords.some(kw => normalizedKey.includes(kw)) &&
                    !skuKeywords.some(kw => normalizedKey.includes(kw)) &&
                    !categoryKeywords.some(kw => normalizedKey.includes(kw))) {
                    descriptiveParts.push(val);
                }
            }
        }
        const finalIdentifier = descriptiveParts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

        // تحسين: إذا لم ينجح بناء الاسم، نأخذ أول قيمة نصية كاسم (لضمان استخراج كل الـ 1100 صنف)
        const fallbackName = !finalIdentifier ? Object.values(r).find(v => v && isNaN(parseExcelNumber(v)) && String(v).length > 2) : null;
        const resultIdentifier = finalIdentifier || fallbackName || sku;

        // إذا لم يكن هناك اسم وصفي، نستخدم الكود كمعرف نهائي (إذا كان موجوداً)
        if (!resultIdentifier) return null;

        return `${resultIdentifier}|${price}${cat ? "|" + cat : ""}`;
      })
      .filter(Boolean);

    document.getElementById("bulk-price-data").value = textLines.join("\n");
    window.showToast(`تم استخراج ${textLines.length} صنف بنجاح`, "success");
  } catch (e) {
    window.showToast("خطأ في قراءة ملف الإكسل، تأكد من الصيغة", "error");
  }
}

// حفظ تحديثات الأسعار في قاعدة البيانات
export async function saveBulkPriceUpdates() {
  const catId = document.getElementById("bulk-price-cat").value;
  const percentage = parseFloat(
    document.getElementById("bulk-price-percentage").value || 0,
  );
  const rawData = document.getElementById("bulk-price-data").value.trim();

  const products = window.products || [];
  let targetCategoryName = "";
  if (catId && catId !== "none") {
    const cat = window.categories.find((c) => c.id === catId);
    if (cat) targetCategoryName = normalizeArabic(cat.name);
  }

  let batch = window.firestoreUtils.writeBatch(window.db);
  let opCount = 0;
  const productsRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products",
  );
  let updateCount = 0;
  let notFoundCount = 0;

  // 🧠 بناء فهرس ذكي (Map) لكافة المنتجات لضمان السرعة القصوى (O(1)) مع الـ 2000 صنف
  // هذا يمنع تعليق المتصفح ويضمن مطابقة كل سطر بدقة
  const productMap = new Map();
  products.forEach(p => {
    const nameKey = normalizeArabic(p.name);
    const skuKey = normalizeArabic(p.sku);
    if (nameKey) productMap.set(nameKey, p);
    if (skuKey) productMap.set(skuKey, p);
    // إضافة الكود بدون أصفار بادئة لزيادة قوة المطابقة
    if (skuKey) productMap.set(skuKey.replace(/^0+/, ''), p);
  });

  // تحذير فقط بدون إيقاف - نسمح بالتحديث حتى لو البيانات لم تكتمل
  if (products.length === 0) {
    return window.showToast("لا توجد منتجات محملة، يرجى الانتظار ثم المحاولة مجدداً", "warning");
  }
  if (products.length < 100) {
    window.showToast(`⚠️ تحذير: تم تحميل ${products.length} منتج فقط، قد لا تطابق كل الأسعار`, "warning");
  }

  // الحالة الأولى: تحديث عبر النص الملصق أو الملف المرفوع
  if (rawData) {
    const lines = rawData.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // تقسيم السطر مع دعم التبويبات، الفواصل، أو الخطوط الرأسية المستخدمة في الإكسل
      let parts = trimmedLine.split(/[|\t,]/).map(s => s.trim()).filter(Boolean);
      
      if (parts.length < 2) continue;

      // تعريف المتغيرات بوضوح في بداية الحلقة لمنع خطأ ReferenceError وضمان استمرار العملية
      let identifier = "";
      let priceVal = NaN;
      let newName = null;
      let newSku = null;

      // استخراج السعر بذكاء: نبحث عن آخر رقم في السطر (غالباً هو السعر) 
      for (let j = parts.length - 1; j >= 1; j--) {
          const val = parseExcelNumber(parts[j]);
          if (!isNaN(val) && val > 0 && val < 100000) { 
              priceVal = val;
              identifier = parts.slice(0, j).join(" "); 
              break;
          }
      }

      if (isNaN(priceVal)) {
          identifier = parts[0];
          priceVal = parseExcelNumber(parts[1]);
      }

      if (isNaN(priceVal) || priceVal <= 0) continue; 

      const normalizedIdentifier = normalizeArabic(identifier);
      const cleanIdentifier = normalizedIdentifier.replace(/^0+/, '');

      // ⚡ مطابقة فورية باستخدام الفهرس الذكي (Map) - تدعم الأسماء الطويلة مثل (جبنه دومتي رومي 500 ج*27)
      let p = productMap.get(normalizedIdentifier) || productMap.get(cleanIdentifier);

      // 🧠 خيار احتياطي مرن: لضمان عدم تخطي أي صنف بسبب مسافة أو اختلاف بسيط في الكتابة
      if (!p) {
          p = products.find(x => {
              const dbSku = normalizeArabic(x.sku || "").trim();
              const dbName = normalizeArabic(x.name || "").trim();
              return (
                  (dbSku && (dbSku === normalizedIdentifier || dbSku.replace(/^0+/, '') === cleanIdentifier)) ||
                  (dbName && (normalizedIdentifier.includes(dbName) || dbName.includes(normalizedIdentifier)))
              );
          });
      }

      if (p) {
        const pCat = normalizeArabic(p.category || "");
        
        // تحسين الفلترة: إذا تم اختيار قسم معين، نحدثه فقط. إذا لم يتم الاختيار، نحدث كل ما طابق في الشيت
        if (catId && catId !== "" && catId !== "none") {
           if (pCat !== targetCategoryName) continue;
        }
        
        if (catId === "none" && pCat !== "" && pCat !== "عام") continue;

        const finalPrice =
          percentage !== 0 ? priceVal * (1 + percentage / 100) : priceVal;
        const updatedPrice = Number(finalPrice.toFixed(2));

        const docRef = window.firestoreUtils.doc(productsRef, p.id);
        // استخدام dot notation لضمان تحديث الحقول دون مسح البيانات الأخرى
        const updatePayload = {};
        updatePayload.price = updatedPrice;
        updatePayload["prices.bag"] = updatedPrice;
        updatePayload["availableUnits.bag"] = true;
        updatePayload["updatedAt"] = window.firestoreUtils.serverTimestamp();

        batch.update(docRef, updatePayload);
        updateCount++;
        opCount++;

        if (opCount >= 450) {
          await batch.commit();
          batch = window.firestoreUtils.writeBatch(window.db);
          opCount = 0;
        }
      } else {
        notFoundCount++;
      }
    }
  } 
  // تحديث شامل بنسبة مئوية في حال لم يتم لصق نص (تحديث كامل لقاعدة البيانات المفلترة)
  else if (percentage !== 0) {
    for (const p of products) {
      const pCat = normalizeArabic(p.category || "");
      
      if (catId === "none" && pCat !== "" && pCat !== "عام") continue;
      if (targetCategoryName && pCat !== targetCategoryName) continue;

      const oldPrice = parseFloat(p.price || 0);
      const newPrice = Number((oldPrice * (1 + percentage / 100)).toFixed(2));

      // التحديث حتى لو كان السعر متطابقاً لضمان استجابة النظام لطلبك
      if (!isNaN(newPrice)) {
        batch.update(window.firestoreUtils.doc(productsRef, p.id), {
          price: newPrice,
          "prices.bag": newPrice,
        });
        updateCount++;
        opCount++;

        if (opCount >= 450) {
          await batch.commit();
          batch = window.firestoreUtils.writeBatch(window.db);
          opCount = 0;
        }
      }
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  if (updateCount > 0) {
    const statusType = notFoundCount > 0 ? "warning" : "success";
    const message =
      notFoundCount > 0
        ? `✅ تم تحديث ${updateCount} سعر. (تنبيه: ${notFoundCount} صنف غير موجود في قاعدة البيانات)`
        : `✅ تم تحديث ${updateCount} سعر بنجاح من أصل ${products.length} منتج`;
    window.showToast(message, statusType, 6000);
    closeBulkPriceUpdateModal();
  } else {
    window.showToast("لم يتم العثور على منتجات مطابقة لتحديثها. تأكد من تطابق الأسماء أو الأكواد", "warning", 6000);
  }
}

// 3. تصدير تقرير النواقص إلى ملف إكسل
window.exportShortageReport = function () {
  const products = window.products || [];
  const shortage = products
    .filter((p) => (p.quantity || 0) <= (p.minThreshold || 5))
    .map((p) => ({
      الاسم: p.name,
      "الكود (SKU)": p.sku || "",
      "الكمية الحالية": p.quantity || 0,
      "حد الطلب": p.minThreshold || 5,
      الحالة: (p.quantity || 0) <= 0 ? "نفذت" : "حرجة",
    }));

  if (shortage.length === 0) {
    return window.showToast("لا توجد نواقص لتصديرها حالياً", "info");
  }

  const ws = XLSX.utils.json_to_sheet(shortage);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Shortage Report");

  const date = new Date().toLocaleDateString("ar-EG").replace(/\//g, "-");
  XLSX.writeFile(wb, `نواقص_أولاد_الشيخ_${date}.xlsx`);
};

window.updateProductQty = async (id) => {
  const newQty = Number(document.getElementById(`inline-qty-${id}`).value);
  await window.firestoreUtils.updateDoc(
    window.firestoreUtils.doc(
      window.db,
      "artifacts",
      window.appId,
      "public",
      "data",
      "products",
      id,
    ),
    { quantity: newQty },
  );

  // تحديث البيانات محلياً لضمان مزامنة الواجهة فوراً
  const pIndex = window.products.findIndex((p) => p.id === id);
  if (pIndex !== -1) window.products[pIndex].quantity = newQty;

  window.showNotification("تم تحديث الكمية");
};
