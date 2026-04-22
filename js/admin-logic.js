/**
 * admin-logic.js: محرك التحديث الشامل المطور (SHADOW-ENGINE PRO)
 */

// دالة لتنظيف النصوص العربية للمطابقة الدقيقة (تجاهل الهمزات والتاء المربوطة والمسافات)
function normalizeArabic(text) {
  if (!text) return "";
  return String(text)
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/[ًٌٍَُِّْ]/g, "") // إزالة التشكيل
    .trim();
}

// دالة تنظيف متقدمة للمطابقة (تحذف المسافات والرموز والنجوم والشرطات)
function superClean(text) {
  if (!text) return "";
  return text.toString()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/[^\u0621-\u064A0-9a-zA-Z]/g, '') 
    .trim();
}

// دالة ذكية للبحث عن قيمة داخل الكائن (Row) بناءً على جزء من اسم العمود
function findValByParts(obj, parts) {
  const keys = Object.keys(obj);

  // المرحلة 1: البحث عن تطابق تام (بعد التنظيف) لضمان دقة الاختيار 
  for (const part of parts) {
    const cleanPart = superClean(normalizeArabic(part));
    // نبحث عن تطابق تام لاسم العمود، مع التأكد أن القيمة ليست فارغة
    const foundKey = keys.find(
      (k) =>
        superClean(normalizeArabic(k)) === cleanPart &&
        obj[k] !== undefined &&
        String(obj[k]).trim() !== "",
    );
    if (foundKey) return obj[foundKey];
  }

  // المرحلة 2: البحث عن تطابق جزئي إذا لم نجد تطابقاً تاماً
  for (const part of parts) {
    const cleanPart = superClean(normalizeArabic(part));
    // نبحث عن تطابق جزئي لاسم العمود، مع التأكد أن القيمة ليست فارغة
    const foundKey = keys.find(
      (k) =>
        superClean(normalizeArabic(k)).includes(cleanPart) &&
        obj[k] !== undefined &&
        String(obj[k]).trim() !== "",
    );

    if (
      foundKey &&
      obj[foundKey] !== undefined &&
      String(obj[foundKey]).trim() !== ""
    ) {
      return obj[foundKey];
    }
  }

  // المرحلة 2.5: إذا كنا نبحث عن سعر، ولم نجد مسمى، نبحث عن أول عمود يحتوي على رقم صالح
  if (parts.includes("سعر") || parts.includes("السعر") || parts.includes("Price")) {
    // استبعاد الأعمدة التي من المستحيل أن تكون هي السعر (مثل الكمية، الكود، التليفون)
    const skipList = [
        "مخزون", "كميه", "qty", "quantity", "كود", "sku", "id", "الرمز", "تلفون", "وحدة"
    ];

    for (const k of keys.filter(
      (key) =>
        !normalizeArabic(key).includes("اجمال") &&
        !skipList.some((s) => normalizeArabic(key).includes(s)),
    )) {
      const val = obj[k];
      if (typeof val === "number" && val > 0) return val;
      const parsed = parseFloat(String(val || "").replace(/[^\d.-]/g, ""));
      if (!isNaN(parsed) && parsed > 0) return val;
    }
  }
  return "";
}

// دالة لمعالجة الأرقام التي تحتوي على فواصل (مثل 2,025.00) لضمان قراءتها بشكل صحيح
function parseExcelNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;

  // تحويل الأرقام العربية والفارسية إلى إنجليزية لضمان القراءة البرمجية
  let str = String(val)
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

  // إزالة العملات والرموز والفواصل والمسافات والحروف
  let cleaned = str.replace(/[^\d.-]/g, "").trim();

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
      { id: "رابطة", label: "رابطة (Bundle)" },
    ];
    unitSelect.innerHTML = units
      .map((u) => `<option value="${u.val || u.id}">${u.label}</option>`)
      .join("");
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

  const pricing = window.getPricingValues
    ? window.getPricingValues()
    : { price: 0 };
  const categoryObj = window.categories.find((c) => c.id === categoryId);

  const data = {
    name,
    price: Number(pricing.price), 
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
      window.showToast(
        "ليس لديك صلاحية للقيام بهذا الإجراء (تأكد من تسجيل الدخول كمدير)",
        "error",
      );
    } else {
      window.showToast(
        "خطأ في الحفظ: " + (e.message || "حدث خطأ غير متوقع"),
        "error",
      );
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

export function renderAdminProducts(productsToRender = window.products) {
  const list = document.getElementById("admin-p-list");
  if (!list) return;

  const productsCount = window.products ? window.products.length : 0;
  const categoriesCount = window.categories ? window.categories.length : 0;

  // تحضير قائمة الأقسام الفرعية للنقل الجماعي مع ترتيبها أبجدياً
  const sortedSubCats = [...(window.categories || [])]
    .filter((c) => c.parentId)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));

  const catOptions = sortedSubCats
    .map((c) => {
      const parent = (window.categories || []).find((p) => p.id === c.parentId);
      return `<option value="${c.id}">${parent ? parent.name + " ← " : ""}${c.name}</option>`;
    })
    .join("");

  const bulkActions = `
    <div class="col-span-full flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-2 gap-3">
      <div class="flex items-center gap-2">
        <input type="checkbox" id="select-all-products" onclick="window.toggleSelectAllProducts(this.checked)" class="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
        <label for="select-all-products" class="text-xs font-bold text-slate-600 cursor-pointer">تحديد الكل</label>
      </div>
      <div id="bulk-tools" class="hidden flex items-center gap-2">
        <select id="bulk-move-cat-select" class="text-[10px] p-2 rounded-xl border border-slate-200 outline-none focus:border-emerald-500 max-w-[150px]">
          <option value="">نقل للقسم...</option>
          ${catOptions}
        </select>
        <button onclick="window.moveSelectedToCategory()" class="text-[10px] bg-emerald-600 text-white px-3 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all">نقل</button>
        <div class="w-px h-6 bg-slate-200 mx-1"></div>
        <button onclick="window.deleteSelectedProducts()" class="text-[10px] bg-red-50 text-red-600 px-3 py-2 rounded-xl font-bold border border-red-100 hover:bg-red-100 transition-all flex items-center gap-1">
          <i data-lucide="trash-2" class="w-3 h-3"></i> حذف المحدد
        </button>
      </div>
    </div>`;

  const addBtn = `<button onclick="openProductModal()" class="col-span-full border-2 border-dashed border-slate-200 p-4 rounded-2xl text-slate-400 font-bold text-sm hover:border-emerald-500 hover:text-emerald-500 transition-all mb-4 active:scale-95 w-full">+ إضافة منتج جديد</button>`;

  const products = productsToRender || [];

  // الترتيب الأبجدي للمنتجات في لوحة الإدارة
  const sortedProducts = [...products].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "ar"),
  );

  let html = sortedProducts
    .map(
      (p) => `
    <div class="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm hover:shadow-md transition-all group gap-4 overflow-hidden">
      <div class="flex items-center gap-3 w-full sm:w-auto min-w-0">
        <input type="checkbox" name="product-checkbox" value="${p.id}" onchange="window.updateBulkDeleteButton()" class="product-item-checkbox w-5 h-5 sm:w-4 sm:h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
        <div class="w-12 h-12 sm:w-10 sm:h-10 rounded-xl overflow-hidden border border-slate-100 shadow-inner shrink-0 leading-[0]">
          <img src="${p.img || "img/logo.png"}" class="w-full h-full object-cover">
        </div>
        <div class="min-w-0 flex-1 overflow-hidden">
          <p class="font-bold text-xs sm:text-sm text-slate-800 truncate break-words">${p.name}</p>
          <div class="flex flex-wrap items-center gap-1 mt-1">
            <span class="text-[9px] text-emerald-600 bg-emerald-50 px-1 rounded">${p.category}</span>
            <span class="text-[9px] text-slate-400 bg-slate-100 px-1 rounded font-mono">كود: ${p.sku || "—"}</span>
            <span class="text-[9px] text-amber-600 bg-amber-50 px-1 rounded font-bold">س: ${Number(p.price || (p.prices && p.prices.bag) || 0).toFixed(2)}</span>
            <span class="text-[9px] ${p.quantity <= 0 ? "text-red-500 bg-red-50" : "text-blue-500 bg-blue-50"} px-1 rounded font-bold">م: ${Number(p.quantity) || 0}</span>
          </div>
        </div>
      </div>
      <div class="flex gap-2 w-full sm:w-auto justify-end border-t border-slate-50 sm:border-t-0 pt-3 sm:pt-0 shrink-0">
        <button onclick="openProductModal(${JSON.stringify(p).replace(/"/g, "&quot;")})" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
        <button onclick="deleteProduct('${p.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    </div>
  `,
    )
    .join(""); // Moved this line up

  list.innerHTML = `
    <div class="col-span-full bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col xs:flex-row items-start xs:items-center justify-between mb-4 gap-3">
      <div class="flex items-center gap-3">
        <i data-lucide="package" class="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600"></i>
        <p class="font-black text-slate-800 text-sm">إجمالي المنتجات: <span id="admin-products-count" class="text-emerald-600">${productsCount}</span></p>
      </div>
      <div class="flex items-center gap-3">
        <i data-lucide="folder" class="w-5 h-5 sm:w-6 sm:h-6 text-blue-600"></i>
        <p class="font-black text-slate-800 text-sm">إجمالي الأقسام: <span id="admin-categories-count" class="text-blue-600">${categoriesCount}</span></p>
      </div>
    </div>
    ${bulkActions}
    ${addBtn}
    ${html}
  `;
  if (window.lucide) lucide.createIcons();
}
window.renderAdminProducts = renderAdminProducts;

/**
 * handleAdminSearch: محرك البحث الذكي والشامل للمدير
 * يتيح البحث المتقاطع في المنتجات (اسم، كود) والطلبات (رقم، عميل، هاتف، محتوى)
 */
window.handleAdminSearch = function(term) {
  const products = window.products || [];
  const orders = window.allAdminOrders || [];

  if (!term || term.trim() === "") {
    window.renderAdminProducts(products);
    if (orders.length > 0) window.renderOrdersList(orders, "admin-o-list", true);
    return;
  }

  const normTerm = normalizeArabic(term);
  const keywords = normTerm.split(/\s+/).filter(Boolean);

  // 1. فلترة المنتجات (بحث ذكي بالكلمات المفتاحية)
  const filteredProducts = products.filter(p => {
    const pName = normalizeArabic(p.name || "");
    const pSku = (p.sku || "").toLowerCase();
    const pCat = normalizeArabic(p.category || "");
    const combinedText = `${pName} ${pSku} ${pCat}`;
    return keywords.every(k => combinedText.includes(k));
  });
  window.renderAdminProducts(filteredProducts);

  // 2. فلترة الطلبات (بحث شامل برقم الطلب، العميل، الهاتف، أو الأصناف المشتراة)
  const filteredOrders = orders.filter(o => {
    const oNum = (o.orderNumber || "").toLowerCase();
    const oName = normalizeArabic(o.customerName || "");
    const oPhone = (o.customerPhone || "").toLowerCase();
    const oItems = (o.items || []).map(i => `${normalizeArabic(i.productName || i.name || "")} ${(i.sku || "").toLowerCase()}`).join(" ");
    
    const combinedOrderText = `${oNum} ${oName} ${oPhone} ${oItems}`;
    return keywords.every(k => combinedOrderText.includes(k));
  });

  if (typeof window.renderOrdersList === "function") {
    window.renderOrdersList(filteredOrders, "admin-o-list", true);
  }
  
  // التمرير لأعلى لعرض النتائج بوضوح
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

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

  // الترتيب الأبجدي للأقسام في لوحة الإدارة
  const sortedCategories = [...(window.categories || [])].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "ar"),
  );

  let html = sortedCategories
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

window.toggleSelectAllProducts = function (checked) {
  const checkboxes = document.querySelectorAll(
    'input[name="product-checkbox"]',
  );
  checkboxes.forEach((cb) => (cb.checked = checked));
  window.updateBulkDeleteButton();
};

window.updateBulkDeleteButton = function () {
  const selected = document.querySelectorAll(
    'input[name="product-checkbox"]:checked',
  ).length;
  const tools = document.getElementById("bulk-tools");
  if (tools) tools.classList.toggle("hidden", selected === 0);
};

window.moveSelectedToCategory = async function () {
  const selectedCheckboxes = document.querySelectorAll(
    'input[name="product-checkbox"]:checked',
  );
  const targetCatId = document.getElementById("bulk-move-cat-select").value;

  if (selectedCheckboxes.length === 0) return;
  if (!targetCatId)
    return window.showToast("يرجى اختيار القسم أولاً", "warning");

  const targetCat = window.categories.find((c) => c.id === targetCatId);
  if (!targetCat) return;

  if (
    !confirm(
      `هل أنت متأكد من نقل ${selectedCheckboxes.length} منتج إلى قسم "${targetCat.name}"؟`,
    )
  )
    return;

  window.showNotification("جاري نقل المنتجات...");
  const batch = window.firestoreUtils.writeBatch(window.db);
  const productsRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products",
  );

  selectedCheckboxes.forEach((cb) => {
    const docRef = window.firestoreUtils.doc(productsRef, cb.value);
    batch.update(docRef, {
      categoryId: targetCatId,
      category: targetCat.name,
      updatedAt: window.firestoreUtils.serverTimestamp(),
    });
  });

  try {
    await batch.commit();
    window.showToast(
      `تم نقل ${selectedCheckboxes.length} منتج بنجاح`,
      "success",
    );
    document.getElementById("select-all-products").checked = false;
    window.updateBulkDeleteButton();
  } catch (e) {
    window.showToast("فشل في نقل المنتجات", "error");
  }
};

window.deleteSelectedProducts = async function () {
  const selectedCheckboxes = document.querySelectorAll(
    'input[name="product-checkbox"]:checked',
  );
  if (selectedCheckboxes.length === 0) return;

  if (!confirm(`هل أنت متأكد من حذف ${selectedCheckboxes.length} منتج؟`))
    return;

  window.showNotification("جاري حذف المنتجات المحددة...");
  const batch = window.firestoreUtils.writeBatch(window.db);
  const productsRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products",
  );

  selectedCheckboxes.forEach((cb) => {
    const docRef = window.firestoreUtils.doc(productsRef, cb.value);
    batch.delete(docRef);
  });

  try {
    await batch.commit();
    window.showToast(
      `تم حذف ${selectedCheckboxes.length} منتج بنجاح`,
      "success",
    );
    document.getElementById("select-all-products").checked = false;
    window.updateBulkDeleteButton();
  } catch (e) {
    window.showToast("فشل في حذف بعض المنتجات", "error");
  }
};

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
                        <h3 class="font-black text-slate-800 text-lg">استيراد المنتجات وتحديث الأسعار والمخزون</h3>
                        <p class="text-xs text-slate-500 font-semibold">ارفع ملف إكسل يحتوي على (الكود، الصنف، السعر، مخزون، القسم)</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onclick="document.getElementById('bulk-file-input').click()" class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] hover:border-emerald-500 hover:bg-emerald-50 transition-all group">
                        <i data-lucide="upload-cloud" class="w-10 h-10 text-slate-300 group-hover:text-emerald-500 mb-2"></i>
                        <span class="text-sm font-black text-slate-700">رفع ملف المنتجات الجديد</span>
                        <span class="text-[10px] text-slate-400">لإضافة أصناف جديدة وتحديث المخزون والأسعار</span>
                    </button>
                    <button onclick="openBulkImportModal()" class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] hover:border-blue-500 hover:bg-blue-50 transition-all group">
                        <i data-lucide="filter" class="w-10 h-10 text-slate-300 group-hover:text-blue-500 mb-2"></i>
                        <span class="text-sm font-black text-slate-700">إضافة سريعة بكلمات مفتاحية</span>
                        <span class="text-[10px] text-slate-400">استخراج أصناف محددة من ملف كبير بناءً على كلمات دالة</span>
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
  // إعادة تعيين قيمة الحقل لضمان إمكانية رفع نفس الملف مجدداً
  event.target.value = "";

  window.showNotification("جاري قراءة الملف... قد تستغرق العملية بعض الوقت");
  let rows;
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch (e) {
    return window.showToast(
      "خطأ في قراءة الملف، تأكد من صيغة xlsx أو xls",
      "error",
    );
  }

  if (!rows || rows.length === 0)
    return window.showToast(
      "الملف فارغ أو لم يتم التعرف على البيانات!",
      "warning",
    );

  // حفظ البيانات في المتغير العالمي ليتمكن نظام "الإضافة السريعة" من الوصول إليها
  window.lastUploadedRows = rows;

  if (
    confirm(
      `تم العثور على ${rows.length} صنف في الملف. هل تريد رفع جميع المنتجات الآن؟\n(المنتجات الموجودة بنفس الاسم سيتم تحديث أسعارها فقط)`,
    )
  ) {
    await processBulkProducts(rows);
  } else {
    window.showToast(
      `تم حفظ بيانات ${rows.length} صنف - يمكنك استخدام "الإضافة السريعة" لإضافة أصناف مختارة`,
      "info",
      5000,
    );
  }
}
window.handleBulkFileUpload = handleBulkFileUpload;

// دالة مشتركة لرفع ملف الإضافة السريعة (من داخل المودال)
export async function handleBulkImportFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = "";
  window.showNotification("جاري قراءة الملف...");
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows || rows.length === 0)
      return window.showToast("الملف فارغ!", "warning");
    window.lastUploadedRows = rows;
    window.showToast(
      `✅ تم تحميل ${rows.length} صنف من الملف. أدخل الكلمات المفتاحية وانقر حفظ`,
      "success",
      5000,
    );
  } catch (e) {
    window.showToast("خطأ في قراءة الملف", "error");
  }
}
window.handleBulkImportFileUpload = handleBulkImportFileUpload;

export async function smartRowBasedUpdate(rows) {
  const productsRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "products");
  
  const BATCH_SIZE = 400; // تم الإرجاع لـ 400 كما طلبت لضمان الدقة العالية
  const DELAY_MS = 1000; // إبطاء طفيف لضمان ثبات العمليات الضخمة

  let batch = window.firestoreUtils.writeBatch(window.db);
  let opCount = 0, updated = 0, created = 0, skipped = 0, batchCount = 0;

  window.isBulkUploading = true;
  const progressId = 'bulk-upload-progress';
  window.showProgress(progressId, 'جاري معالجة ملف المنتجات وتحديثها', rows.length);


  // بناء الفهرس الذكي للبحث السريع
  const productMap = new Map();
  (window.products || []).forEach(p => {
    const nKey = superClean(normalizeArabic(p.name));
    const sKey = superClean(p.sku);
    if (nKey) productMap.set("n_" + nKey, p);
    if (sKey) {
      productMap.set("s_" + sKey, p);
      productMap.set("s_" + sKey.replace(/^0+/, ""), p); 
    }
  });

  const commitBatch = async () => {
    if (opCount === 0) return;
    try {
      await batch.commit();
      batchCount++;
      console.log(`[SHADOW-ENGINE] ⚡ دفعة ${batchCount} تمت بنجاح (${opCount} عملية)`);
    } catch (err) {
      console.error(`[SHADOW-ENGINE] ❌ خطأ في الدفعة:`, err);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
    batch = window.firestoreUtils.writeBatch(window.db);
    opCount = 0;
  };

  for (let i = 0; i < rows.length; i++) {
    // تحديث شريط التقدم كل 50 صف لضمان سلاسة الواجهة
    if (i % 50 === 0 || i === rows.length - 1) {
      window.updateProgress(progressId, i + 1, rows.length);
    }
    
    try {
      const row = rows[i];

      // الاستهداف المباشر لمسميات شيت أولاد الشيخ مع بدائل احتياطية
      const sku = String(row["باركود"] || row["الكود"] || findValByParts(row, ["باركود", "كود", "sku"]) || "").trim();
      const name = String(row["اسم الصنف"] || row["الصنف"] || findValByParts(row, ["اسم الصنف", "الصنف"]) || "").trim();
      const qty = parseExcelNumber(row["رصيد المخزن"] || row["المخزن"] || findValByParts(row, ["رصيد المخزن", "رصيد", "مخزون"]));
      const unit = String(row["الوحدة"] || row["الوحده"] || findValByParts(row, ["الوحدة", "الوحده"]) || "قطعة").trim();
      const price = parseExcelNumber(row["السعر"] || row["سعر"] || findValByParts(row, ["السعر", "سعر"]));
      const category = String(row["التصنيف"] || row["القسم"] || findValByParts(row, ["التصنيف", "القسم"]) || "عام").trim();

      // تخطي الصفوف الفارغة تماماً
      if (!name && !sku) { skipped++; continue; }

      const nKey = superClean(normalizeArabic(name));
      const sKey = superClean(sku);

      // محاولة مطابقة الصنف مع الموجود في قاعدة البيانات
      let existing = null;
      if (sKey) existing = productMap.get("s_" + sKey) || productMap.get("s_" + sKey.replace(/^0+/, ""));
      if (!existing && nKey) existing = productMap.get("n_" + nKey);

      if (existing) {
        const updates = {};
        let hasChanges = false;

        // مقارنة الاسم
        if (name && normalizeArabic(name) !== normalizeArabic(existing.name || '')) {
          updates.name = name;
          hasChanges = true;
        }

        // مقارنة الكود (SKU)
        if (sku && superClean(sku) !== superClean(existing.sku || '')) {
          updates.sku = sku;
          hasChanges = true;
        }

        // مقارنة السعر
        if (price > 0 && price !== Number(existing.price || 0)) {
          updates.price = price;
          updates["prices.bag"] = price; // تحديث سعر الكيس أيضاً
          hasChanges = true;
        }

        // مقارنة الكمية
        if (qty !== Number(existing.quantity || 0)) {
          updates.quantity = qty;
          updates.status = qty > 0 ? "available" : "out_of_stock";
          hasChanges = true;
        }

        // مقارنة الوحدة
        if (unit && normalizeArabic(unit) !== normalizeArabic(existing.unitMeasurement || '')) {
          updates.unitMeasurement = unit;
          hasChanges = true;
        }

        // مقارنة القسم
        if (category && normalizeArabic(category) !== normalizeArabic(existing.category || '')) {
          const matchingCategory = window.categories.find(c => normalizeArabic(c.name) === normalizeArabic(category));
          if (matchingCategory) {
            updates.category = matchingCategory.name;
            updates.categoryId = matchingCategory.id;
            hasChanges = true;
          } else {
            // إذا كان القسم غير موجود، نحدث الاسم فقط ونمسح الـ categoryId
            updates.category = category;
            updates.categoryId = ''; 
            hasChanges = true;
          }
        }

        if (hasChanges) {
          updates.updatedAt = window.firestoreUtils.serverTimestamp();
          const docRef = window.firestoreUtils.doc(productsRef, existing.id || existing.originalId);
          batch.update(docRef, updates);
          updated++;
          opCount++;
        } else {
          skipped++;
        }
      } else {
        // إضافة صنف جديد كلياً
        const newDocRef = window.firestoreUtils.doc(productsRef);
        batch.set(newDocRef, {
          name: name,
          sku: sku,
          price: price,
          quantity: qty,
          unitMeasurement: unit,
          category: category,
          prices: { bag: price },
          availableUnits: { bag: true },
          status: qty > 0 ? "available" : "out_of_stock",
          createdAt: window.firestoreUtils.serverTimestamp(),
          updatedAt: window.firestoreUtils.serverTimestamp()
        });
        created++;
        opCount++;
      }

      // الالتزام بحجم الدفعة (400) لضمان عدم توقف المتصفح
      if (opCount >= BATCH_SIZE || (i > 0 && i % BATCH_SIZE === 0)) {
        await commitBatch();
      }
    } catch (e) {
      console.error(`خطأ في الصف رقم ${i}:`, e);
    }
  }

  await commitBatch();
  window.isBulkUploading = false;
  window.updateProgress(progressId, rows.length, rows.length);
  window.hideProgress(progressId);

  const msg = `تم معالجة الشيت: ${updated} تحديث | ${created} جديد | ${skipped} لم يتغير`;
  if (window.showToast) window.showToast(msg, "success", 8000);

  setTimeout(() => {
    if (typeof window.refreshAllData === "function") window.refreshAllData();
    else if (typeof window.renderAdminProducts === "function") window.renderAdminProducts();
  }, 1500);
}

/* الأكواد السابقة تم وضعها في تعليق لضمان عمل المحرك الجديد فقط */
/*
export async function smartRowBasedUpdate_Legacy(rows) { ... }
*/

// /**
//  * SHADOW-SYNC ENGINE V3.0 - AWLAD EL-SHEIKH EDITION
//  * تم تطوير المنطق ليقرأ كافة تفاصيل الشيت بدقة متناهية
//  * مع الحفاظ على أسماء المتغيرات الأصلية (Variable Integrity)
//  */
// /**
//  * smartRowBasedUpdate: الدالة الذكية لمعالجة الأسطر وبناء اسم المنتج بالكامل
//  * تعمل على دفعات (batches) من 490 عملية كحد أقصى لتجنب حدود Firestore
//  */
// export async function smartRowBasedUpdate(rows) {
//   const productsRef = window.firestoreUtils.collection(
//     window.db,
//     "artifacts",
//     window.appId,
//     "public",
//     "data",
//     "products",
//   );

//   const BATCH_SIZE = 490; // حد Firestore الحقيقي 500، نستخدم 490 للأمان
//   const DELAY_MS = 800; // تأخير بين كل دفعة (ملي ثانية)

//   let batch = window.firestoreUtils.writeBatch(window.db);
//   let opCount = 0;
//   let updated = 0;
//   let created = 0;
//   let skipped = 0;
//   let batchCount = 0;

//   window.isBulkUploading = true;

//   // 1. تجميد نسخة من المنتجات الموجودة (snapshot) لمنع تداخل Firebase Listener
//   const existingProductsSnapshot = [...(window.products || [])];
//   console.log(
//     "[Bulk Upload] إجمالي المنتجات الحالية:",
//     existingProductsSnapshot.length,
//     "| صفوف الملف:",
//     rows.length,
//   );

//   // 2. بناء الفهرس الذكي للبحث O(1)
//   const productMap = new Map();
//   existingProductsSnapshot.forEach((p) => {
//     const key1 = normalizeArabic(p.name || "");
//     const key2 = normalizeArabic(p.sku || "");
//     if (key1) productMap.set(key1, p);
//     if (key2) productMap.set(key2, p);
//     if (key2) productMap.set(key2.replace(/^0+/, ""), p); // للتعامل مع الأكواد التي تبدأ بأصفار
//   });

//   // دالة مساعدة لإتمام الـ batch الحالي وبدء جديد
//   const commitBatch = async () => {
//     if (opCount === 0) return;
//     try {
//       await batch.commit();
//       batchCount++;
//       console.log(`[Bulk Upload] ✅ دفعة ${batchCount} تمت: ${opCount} عملية`);
//     } catch (err) {
//       console.error(`[Bulk Upload] ❌ خطأ في دفعة ${batchCount}:`, err);
//       window.showToast(`تحذير: خطأ في الحفظ (${err.message})`, "warning");
//     }
//     await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
//     batch = window.firestoreUtils.writeBatch(window.db);
//     opCount = 0;
//   };

//   for (let i = 0; i < rows.length; i++) {
//     const row = rows[i];
    
//     // عرض تقدم العملية كل 200 صف
//     if (i % 200 === 0 && i > 0) {
//       window.showNotification(`جاري المعالجة...  ${i} / ${rows.length} صنف`);
//     }
    
//     try {
//       const r = {};
//       Object.keys(row).forEach((k) => (r[k.trim()] = row[k]));
//       const values = Object.values(r).map((v) => String(v || "").trim());

//       // استخراج الكود باستخدام الدالة الذكية
//       const sku = String(
//         findValByParts(r, [
//           "كود", "باركود", "رقم الصنف", "code", "barcode", "sku", "الرمز"
//         ]) || ""
//       ).trim();

//       // استخراج الاسم باستخدام الدالة الذكية
//       const nameRaw = String(
//         findValByParts(r, [
//           "اسم", "صنف", "المنتج", "البيان", "name", "item", "وصف", "title"
//         ]) || ""
//       ).trim();

//       // إذا لم نجد عموداً واضحاً للاسم، نبحث عن أول نص طويل غير رقمي
//       const name = nameRaw || values.find(v => isNaN(parseExcelNumber(v)) && v.length > 2) || "";

//       if (!name && !sku) {
//         skipped++;
//         continue;
//       }

//       // استخراج باقي البيانات
//       const price = parseExcelNumber(findValByParts(r, ["سعر", "السعر", "price", "بيع", "مستهلك"]));
//       const quantity = parseExcelNumber(findValByParts(r, ["مخزون", "كميه", "qty", "quantity", "رصيد", "الكمية"]));
//       const unitRaw = String(findValByParts(r, ["وحدة", "الوحدة", "unit", "تعبئة"]) || "").trim();
//       const categoryRaw = String(findValByParts(r, ["قسم", "تصنيف", "مجموعة", "category", "عائلة"]) || "").trim();

//       const normName = normalizeArabic(name);
//       const normSku = normalizeArabic(sku);

//       // البحث عن المنتج للتحقق مما إذا كان موجوداً مسبقاً (للتحديث) أم جديداً (للإضافة)
//       let existingProduct = null;
//       if (normSku && productMap.has(normSku)) {
//         existingProduct = productMap.get(normSku);
//       } else if (normSku && productMap.has(normSku.replace(/^0+/, ""))) {
//         existingProduct = productMap.get(normSku.replace(/^0+/, ""));
//       } else if (normName && productMap.has(normName)) {
//         existingProduct = productMap.get(normName);
//       }

//       if (existingProduct) {
//         // تحديث المنتج الحالي
//         const docRef = window.firestoreUtils.doc(productsRef, existingProduct.id);
//         const updates = { updatedAt: window.firestoreUtils.serverTimestamp() };

//         if (price > 0 && existingProduct.price !== price) updates.price = price;
//         if (quantity !== undefined && quantity !== "") updates.quantity = quantity; // تحديث المخزون
//         if (unitRaw && existingProduct.unitMeasurement !== unitRaw) updates.unitMeasurement = unitRaw;
//         if (sku && !existingProduct.sku) updates.sku = sku;

//         // تنفيذ التحديث فقط إذا كان هناك تغييرات فعلية
//         if (Object.keys(updates).length > 1) {
//           batch.update(docRef, updates);
//           opCount++;
//           updated++;
//         } else {
//           skipped++;
//         }

//       } else {
//         // إنشاء منتج جديد
//         if (!name || price <= 0) {
//           skipped++;
//           continue; // تخطي المنتجات التي ليس لها اسم أو سعر صالح
//         }

//         const docRef = window.firestoreUtils.doc(productsRef); // إنشاء ID جديد تلقائي
//         const newProduct = {
//           id: docRef.id,
//           name: name,
//           sku: sku || "",
//           price: price,
//           quantity: quantity > 0 ? quantity : 0,
//           unitMeasurement: unitRaw || "قطعة",
//           category: categoryRaw || "عام",
//           createdAt: window.firestoreUtils.serverTimestamp(),
//           updatedAt: window.firestoreUtils.serverTimestamp(),
//         };

//         batch.set(docRef, newProduct);
//         opCount++;
//         created++;
        
//         // إضافته للماب فوراً لتجنب التكرار إذا كان متواجداً مرتين في نفس الملف
//         if (normName) productMap.set(normName, newProduct);
//         if (normSku) productMap.set(normSku, newProduct);
//       }

//       // إذا وصلنا للحد الأقصى للـ Batch، نرسل الدفعة ونبدأ واحدة جديدة
//       if (opCount >= BATCH_SIZE) {
//         await commitBatch();
//       }

//     } catch (rowErr) {
//       console.error(`خطأ في معالجة الصف رقم ${i}:`, rowErr);
//       skipped++;
//     }
//   }

//   // إرسال آخر دفعة متبقية
//   await commitBatch();

//   window.isBulkUploading = false;
  
//   // إخفاء الـ Notification القديمة وإظهار ملخص العملية
//   const notificationBox = document.getElementById("toast-container");
//   if (notificationBox) notificationBox.innerHTML = ""; 

//   window.showToast(
//     `✅ انتهت العملية بنجاح! تم إضافة ${created}، تحديث ${updated}، وتخطي ${skipped} منتج.`,
//     "success",
//     7000
//   );

//   // تحديث واجهة الإدارة لتشمل البيانات الجديدة
//   if (typeof window.updateAdminStats === "function") window.updateAdminStats();
// }

// // دالة مساعدة لتغليف رفع الإكسل واستدعاء smartRowBasedUpdate
// export async function processBulkProducts(rows) {
//   try {
//     await smartRowBasedUpdate(rows);
//   } catch (error) {
//     console.error("Error processing bulk products:", error);
//     window.isBulkUploading = false;
//     window.showToast("حدث خطأ جسيم أثناء رفع المنتجات.", "error");
//   }
// }
// window.processBulkProducts = processBulkProducts;

// الدوال المساعدة (تأكد أنها موجودة في ملفك كما هي)

  // إعادة إنعاش البيانات في الموقع
  setTimeout(() => {
    if (window.refreshAllData) window.refreshAllData();
  }, 1500);


// دالة تحديث الأسعار المختصرة - الآن تستخدم نفس المحرك القوي
export async function updatePricesOnly(rows) {
  await smartRowBasedUpdate(rows);
}

window.smartRowBasedUpdate = smartRowBasedUpdate;
window.updatePricesOnly = updatePricesOnly;
window.processBulkProducts = smartRowBasedUpdate;


window.updatePricesOnly = updatePricesOnly;

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
    }
}
window.closeBulkImportModal = closeBulkImportModal;

export function renderInventoryAudit() {
  const list = document.getElementById("admin-i-list");
  if (!list) return;
  let html = `
    <div class="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
      <div class="p-5 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center gap-4">
        <h4 class="font-black text-slate-800 text-sm truncate">تقرير حالة المخزن</h4>
        <button onclick="exportShortageReport()" class="text-[10px] bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold shadow-sm whitespace-nowrap">تصدير النواقص</button>
      </div>
      <div class="overflow-x-auto no-scrollbar">
        <table class="w-full text-right text-xs">
          <thead>
            <tr class="bg-slate-50/30 text-slate-500 border-b border-slate-50">
              <th class="p-4 font-black">المنتج</th>
              <th class="p-4 font-black text-center">المخزون</th>
              <th class="p-4 font-black text-left">تعديل</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">`;
  window.products.sort((a,b) => (a.quantity||0) - (b.quantity||0)).forEach(p => {
    const qty = Number(p.quantity||0);
    html += `
      <tr class="hover:bg-slate-50/30 transition-colors">
        <td class="p-4 max-w-[150px]">
          <p class="font-bold text-slate-800 truncate">${p.name}</p>
          <p class="text-[10px] text-slate-400 font-mono">SKU: ${p.sku||'-'}</p>
        </td>
        <td class="p-4 text-center font-black text-slate-700">${qty}</td>
        <td class="p-4">
          <div class="flex items-center justify-end gap-2">
            <input type="number" id="inline-qty-${p.id}" value="${qty}" class="w-14 p-2 border border-slate-200 rounded-lg text-center font-bold text-xs focus:border-emerald-500 outline-none">
            <button onclick="updateProductQty('${p.id}')" class="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
              <i data-lucide="check" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>`;
  });
  list.innerHTML = html + `</tbody></table></div></div>`;
  lucide.createIcons();
}

export function updateCategorySelects() {
  const selects = ["p-cat", "bulk-import-cat"];
  selects.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      let cats = (window.categories || []); // عرض جميع الأقسام (رئيسية وفرعية)
      // ترتيب الأقسام أبجدياً لسهولة البحث
      cats.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      el.innerHTML = `<option value="">-- القسم --</option>` + cats.map(c => {
        const parent = (window.categories || []).find(p => p.id === c.parentId);
        const displayName = parent ? `${parent.name} ← ${c.name}` : c.name;
        return `<option value="${c.id}">${displayName}</option>`;
      }).join("");
    }
  });
}

export async function saveBulkProducts() {
  const keywordsInput = document.getElementById("bulk-keywords");
  const keywords = keywordsInput && keywordsInput.value
    ? keywordsInput.value.split(",").map((k) => normalizeArabic(k.trim())).filter(Boolean)
    : [];

  let rows = window.lastUploadedRows || [];
  const sheetDataArea = document.getElementById("bulk-sheet-data");
  const sheetDataText = sheetDataArea ? sheetDataArea.value.trim() : "";

  if (rows.length === 0 && sheetDataText) {
    rows = sheetDataText.split("\n").map((line) => {
      const parts = line.split(/[\t,]/);
      return {
        "الاسم": (parts[0] || "").trim(),
        "سعر": (parts[1] || "").trim(),
        "كود": (parts[2] || "").trim(),
        "مخزون": (parts[3] || "").trim(),
      };
    }).filter(r => r["الاسم"]);
  }

  if (rows.length === 0) return window.showToast("يرجى إدخال بيانات أو رفع ملف أولاً", "warning");

  let filteredRows = rows.filter((row) => {
    if (keywords.length === 0) return true; 
    const name = findValByParts(row, ["اسم الصنف", "الصنف", "الاسم", "البيان", "المنتج", "Product"]);
    const normName = normalizeArabic(name);
    return keywords.some((k) => normName.includes(k));
  });

  if (filteredRows.length === 0) return window.showToast("لا توجد أصناف مطابقة للكلمات المفتاحية المختارة", "info");

  const targetCatId = document.getElementById("bulk-import-cat")?.value || "";
  const targetCatObj = (window.categories || []).find((c) => c.id === targetCatId);
  const unit = document.getElementById("bulk-unit")?.value || "قطعة";
  const quantities = document.getElementById("bulk-quantities")?.value || "";

  const countText = keywords.length > 0 ? "مطابق للكلمات المفتاحية" : "إجمالي الملف";

  if (confirm(`تم العثور على ${filteredRows.length} صنف (${countText}).\nهل تريد إضافتهم/تحديثهم الآن؟`)) {
    window.showNotification(`جاري معالجة ${filteredRows.length} صنف...`);

    const rowsToProcess = filteredRows.map((r) => {
      const rowCleaned = {};
      Object.keys(r).forEach((k) => (rowCleaned[k.trim()] = r[k]));

      return {
        ...rowCleaned,
        category: targetCatObj ? targetCatObj.name : (rowCleaned["category"] || "عام"),
        categoryId: targetCatId || rowCleaned["categoryId"] || "",
        unitMeasurement: unit,
        availableQuantities: quantities,
        minStock: 5,
      };
    });

    try {
      await window.smartRowBasedUpdate(rowsToProcess);
      if (typeof closeBulkImportModal === "function") closeBulkImportModal();
      if (document.getElementById("bulk-keywords")) document.getElementById("bulk-keywords").value = "";
      if (document.getElementById("bulk-sheet-data")) document.getElementById("bulk-sheet-data").value = "";
    } catch (e) {
      console.error(e);
      window.showToast("حدث خطأ أثناء الحفظ: " + (e.message || ""), "error");
    }
  }
}
window.saveBulkProducts = saveBulkProducts;

// 3. تصدير تقرير النواقص إلى ملف إكسل
window.exportShortageReport = function () {
  const products = window.products || [];
  const shortage = products
    .filter((p) => Number(p.quantity || 0) <= Number(p.minThreshold || 5))
    .map((p) => {
      const row = {
        "اسم الصنف": p.name,
        "كود الصنف (SKU)": p.sku || "بدون كود",
        "القسم": p.category || "عام",
        "المخزون الحالي": Number(p.quantity || 0),
        "حد الطلب المحدد": Number(p.minThreshold || 5),
        "الحالة": Number(p.quantity || 0) <= 0 ? "⚠️ خلصان" : "🟠 كمية حرجة",
      };

      // إضافة كافة الأسعار المتاحة لكل الوحدات لضمان شمولية التقرير للإدارة
      if (p.prices) {
        if (p.prices.bag) row["سعر الكيس"] = Number(p.prices.bag).toFixed(2);
        if (p.prices.piece) row["سعر القطعة"] = Number(p.prices.piece).toFixed(2);
        if (p.prices.box) row["سعر العلبة"] = Number(p.prices.box).toFixed(2);
        if (p.prices.carton) row["سعر الكرتونة"] = Number(p.prices.carton).toFixed(2);
        if (p.prices.shrink) row["سعر الشرنك"] = Number(p.prices.shrink).toFixed(2);
        if (p.prices.bundle) row["سعر الرابطة"] = Number(p.prices.bundle).toFixed(2);
        if (p.prices.bucket) row["سعر الجردل"] = Number(p.prices.bucket).toFixed(2);
        if (p.prices.tin) row["سعر الصفيحة"] = Number(p.prices.tin).toFixed(2);
      } else {
        row["السعر الأساسي"] = Number(p.price || 0).toFixed(2);
      }

      row["تاريخ التقرير"] = new Date().toLocaleDateString('ar-EG');
      return row;
    });

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
    { 
      quantity: newQty,
      status: newQty > 0 ? "available" : "out_of_stock"
    }
  );

  // تحديث البيانات محلياً لضمان مزامنة الواجهة فوراً
  const pIndex = window.products.findIndex((p) => p.id === id);
  if (pIndex !== -1) {
    window.products[pIndex].quantity = newQty;
    window.products[pIndex].status = newQty > 0 ? "available" : "out_of_stock";
  }

  window.showNotification("تم تحديث الكمية وتزامن الحالة بنجاح");
};
