/**
 * admin-logic.js: نظام إدارة المخزن والتحديث الشامل عبر إكسل (SHADOW-ENGINE OPTIMIZED)
 */

// دالة لتنظيف النصوص العربية للمطابقة الدقيقة (تجاهل الهمزات والتاء المربوطة والمسافات)
function normalizeArabic(text) {
  if (typeof window.normalizeArabic === "function")
    return window.normalizeArabic(text);
  return String(text || "")
    .trim()
    .toLowerCase();
}

// دالة تنظيف متقدمة للمطابقة (تحذف المسافات والرموز والنجوم والشرطات)
function superClean(text) {
  if (!text) return "";
  return text.toString()
    .replace(/[^\u0621-\u064A0-9a-zA-Z]/g, '') 
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

// دالة ذكية للبحث عن قيمة داخل الكائن (Row) بناءً على جزء من اسم العمود
function findValByParts(obj, parts) {
  const keys = Object.keys(obj);
  const norm =
    window.normalizeArabic ||
    ((t) =>
      String(t || "")
        .trim()
        .toLowerCase());

  // المرحلة 1: البحث عن تطابق تام (بعد التنظيف) لضمان دقة الاختيار 
  for (const part of parts) {
    const cleanPart = norm(part);
    // نبحث عن تطابق تام لاسم العمود، مع التأكد أن القيمة ليست فارغة
    const foundKey = keys.find(
      (k) =>
        norm(k) === cleanPart &&
        obj[k] !== undefined &&
        String(obj[k]).trim() !== "",
    );
    if (foundKey) return obj[foundKey];
  }

  // المرحلة 2: البحث عن تطابق جزئي إذا لم نجد تطابقاً تاماً
  for (const part of parts) {
    const cleanPart = norm(part);
    // نبحث عن تطابق جزئي لاسم العمود، مع التأكد أن القيمة ليست فارغة
    const foundKey = keys.find(
      (k) =>
        norm(k).includes(cleanPart) &&
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
      "مخزون",
      "كميه",
      "كميه",
      "qty",
      "quantity",
      "كود",
      "sku",
      "id",
      "الرمز",
      "index",
      "تلفون",
      "هاتف",
      "mobile",
      "وحدة",
      "الوحدات",
      "كود الوحدات",
      "barcode",
      "باركود",
      "الباركود",
    ];

    for (const k of keys.filter(
      (key) =>
        !norm(key).includes("اجمال") &&
        !skipList.some((s) => norm(key).includes(s)),
    )) {
      const val = obj[k];
      if (typeof val === "number" && val > 0) return val;
      const parsed = parseFloat(String(val || "").replace(/[^\d.-]/g, ""));
      if (!isNaN(parsed) && parsed > 0) return val;
    }
  }

  // المرحلة 3: التعامل مع الملفات التي تفتقد للعناوين (fallback)
  const emptyKeys = keys.filter((k) => k.includes("EMPTY")).reverse();
  if (parts.includes("كود") && emptyKeys.length > 0)
    return obj[emptyKeys[0]] || "";
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
      return `<option value="${c.id}">${parent ? parent.name + " » " : ""}${c.name}</option>`;
    })
    .join("");

  const bulkActions = `
    <div class="col-span-full flex flex-wrap items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-2 gap-3">
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

  const addBtn = `<button onclick="openProductModal()" class="col-span-full border-2 border-dashed border-slate-200 p-4 rounded-2xl text-slate-400 font-bold text-sm hover:border-emerald-500 hover:text-emerald-500 transition-all mb-4">+ إضافة منتج جديد</button>`;

  const products = productsToRender || [];

  // الترتيب الأبجدي للمنتجات في لوحة الإدارة
  const sortedProducts = [...products].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "ar"),
  );

  let html = sortedProducts
    .map(
      (p) => `
    <div class="bg-white p-3 rounded-2xl border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow group">
      <div class="flex items-center gap-3">
        <input type="checkbox" name="product-checkbox" value="${p.id}" onchange="window.updateBulkDeleteButton()" class="product-item-checkbox w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
        <div class="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 shadow-inner shrink-0 leading-[0]">
          <img src="${p.img || "img/logo.png"}" class="w-full h-full object-cover">
        </div>
        <div>
          <p class="font-bold text-xs text-slate-800">${p.name}</p>
          <div class="flex items-center gap-1 mt-0.5 whitespace-nowrap overflow-hidden">
            <span class="text-[9px] text-emerald-600 bg-emerald-50 px-1 rounded">${p.category}</span>
            <span class="text-[9px] text-slate-400 bg-slate-100 px-1 rounded font-mono">كود: ${p.sku || "—"}</span>
            <span class="text-[9px] text-amber-600 bg-amber-50 px-1 rounded font-bold">س: ${Number(p.price || (p.prices && p.prices.bag) || 0).toFixed(2)}</span>
            <span class="text-[9px] ${p.quantity <= 0 ? "text-red-500 bg-red-50" : "text-blue-500 bg-blue-50"} px-1 rounded font-bold">م: ${Number(p.quantity) || 0}</span>
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

// /**
//  * smartRowBasedUpdate: الدالة الذكية لمعالجة الأسطر وبناء اسم المنتج بالكامل
//  * تعمل على دفعات (batches) من 490 عملية كحد أقصى لتجنب حدود Firestore
//  */
// // export async function smartRowBasedUpdate(rows) {
// //   const productsRef = window.firestoreUtils.collection(
// //     window.db,
// //     "artifacts",
// //     window.appId,
// //     "public",
// //     "data",
// //     "products",
// //   );

// //   const BATCH_SIZE = 490; // حد Firestore الحقيقي 500، نستخدم 490 للأمان
// //   const DELAY_MS = 800; // تأخير بين كل دفعة (ملي ثانية)

// //   let batch = window.firestoreUtils.writeBatch(window.db);
// //   let opCount = 0;
// //   let updated = 0;
// //   let created = 0;
// //   let skipped = 0;
// //   let batchCount = 0;

// //   window.isBulkUploading = true;

// //   // 1. تجميد نسخة من المنتجات الموجودة (snapshot) لمنع تداخل Firebase Listener
// //   const existingProductsSnapshot = [...(window.products || [])];
// //   console.log(
// //     "[Bulk Upload] إجمالي المنتجات الحالية:",
// //     existingProductsSnapshot.length,
// //     "| صفوف الملف:",
// //     rows.length,
// //   );

// //   // 2. بناء الفهرس الذكي للبحث O(1)
// //   const productMap = new Map();
// //   existingProductsSnapshot.forEach((p) => {
// //     const key1 = normalizeArabic(p.name || "");
// //     const key2 = normalizeArabic(p.sku || "");
// //     if (key1) productMap.set(key1, p);
// //     if (key2) productMap.set(key2, p);
// //     if (key2) productMap.set(key2.replace(/^0+/, ""), p);
// //   });

// //   // دالة مساعدة لإتمام الـ batch الحالي وبدء جديد
// //   const commitBatch = async () => {
// //     if (opCount === 0) return;
// //     try {
// //       await batch.commit();
// //       batchCount++;
// //       console.log(`[Bulk Upload] ✅ دفعة ${batchCount} تمت: ${opCount} عملية`);
// //     } catch (err) {
// //       console.error(`[Bulk Upload] ❌ خطأ في دفعة ${batchCount}:`, err);
// //       window.showToast(`تحذير: خطأ في دفعة بيانات (${err.message})`, "warning");
// //     }
// //     await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
// //     batch = window.firestoreUtils.writeBatch(window.db);
// //     opCount = 0;
// //   };

// //   for (let i = 0; i < rows.length; i++) {
// //     const row = rows[i];
// //     // عرض تقدم العملية كل 200 صف
// //     if (i % 200 === 0 && i > 0) {
// //       window.showNotification(`جاري المعالجة...  ${i} / ${rows.length} صنف`);
// //     }
// //     try {
// //       const r = {};
// //       Object.keys(row).forEach((k) => (r[k.trim()] = row[k]));
// //       const values = Object.values(r).map((v) => String(v || "").trim());

// //       // إزالة ID و الرمز لتجنب الخلط مع أرقام الصفوف المسلسلة في الإكسل
// //       const sku = String(
// //         findValByParts(r, [
// //           "كود",
// //           "SKU",
// //           "code",
// //           "باركود",
// //           "Barcode",
// //           "الباركود",
// //         ]) || "",
// //       ).trim();
// //       let price = parseExcelNumber(
// //         findValByParts(r, [
// //           "السعر",
// //           "سعر",
// //           "الجملة",
// //           "جملة",
// //           "سعر البيع",
// //           "Price",
// //           "Rate",
// //         ]),
// //       );
// //       let qty =
// //         parseExcelNumber(
// //           findValByParts(r, [
// //             "الوحدات",
// //             "كمية",
// //             "الكمية",
// //             "الكميه",
// //             "كميه",
// //             "Stock",
// //             "Quantity",
// //             "Qty",
// //             "الرصيد",

// //           ]),
// //         ) || 0;

// //       let fullName = String(
// //         findValByParts(r, [
// //           "اسم الصنف",
// //           "خانه الصنف",
// //           "الصنف",
// //           "صنف",
// //           "الاسم",
// //           "اسم",
// //           "البيان",
// //           "المنتج",
// //           "Item",
// //           "Item Name",
// //           "Product",
// //           "Description",
// //         ]) || "",
// //       ).trim();
// //       if (!fullName || fullName.length < 2) {
// //         fullName =
// //           values.find((v) => v.length > 2 && isNaN(parseExcelNumber(v))) || "";
// //       }

// //       const rowCategory = String(
// //         r["Category"] ||
// //           findValByParts(r, ["التصنيف", "مخزون", "المخزون"]) ||
// //           "عام",
// //       );
// //       const rowCatId =
// //         r["categoryId"] || r["catId"]
// //           ? String(r["categoryId"] || r["catId"])
// //           : null;

// //       if (!fullName && !sku) {
// //         skipped++;
// //         continue;
// //       }

// //       // 3. المطابقة الذكية
// //       const normSku = normalizeArabic(sku);
// //       const cleanSku = normSku.replace(/^0+/, "");
// //       const normName = normalizeArabic(fullName);

// //       let product = null;

// //       // المطابقة بالكود (فقط إذا كان الكود حقيقياً وليس رقماً مسلسلاً صغيراً جداً)
// //       if (normSku && normSku.length > 1) {
// //         product = productMap.get(normSku) || productMap.get(cleanSku);
// //         if (!product && normSku.length > 3) {
// //           // زيادة الدقة للبحث اليدوي
// //           product = existingProductsSnapshot.find((p) => {
// //             const dbSku = normalizeArabic(p.sku || "").replace(/^0+/, "");
// //             return dbSku && dbSku.length > 1 && dbSku === cleanSku;
// //           });
// //         }
// //       }

// //       // ثانياً: البحث بالاسم إذا لم يوجد كود
// //       if (!product && normName) {
// //         product = productMap.get(normName);
// //       }

// //       let addedToBatch = false;

// //       if (product) {
// //         // تحديث المنتج الموجود
// //         const nName = fullName || product.name;
// //         const nSku = sku || product.sku || "";
// //         const nPrice = price > 0 ? price : product.price || 0;
// //         const nQty = qty !== 0 ? qty : product.quantity || 0;

// //         const hasChanges =
// //           product.name !== nName ||
// //           String(product.sku || "") !== String(nSku) ||
// //           Number(product.price) !== Number(nPrice) ||
// //           Number(product.quantity || 0) !== Number(nQty) ||
// //           !product.prices ||
// //           Number((product.prices || {}).bag) !== Number(nPrice) ||
// //           (rowCatId && product.categoryId !== rowCatId);

// //         if (hasChanges) {
// //           const docRef = window.firestoreUtils.doc(
// //             productsRef,
// //             product.id || product.originalId,
// //           );
// //           batch.update(docRef, {
// //             name: String(nName || ""),
// //             sku: String(nSku),
// //             price: Number(nPrice),
// //             quantity: Number(nQty),
// //             category: String(rowCategory || product.category || "عام"),
// //             categoryId: rowCatId || product.categoryId || null,
// //             "prices.bag": Number(nPrice),
// //             "availableUnits.bag": true,
// //             updatedAt: window.firestoreUtils.serverTimestamp(),
// //           });
// //           updated++;
// //           addedToBatch = true;
// //         } else {
// //           skipped++;
// //         }
// //       } else {
// //         // إضافة منتج جديد
// //         const newDoc = window.firestoreUtils.doc(productsRef);
// //         batch.set(newDoc, {
// //           name: String(fullName || ""),
// //           sku: String(sku || ""),
// //           price: Number(price || 0),
// //           quantity: Number(qty || 0),
// //           prices: { bag: Number(price || 0) },
// //           availableUnits: { bag: true },
// //           category: String(rowCategory || "عام"),
// //           categoryId: rowCatId || null,
// //           status: qty > 0 ? "available" : "out_of_stock",
// //           updatedAt: window.firestoreUtils.serverTimestamp(),
// //         });
// //         created++;
// //         addedToBatch = true;
// //       }

// //       if (addedToBatch) {
// //         opCount++;
// //         if (opCount >= BATCH_SIZE) {
// //           await commitBatch();
// //         }
// //       }
// //     } catch (e) {
// //       console.error("[Bulk Upload] خطأ في الصف", i, ":", e, row);
// //     }
// //   }
// // //**************************************************************** */
// //   // إتمام آخر دفعة إذا تبقى عمليات
// //   await commitBatch();

// //   window.isBulkUploading = false;

// //   const msg = ` إضافة: ${created} |  تحديث: ${updated} |  بدون تغيير: ${skipped} (إجمالي الصفوف: ${rows.length})`;
// //   window.showToast(msg, "success", 10000);
// //   console.log("[Bulk Upload] اكتملت العملية:", msg);

// //   // تأخير بسيط للتأكد من أن Firebase Snapshot قد قام بتحديث المصفوفة العالمية window.products قبل إعادة الرندرة
// //   setTimeout(() => {
// //     if (typeof window.renderAdminProducts === "function") window.renderAdminProducts();
// //   }, 2000); // زيادة التأخير لضمان تحديث الواجهة بعد عمليات التحديث الكبيرة
// // }

// // export async function smartRowBasedUpdate(rows) {
// //   const productsRef = window.firestoreUtils.collection(
// //     window.db,
// //     "artifacts",
// //     window.appId,
// //     "public",
// //     "data",
// //     "products",
// //   );

// //   const BATCH_SIZE = 450; // للحفاظ على استقرار Firestore
// //   const DELAY_MS = 1000;

// //   let batch = window.firestoreUtils.writeBatch(window.db);
// //   let opCount = 0;
// //   let updated = 0;
// //   let created = 0;
// //   let skipped = 0;
// //   let batchCount = 0;

// //   window.isBulkUploading = true;

// //   // 1. تجميد المصفوفة لتجنب تداخل التحديثات اللحظية
// //   const existingProductsSnapshot = JSON.parse(
// //     JSON.stringify(window.products || []),
// //   );

// //   // 2. بناء الفهرس الذكي لمنع التكرار
// //   const productMap = new Map();
// //   existingProductsSnapshot.forEach((p) => {
// //     const pId = p.id || p.originalId;
// //     if (!pId) return;

// //     const keyName = normalizeArabic(p.name || "");
// //     const keySku = normalizeArabic(p.sku || "");

// //     if (keyName) productMap.set("name_" + keyName, p);
// //     if (keySku) {
// //       productMap.set("sku_" + keySku, p);
// //       productMap.set("sku_" + keySku.replace(/^0+/, ""), p);
// //     }
// //   });

// //   const commitBatch = async () => {
// //     if (opCount === 0) return;
// //     try {
// //       await batch.commit();
// //       batchCount++;
// //       console.log(
// //         `[Bulk Upload] ✅ تم رفع الدفعة ${batchCount} بنجاح (${opCount} عملية)`,
// //       );
// //     } catch (err) {
// //       console.error(`[Bulk Upload] ❌ خطأ في الدفعة ${batchCount}:`, err);
// //       window.showToast(`تحذير: خطأ في رفع جزء من البيانات`, "warning");
// //     }
// //     await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
// //     batch = window.firestoreUtils.writeBatch(window.db);
// //     opCount = 0;
// //   };

// //   // دالة لتنظيف العناوين من المسافات المخفية في ملف الـ CSV
// //   const cleanRowKeys = (rawRow) => {
// //     const cleaned = {};
// //     for (let key in rawRow) {
// //       if (rawRow.hasOwnProperty(key)) {
// //         cleaned[key.trim()] = rawRow[key];
// //       }
// //     }
// //     return cleaned;
// //   };

// //   for (let i = 0; i < rows.length; i++) {
// //     if (i % 200 === 0 && i > 0) {
// //       window.showNotification(`جاري المعالجة...  ${i} / ${rows.length} صنف`);
// //     }

// //     try {
// //       // تنظيف الصف من المسافات
// //       const r = cleanRowKeys(rows[i]);

// //       // استخراج البيانات بناءً على العناوين الفعلية في شيت "تقيم مخزون"
// //       const sku = String(r["كود الصنف"] || r["كود"] || r["SKU"] || "").trim();
// //       const fullName = String(
// //         r["الصنف"] || r["اسم الصنف"] || r["الاسم"] || "",
// //       ).trim();
// //       const rowCategory = String(
// //         r["المجموعه"] || r["المجموعة"] || r["التصنيف"] || "عام",
// //       ).trim();

// //       const price = parseExcelNumber(r["السعر"] || r["سعر"] || r["Price"]) || 0;
// //       // نأخذ الكمية (الرصيد). وإذا كان عمود الكمية غير متوفر نبقيها كما هي أو 0
// //       const qty =
// //         parseExcelNumber(
// //           r["رصيد المخزن"] || r["الكمية"] || r["الكميه"] || r["Qty"],
// //         ) || 0;

// //       // تخطي الصفوف الفارغة تماماً
// //       if (!fullName && !sku) {
// //         skipped++;
// //         continue;
// //       }

// //       const normSku = normalizeArabic(sku);
// //       const normName = normalizeArabic(fullName);

// //       // البحث في الفهرس
// //       let product = null;
// //       if (normSku)
// //         product =
// //           productMap.get("sku_" + normSku) ||
// //           productMap.get("sku_" + normSku.replace(/^0+/, ""));
// //       if (!product && normName) product = productMap.get("name_" + normName);

// //       if (product) {
// //         // --- تحديث منتج موجود ---
// //         const docId = product.id || product.originalId;
// //         const docRef = window.firestoreUtils.doc(productsRef, docId);

// //         // التحقق من وجود تغييرات لتقليل الاستهلاك وتسريع العملية
// //         const hasChanges =
// //           product.name !== fullName ||
// //           Number(product.price) !== price ||
// //           Number(product.quantity) !== qty ||
// //           product.category !== rowCategory;

// //         if (hasChanges) {
// //           batch.update(docRef, {
// //             name: fullName || product.name,
// //             sku: sku || product.sku,
// //             price: price,
// //             quantity: qty,
// //             category: rowCategory,
// //             "prices.bag": price,
// //             status: qty > 0 ? "available" : "out_of_stock",
// //             updatedAt: window.firestoreUtils.serverTimestamp(),
// //           });
// //           updated++;

// //           // تحديث الفهرس اللحظي لمنع إعادة التحديث في نفس الجلسة
// //           product.price = price;
// //           product.quantity = qty;
// //           product.category = rowCategory;
// //           opCount++;
// //         } else {
// //           skipped++;
// //         }
// //       } else {
// //         // --- إضافة منتج جديد ---
// //         const newDocRef = window.firestoreUtils.doc(productsRef);
// //         const newProductData = {
// //           name: fullName,
// //           sku: sku,
// //           price: price,
// //           quantity: qty,
// //           category: rowCategory,
// //           prices: { bag: price },
// //           availableUnits: { bag: true },
// //           status: qty > 0 ? "available" : "out_of_stock",
// //           createdAt: window.firestoreUtils.serverTimestamp(),
// //           updatedAt: window.firestoreUtils.serverTimestamp(),
// //         };

// //         batch.set(newDocRef, newProductData);

// //         // **السر هنا:** إضافة المنتج الجديد للفهرس اللحظي فوراً حتى لو تكرر في الصف التالي يتم تحديثه ولا يضاف مرتين!
// //         const tempObj = { ...newProductData, id: newDocRef.id };
// //         if (normSku) productMap.set("sku_" + normSku, tempObj);
// //         if (normName) productMap.set("name_" + normName, tempObj);

// //         created++;
// //         opCount++;
// //       }

// //       // إرسال الدفعة إذا اكتمل العدد
// //       if (opCount >= BATCH_SIZE) {
// //         await commitBatch();
// //       }
// //     } catch (e) {
// //       console.error("[Bulk Upload] خطأ في معالجة الصف رقم", i, e);
// //     }
// //   }

// //   // رفع أي بيانات متبقية في الدفعة الأخيرة
// //   await commitBatch();
// //   window.isBulkUploading = false;

// //   const msg = `اكتملت العملية: إضافات جديدة (${created}) | تحديثات (${updated}) | متطابق تم تخطيه (${skipped})`;
// //   window.showToast(msg, "success", 8000);
// //   console.log("[Bulk Upload] النتيجة النهائية:", msg);

// //   // تأخير بسيط وإعادة تهيئة الداشبورد لضمان عرض البيانات المحدثة
// //   setTimeout(() => {
// //     if (typeof window.refreshAllData === "function") {
// //       window.refreshAllData(); // يفضل استدعاء دالة جلب البيانات من السيرفر
// //     } else if (typeof window.renderAdminProducts === "function") {
// //       window.renderAdminProducts();
// //     }
// //   }, 1500);
// // }
// // async function processBulkProducts(rows) {
// //   await smartRowBasedUpdate(rows);
// // }
// // window.smartRowBasedUpdate = smartRowBasedUpdate;

// // /**
// //  * دالة تحديث الأسعار فقط
// //  * مصممة للبحث عن السعر حتى لو كان في آخر عمود في الشيت
// //  */
// // export async function updatePricesOnly(rows) {
// //     const productsRef = window.firestoreUtils.collection(
// //         window.db, "artifacts", window.appId, "public", "data", "products"
// //     );

// //     let updated = 0;
// //     const batch = window.firestoreUtils.writeBatch(window.db);
// //     const productMap = new Map();
// //     (window.products || []).forEach(p => {
// //         if (p.name) productMap.set(normalizeArabic(p.name), p);
// //         if (p.sku) productMap.set(normalizeArabic(p.sku), p);
// //         if (p.quit) productMap.set(normalizeArabic(p.quit), p);
// //     });

// //     for (const row of rows) {
// //         let name = String(findValByParts(row, ["الصنف", "الاسم", "البيان", "Item"]) || "").trim();
// //         let sku = String(findValByParts(row, ["كود", "SKU", "Barcode"]) || "").trim();
// //         let quit = String(findValByParts(row, [" رصيد المخزن", "الكميه"]) || "").trim();
// //         let price = 0;

// //         // البحث العكسي عن السعر في أعمدة الإكسل
// //         const values = Object.values(row).reverse();
// //         for (let val of values) {
// //             let cleanNum = parseExcelNumber(val);
// //             if (cleanNum > 0 && !isNaN(cleanNum)) {
// //                 price = cleanNum;
// //                 break;
// //             }
// //         }

// //         const existing = productMap.get(normalizeArabic(name)) || (sku ? productMap.get(normalizeArabic(sku)) : null);
// //         if (existing && price > 0) {
// //             const docRef = window.firestoreUtils.doc(productsRef, existing.id);
// //             batch.update(docRef, {
// //                 price: price,
// //                 "prices.bag": price,
// //                 updatedAt: window.firestoreUtils.serverTimestamp()
// //             });
// //             updated++;
// //         }
// //     }
// //     if (updated > 0) {
// //         await batch.commit();
// //         window.showToast(`تم تحديث أسعار ${updated} صنف بنجاح`, "success");
// //     }
// // }
// // window.updatePricesOnly = updatePricesOnly;

// // export function openBulkImportModal() {
// //     const modal = document.getElementById("bulk-import-modal");
// //     if (modal) {
// //         modal.classList.remove("hidden");
// //         modal.classList.add("flex");
// //     }
// // }
// // window.openBulkImportModal = openBulkImportModal;

// // export function closeBulkImportModal() {
// //     const modal = document.getElementById("bulk-import-modal");
// //     if (modal) {
// //         modal.classList.add("hidden");
// //         modal.classList.remove("flex");
// //     }
// // }
// // window.closeBulkImportModal = closeBulkImportModal;
// // // معالجة وحفظ المنتجات المفلترة بالكلمات المفتاحية
// // export async function saveBulkProducts() {
// //   // 1. جلب وتنظيف الكلمات المفتاحية
// //   const keywordsInput = document.getElementById("bulk-keywords");
// //   const keywords = keywordsInput && keywordsInput.value
// //     ? keywordsInput.value.split(",").map((k) => normalizeArabic(k.trim())).filter(Boolean)
// //     : [];

// //   // 2. جلب البيانات من النص الملصق أو من آخر ملف تم رفعه
// //   let rows = window.lastUploadedRows || [];
// //   const sheetDataArea = document.getElementById("bulk-sheet-data");
// //   const sheetDataText = sheetDataArea ? sheetDataArea.value.trim() : "";

// //   // إذا لم توجد بيانات مرفوعة مسبقاً، نحاول قراءة النص الملصق
// //   if (rows.length === 0 && sheetDataText) {
// //     rows = sheetDataText.split("\n").map((line) => {
// //       const parts = line.split(/[\t,]/);
// //       return {
// //         "الاسم": (parts[0] || "").trim(),
// //         "سعر": (parts[1] || "").trim(),
// //         "كود": (parts[2] || "").trim(),
// //         "مخزون": (parts[3] || "").trim(),
// //       };
// //     }).filter(r => r["الاسم"]);
// //   }

// //   if (rows.length === 0) {
// //     return window.showToast("يرجى إدخال بيانات أو رفع ملف أولاً", "warning");
// //   }

// //   // 3. تصفية الصفوف بناءً على الكلمات المفتاحية
// //   let filteredRows = rows.filter((row) => {
// //     if (keywords.length === 0) return true; // إذا لم توجد كلمات، نأخذ الكل
// //     const name = findValByParts(row, ["اسم الصنف", "الصنف", "الاسم", "البيان", "المنتج", "Product"]);
// //     const normName = normalizeArabic(name);
// //     return keywords.some((k) => normName.includes(k));
// //   });

// //   if (filteredRows.length === 0) {
// //     return window.showToast("لا توجد أصناف مطابقة للكلمات المفتاحية المختارة", "info");
// //   }

// //   // جلب إعدادات القسم والوحدة من الواجهة (تأكد من وجود هذه الـ IDs في الـ HTML)
// //   const targetCatId = document.getElementById("bulk-category-select")?.value || "";
// //   const targetCatObj = (window.categories || []).find((c) => c.id === targetCatId);
// //   const unit = document.getElementById("bulk-unit-select")?.value || "قطعة";
// //   const quantities = document.getElementById("bulk-quantities-input")?.value || "";

// //   const countText = keywords.length > 0 ? "مطابق للكلمات المفتاحية" : "إجمالي الملف";

// //   if (confirm(`تم العثور على ${filteredRows.length} صنف (${countText}).\nهل تريد إضافتهم/تحديثهم الآن؟`)) {
// //     window.showNotification(`جاري معالجة ${filteredRows.length} صنف...`);

// //     const rowsToProcess = filteredRows.map((r) => {
// //       const rowCleaned = {};
// //       Object.keys(r).forEach((k) => (rowCleaned[k.trim()] = r[k]));

// //       return {
// //         ...rowCleaned,
// //         category: targetCatObj ? targetCatObj.name : (rowCleaned["category"] || "عام"),
// //         categoryId: targetCatId || rowCleaned["categoryId"] || "",
// //         unitMeasurement: unit,
// //         availableQuantities: quantities,
// //         minStock: 5,
// //       };
// //     });

// //     try {
// //       // استدعاء دالة المعالجة الجماعية (التي تدعم السعر والمخزون)
// //       await window.processBulkProducts(rowsToProcess);
      
// //       // إغلاق المودال وتفريغ الحقول
// //       if (typeof closeBulkImportModal === "function") closeBulkImportModal();
// //       if (document.getElementById("bulk-keywords")) document.getElementById("bulk-keywords").value = "";
// //       if (document.getElementById("bulk-sheet-data")) document.getElementById("bulk-sheet-data").value = "";
      
// //     } catch (e) {
// //       console.error(e);
// //       window.showToast("حدث خطأ أثناء الحفظ: " + (e.message || ""), "error");
// //     }
// //   }
// // }
// export async function smartRowBasedUpdate(rows) {
//   const productsRef = window.firestoreUtils.collection(
//     window.db,
//     "artifacts",
//     window.appId,
//     "public",
//     "data",
//     "products",
//   );

//   const BATCH_SIZE = 450; // للحفاظ على استقرار Firestore
//   const DELAY_MS = 1000;

//   let batch = window.firestoreUtils.writeBatch(window.db);
//   let opCount = 0;
//   let updated = 0;
//   let created = 0;
//   let skipped = 0;
//   let batchCount = 0;

//   window.isBulkUploading = true;

//   // 1. تجميد المصفوفة لتجنب تداخل التحديثات اللحظية
//   const existingProductsSnapshot = JSON.parse(
//     JSON.stringify(window.products || []),
//   );

//   // 2. بناء الفهرس الذكي لمنع التكرار
//   const productMap = new Map();
//   existingProductsSnapshot.forEach((p) => {
//     const pId = p.id || p.originalId;
//     if (!pId) return;

//     const keyName = normalizeArabic(p.name || "");
//     const keySku = normalizeArabic(p.sku || "");

//     if (keyName) productMap.set("name_" + keyName, p);
//     if (keySku) {
//       productMap.set("sku_" + keySku, p);
//       productMap.set("sku_" + keySku.replace(/^0+/, ""), p);
//     }
//   });

//   const commitBatch = async () => {
//     if (opCount === 0) return;
//     try {
//       await batch.commit();
//       batchCount++;
//       console.log(
//         `[Bulk Upload] ✅ تم رفع الدفعة ${batchCount} بنجاح (${opCount} عملية)`,
//       );
//     } catch (err) {
//       console.error(`[Bulk Upload] ❌ خطأ في الدفعة ${batchCount}:`, err);
//       window.showToast(`تحذير: خطأ في رفع جزء من البيانات`, "warning");
//     }
//     await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
//     batch = window.firestoreUtils.writeBatch(window.db);
//     opCount = 0;
//   };

//   // دالة لتنظيف العناوين من المسافات المخفية في ملف الـ CSV
//   const cleanRowKeys = (rawRow) => {
//     const cleaned = {};
//     for (let key in rawRow) {
//       if (rawRow.hasOwnProperty(key)) {
//         cleaned[key.trim()] = rawRow[key];
//       }
//     }
//     return cleaned;
//   };

//   for (let i = 0; i < rows.length; i++) {
//     if (i % 200 === 0 && i > 0) {
//       window.showNotification(`جاري المعالجة...  ${i} / ${rows.length} صنف`);
//     }

//     try {
//       // تنظيف الصف من المسافات
//       const r = cleanRowKeys(rows[i]);

//       // استخراج البيانات مع إضافة احتمالات أكثر لأسماء الأعمدة لتجنب مشكلة الصفر
//       const sku = String(r["كود الصنف"] || r["الكود"] || r["كود"] || r["SKU"] || r["Barcode"] || "").trim();
//       const fullName = String(
//         r["الصنف"] || r["اسم الصنف"] || r["الاسم"] || r["البيان"] || "",
//       ).trim();
//       const rowCategory = String(
//         r["المجموعه"] || r["المجموعة"] || r["التصنيف"] || "عام",
//       ).trim();

//       const price = parseExcelNumber(r["السعر"] || r["سعر"] || r["Price"]) || 0;
      
//       // هنا كان سبب المشكلة: أضفنا كلمات (مخزون، رصيد، الرصيد) لضمان التقاط الرقم
//       const qtyStr = r["رصيد المخزن"] || r["رصيد"] || r["مخزون"] || r["المخزون"] || r["الكمية"] || r["الكميه"] || r["Qty"];
//       const qty = parseExcelNumber(qtyStr) || 0;

//       // تخطي الصفوف الفارغة تماماً
//       if (!fullName && !sku) {
//         skipped++;
//         continue;
//       }

//       const normSku = normalizeArabic(sku);
//       const normName = normalizeArabic(fullName);

//       // البحث في الفهرس
//       let product = null;
//       if (normSku)
//         product =
//           productMap.get("sku_" + normSku) ||
//           productMap.get("sku_" + normSku.replace(/^0+/, ""));
//       if (!product && normName) product = productMap.get("name_" + normName);

//       if (product) {
//         // --- تحديث منتج موجود ---
//         const docId = product.id || product.originalId;
//         const docRef = window.firestoreUtils.doc(productsRef, docId);

//         // التحقق من وجود تغييرات لتقليل الاستهلاك وتسريع العملية
//         const hasChanges =
//           product.name !== fullName ||
//           Number(product.price) !== price ||
//           Number(product.quantity) !== qty ||
//           product.category !== rowCategory;

//         if (hasChanges) {
//           batch.update(docRef, {
//             name: fullName || product.name,
//             sku: sku || product.sku,
//             price: price,
//             quantity: qty,
//             category: rowCategory,
//             "prices.bag": price,
//             status: qty > 0 ? "available" : "out_of_stock",
//             updatedAt: window.firestoreUtils.serverTimestamp(),
//           });
//           updated++;

//           // تحديث الفهرس اللحظي لمنع إعادة التحديث في نفس الجلسة
//           product.price = price;
//           product.quantity = qty;
//           product.category = rowCategory;
//           opCount++;
//         } else {
//           skipped++;
//         }
//       } else {
//         // --- إضافة منتج جديد ---
//         const newDocRef = window.firestoreUtils.doc(productsRef);
//         const newProductData = {
//           name: fullName,
//           sku: sku,
//           price: price,
//           quantity: qty,
//           category: rowCategory,
//           prices: { bag: price },
//           availableUnits: { bag: true },
//           status: qty > 0 ? "available" : "out_of_stock",
//           createdAt: window.firestoreUtils.serverTimestamp(),
//           updatedAt: window.firestoreUtils.serverTimestamp(),
//         };

//         batch.set(newDocRef, newProductData);

//         // إضافة المنتج الجديد للفهرس اللحظي فوراً 
//         const tempObj = { ...newProductData, id: newDocRef.id };
//         if (normSku) productMap.set("sku_" + normSku, tempObj);
//         if (normName) productMap.set("name_" + normName, tempObj);

//         created++;
//         opCount++;
//       }

//       // إرسال الدفعة إذا اكتمل العدد
//       if (opCount >= BATCH_SIZE) {
//         await commitBatch();
//       }
//     } catch (e) {
//       console.error("[Bulk Upload] خطأ في معالجة الصف رقم", i, e);
//     }
//   }

//   // رفع أي بيانات متبقية في الدفعة الأخيرة
//   await commitBatch();
//   window.isBulkUploading = false;

//   const msg = `اكتملت العملية: إضافات جديدة (${created}) | تحديثات (${updated}) | متطابق تم تخطيه (${skipped})`;
//   window.showToast(msg, "success", 8000);
//   console.log("[Bulk Upload] النتيجة النهائية:", msg);

//   // تأخير بسيط وإعادة تهيئة الداشبورد لضمان عرض البيانات المحدثة
//   setTimeout(() => {
//     if (typeof window.refreshAllData === "function") {
//       window.refreshAllData(); 
//     } else if (typeof window.renderAdminProducts === "function") {
//       window.renderAdminProducts();
//     }
//   }, 1500);
// }
// async function processBulkProducts(rows) {
//   await smartRowBasedUpdate(rows);
// }
// window.smartRowBasedUpdate = smartRowBasedUpdate;

// /**
//  * دالة تحديث الأسعار (والمخزون)
//  * تم التعديل لتحديث رصيد المخزون مع السعر إذا تم تغييره
//  */
// export async function updatePricesOnly(rows) {
//     const productsRef = window.firestoreUtils.collection(
//         window.db, "artifacts", window.appId, "public", "data", "products"
//     );

//     let updated = 0;
//     const batch = window.firestoreUtils.writeBatch(window.db);
//     const productMap = new Map();
//     (window.products || []).forEach(p => {
//         if (p.name) productMap.set(normalizeArabic(p.name), p);
//         if (p.sku) productMap.set(normalizeArabic(p.sku), p);
//     });

//     for (const row of rows) {
//         let name = String(findValByParts(row, ["الصنف", "الاسم", "البيان", "Item"]) || "").trim();
//         let sku = String(findValByParts(row, ["كود", "SKU", "Barcode"]) || "").trim();
        
//         // تعديل: التقاط المخزون بشكل صحيح من هذه الدالة أيضاً
//         let qtyStr = findValByParts(row, ["رصيد", "مخزون", "الكمية", "الكميه", "Qty"]);
//         let qty = parseExcelNumber(qtyStr);
//         let price = 0;

//         // البحث العكسي عن السعر في أعمدة الإكسل
//         const values = Object.values(row).reverse();
//         for (let val of values) {
//             let cleanNum = parseExcelNumber(val);
//             if (cleanNum > 0 && !isNaN(cleanNum)) {
//                 price = cleanNum;
//                 break;
//             }
//         }

//         const existing = productMap.get(normalizeArabic(name)) || (sku ? productMap.get(normalizeArabic(sku)) : null);
        
//         // تعديل: نسمح بالتحديث إذا وجدنا سعر أو مخزون جديد
//         if (existing && (price > 0 || (qty !== undefined && !isNaN(qty)))) {
//             const docRef = window.firestoreUtils.doc(productsRef, existing.id);
//             const updatePayload = {
//                 updatedAt: window.firestoreUtils.serverTimestamp()
//             };

//             // تحديث السعر إذا كان موجوداً
//             if (price > 0) {
//                 updatePayload.price = price;
//                 updatePayload["prices.bag"] = price;
//             }

//             // تحديث المخزون والحالة إذا كان موجوداً
//             if (qty !== undefined && !isNaN(qty)) {
//                 updatePayload.quantity = qty;
//                 updatePayload.status = qty > 0 ? "available" : "out_of_stock";
//             }

//             batch.update(docRef, updatePayload);
//             updated++;
//         }
//     }
    
//     if (updated > 0) {
//         await batch.commit();
//         window.showToast(`تم تحديث بيانات ${updated} صنف بنجاح`, "success");
//     }
// }
/**
 * SHADOW-ENGINE: Smart Bulk Upload & Price-Stock Sync
 * المصمم للتعامل مع كميات بيانات ضخمة (5000+ صنف) بدون أخطاء
 */
export async function smartRowBasedUpdate(rows) {
  const productsRef = window.firestoreUtils.collection(
    window.db, "artifacts", window.appId, "public", "data", "products"
  );

  // إعدادات الأداء العالي
  const BATCH_SIZE = 400; // للأمان واستقرار السيرفر
  const DELAY_BETWEEN_BATCHES = 1200; // فاصل زمني لمنع الازدحام

  let batch = window.firestoreUtils.writeBatch(window.db);
  let opCount = 0, updated = 0, created = 0, skipped = 0, batchCount = 0;

  window.isBulkUploading = true;

  // 1. بناء قاعدة بيانات محلية سريعة جداً للبحث O(1)
  const productMap = new Map();
  (window.products || []).forEach((p) => {
    const pId = p.id || p.originalId;
    if (!pId) return;
    
    const keyName = normalizeArabic(p.name || "");
    const keySku = normalizeArabic(p.sku || "");

    if (keySku) {
      productMap.set("sku_" + keySku, p);
      productMap.set("sku_" + keySku.replace(/^0+/, ""), p); // دعم الأكواد بدون أصفار بادئة
    }
    if (keyName) productMap.set("name_" + keyName, p);
  });

  const commitBatch = async () => {
    if (opCount === 0) return;
    try {
      await batch.commit();
      batchCount++;
      console.log(`[SHADOW-SYNC] ✅ الدفعة ${batchCount} اكتملت (${opCount} عملية)`);
    } catch (err) {
      console.error(`[SHADOW-SYNC] ❌ خطأ في الدفعة ${batchCount}:`, err);
    }
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    batch = window.firestoreUtils.writeBatch(window.db);
    opCount = 0;
  };

  // مساعد البحث الذكي عن القيم
  const getVal = (row, keywords) => {
    const keys = Object.keys(row);
    for (let k of keywords) {
      const foundKey = keys.find(rk => rk.trim().toLowerCase() === k.toLowerCase() || normalizeArabic(rk.trim()) === normalizeArabic(k));
      if (foundKey) return row[foundKey];
    }
    return null;
  };

  console.log(`[SHADOW-SYNC] جاري معالجة ${rows.length} صف...`);

  if (window.showProgress) window.showProgress("bulk-upload", "جاري استيراد وتحديث المنتجات والمخزن...", rows.length);

  for (let i = 0; i < rows.length; i++) {
    try {
      const r = rows[i];
      
      // استخراج البيانات بدقة فائقة
      const sku = String(getVal(r, ["كود الصنف", "كود", "الكود", "الرمز", "SKU", "Barcode", "الباركود"]) || "").trim();
      const name = String(getVal(r, ["الصنف", "اسم الصنف", "الاسم", "البيان", "Product", "Item"]) || "").trim();
      const price = parseExcelNumber(getVal(r, ["السعر", "سعر", "Price", "Rate"])) || 0;
      // const rawQty = getVal(r, ["رصيد المخزن", "الرصيد", "رصيد", "مخزون", "الكمية", "الكميه", "Qty", "Stock"]);
      const rawQty = getVal(r, ["رصيد المخزن", "الرصيد", "رصيد", "مخزون", "الكمية", "الكميه", "الرصيد الحالى", "Qty", "Stock"]);
      
      const category = String(getVal(r, ["المجموعه", "المجموعة", "Category", "التصنيف"]) || "عام").trim();

      if (!name && !sku) { skipped++; continue; }

      const normSku = superClean(sku);
      const normName = superClean(name);

      // قرار التحديث أو الإضافة
      let existing = (normSku ? (productMap.get("sku_" + normSku) || productMap.get("sku_" + normSku.replace(/^0+/, ""))) : null) || productMap.get("name_" + normName);

      if (existing) {
        // --- تحديث المنتج ---
        const docRef = window.firestoreUtils.doc(productsRef, existing.id || existing.originalId);
        
        // إصلاح: إذا لم تتوفر كمية في السطر، نحتفظ بالكمية الحالية في الموقع
        const currentQty = Number(existing.quantity || 0);
        const finalQty = (rawQty !== null && rawQty !== undefined && String(rawQty).trim() !== "") ? parseExcelNumber(rawQty) : currentQty;

        // مقارنة ذكية: نقارن فقط الحقول التي جاءت في ملف الإكسل لتجنب التحديثات غير الضرورية
        const hasChanges = 
          (price > 0 && Number(existing.price) !== price) || 
          (currentQty !== finalQty) || 
          (name && existing.name !== name) ||
          (category && category !== "عام" && existing.category !== category);

        if (hasChanges) {
          batch.update(docRef, {
            name: name || existing.name,
            sku: sku || existing.sku,
            price: price,
            quantity: finalQty,
            category: category,
            "prices.bag": price,
            status: finalQty > 0 ? "available" : "out_of_stock",
            updatedAt: window.firestoreUtils.serverTimestamp(),
          });
          updated++;
          opCount++;
          // تحديث الذاكرة فوراً لمنع التكرار في نفس الملف
          existing.price = price;
          existing.quantity = finalQty;
        } else {
          skipped++;
        }
      } else {
        // --- إضافة صنف جديد ---
        const finalQty = (rawQty !== null && rawQty !== undefined) ? parseExcelNumber(rawQty) : 0;
        const newDoc = window.firestoreUtils.doc(productsRef);
        const newData = {
          name,
          sku,
          price,
          quantity: finalQty,
          category,
          prices: { bag: price },
          availableUnits: { bag: true },
          status: finalQty > 0 ? "available" : "out_of_stock",
          createdAt: window.firestoreUtils.serverTimestamp(),
          updatedAt: window.firestoreUtils.serverTimestamp(),
        };
        batch.set(newDoc, newData);
        
        // تسجيله في الخريطة فوراً تحسباً لتكراره في نفس الشيت
        productMap.set("sku_" + normSku, { ...newData, id: newDoc.id });
        created++;
        opCount++;
      }

      // إدارة الدفعات (Batches)
      if (opCount >= BATCH_SIZE) await commitBatch();

      // إشعار كل 500 صنف
      if (i % 500 === 0 && i > 0) window.showNotification(`تمت معالجة ${i} من ${rows.length} صنف...`);

    } catch (e) {
      console.error(`Error at row ${i}:`, e);
    }
  }

  await commitBatch();
  
  if (window.hideProgress) window.hideProgress("percent-update");
  window.isBulkUploading = false;

  if (window.hideProgress) window.hideProgress("bulk-upload");
  
  const finalMsg = `اكتمل: جديد (${created}) | تحديث (${updated}) | متطابق (${skipped})`;
  window.showToast(finalMsg, "success", 10000);

  // إعادة إنعاش البيانات في الموقع
  setTimeout(() => {
    if (window.refreshAllData) window.refreshAllData();
  }, 1500);
}

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

// معالجة وحفظ المنتجات المفلترة بالكلمات المفتاحية
export async function saveBulkProducts() {
  // 1. جلب وتنظيف الكلمات المفتاحية
  const keywordsInput = document.getElementById("bulk-keywords");
  const keywords = keywordsInput && keywordsInput.value
    ? keywordsInput.value.split(",").map((k) => normalizeArabic(k.trim())).filter(Boolean)
    : [];

  // 2. جلب البيانات من النص الملصق أو من آخر ملف تم رفعه
  let rows = window.lastUploadedRows || [];
  const sheetDataArea = document.getElementById("bulk-sheet-data");
  const sheetDataText = sheetDataArea ? sheetDataArea.value.trim() : "";

  // إذا لم توجد بيانات مرفوعة مسبقاً، نحاول قراءة النص الملصق
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

  if (rows.length === 0) {
    return window.showToast("يرجى إدخال بيانات أو رفع ملف أولاً", "warning");
  }

  // 3. تصفية الصفوف بناءً على الكلمات المفتاحية
  let filteredRows = rows.filter((row) => {
    if (keywords.length === 0) return true; // إذا لم توجد كلمات، نأخذ الكل
    const name = findValByParts(row, ["اسم الصنف", "الصنف", "الاسم", "البيان", "المنتج", "Product"]);
    const normName = normalizeArabic(name);
    return keywords.some((k) => normName.includes(k));
  });

  if (filteredRows.length === 0) {
    return window.showToast("لا توجد أصناف مطابقة للكلمات المفتاحية المختارة", "info");
  }

  // جلب إعدادات القسم والوحدة من الواجهة
  const targetCatId = document.getElementById("bulk-category-select")?.value || "";
  const targetCatObj = (window.categories || []).find((c) => c.id === targetCatId);
  const unit = document.getElementById("bulk-unit-select")?.value || "قطعة";
  const quantities = document.getElementById("bulk-quantities-input")?.value || "";

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
      // استدعاء دالة المعالجة الجماعية
      await window.processBulkProducts(rowsToProcess);
      
      // إغلاق المودال وتفريغ الحقول
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
      const qty = Number(p.quantity || 0);
      const min = Number(p.minThreshold || 5);
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
            <span class="text-[10px] font-bold text-emerald-700">السعر: ${Number(p.price || 0).toFixed(2)} <span class="currency-shic">EGP</span></span>
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
        cats = cats.filter((c) => c.parentId);
      }

      const options = cats
        .map((c) => {
          const parent = (window.categories || []).find(
            (p) => p.id === c.parentId,
          );
          // عرض اسم القسم الرئيسي بجانب الفرعي لسهولة التمييز (مثال: بقالة » جبن)
          const displayName = parent ? `${parent.name} » ${c.name}` : c.name;
          return `<option value="${c.id}">${displayName}</option>`;
        })
        .join("");

      let defaultText = "-- القسم التابع له--";
      if (id === "bulk-price-cat")
        defaultText = "-- كل الأقسام (تحديث شامل) --";
      if (id === "bulk-import-cat") defaultText = "-- اختيار قسم فرعي --";

      const extraOption =
        id === "bulk-price-cat"
          ? '<option value="none">-- منتجات بدون قسم --</option>'
          : "";
      el.innerHTML = `<option value="">${defaultText}</option>${extraOption}${options}`;
    }
  });
}

// معالجة رفع ملف الأسعار وتحويله لنص في منطقة المعاينة
export async function handleBulkPriceFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0)
      return window.showToast("الملف فارغ أو غير مدعوم", "error");

    const textLines = rows
      .map((row) => {
        const r = {};
        Object.keys(row).forEach((k) => (r[k.trim()] = row[k]));

        // 1. استخراج السعر أولاً بأكثر الطرق دقة
        let price = parseExcelNumber(
          findValByParts(r, [
            "السعر",
            "بيع",
            "جمله",
            "جملة",
            "Price",
            "Wholesale",
            "100",
            "101",
            "102",
            "103",
            "104",
            "105",
          ]),
        );

        // إذا لم نجد السعر بالكلمات المفتاحية، نبحث عن أول رقم صالح في أي عمود (مع استثناء الأكواد الطويلة)
        if (isNaN(price) || price <= 0) {
          const values = Object.values(r).map((v) => String(v || "").trim());
          for (const val of values) {
            const num = parseExcelNumber(val);
            if (num > 0 && num < 100000) {
              // سعر منطقي (ليس كود طويل)
              price = num;
              break;
            }
          }
        }
        if (isNaN(price) || price <= 0) return null; // إذا لم نجد سعراً صالحاً حتى بعد البحث المرن، نتجاهل السطر

        // 2. استخراج الكود والقسم من الأعمدة المحددة
        const sku = String(
          findValByParts(r, [
            "كود الصنف",
            "الكود",
            "كود",
            "SKU",
            "code",
            "باركود",
            "Barcode",
            "الباركود",
          ]) || "",
        ).trim();
        const cat = String(
          findValByParts(r, [
            "المجموعه",
            "اسم المجموعه",
            "القسم",
            "Category",
            "المجموعة",
            "التصنيف",
          ]),
        ).trim();

        // 3. بناء الاسم الوصفي الكامل (fullName)
        let descriptiveParts = [];
        const nameFromColumn = String(
          findValByParts(r, [
            "اسم الصنف",
            "خانه الصنف",
            "الصنف",
            "صنف",
            "الاسم",
            "اسم",
            "البيان",
            "المنتج",
            "Item",
            "Product",
            "Description",
          ]) || "",
        ).trim();
        
        const qty = getVal(r, ["رصيد المخزن", "الرصيد", "رصيد", "مخزون", "الكمية", "الكميه", "Qty", "Stock"]) || "";

        if (nameFromColumn) {
          descriptiveParts.push(nameFromColumn);
        } else {
          // إذا لم يكن هناك عمود اسم صريح، نجمع كل القيم غير السعرية وغير الكودية وغير القسمية
          const priceKeywords = [
            "سعر",
            "price",
            "جمله",
            "wholesale",
            "100",
            "101",
            "102",
            "103",
            "104",
            "105",
          ];
          const skuKeywords = ["كود", "sku", "id", "باركود"];
          const categoryKeywords = ["مجموعه", "قسم", "category", "تصنيف"];

          for (const key of Object.keys(r)) {
            const normalizedKey = normalizeArabic(key);
            const val = String(r[key] || "").trim();
            if (!val) continue;

            // إذا لم يكن العمود يمثل سعرًا أو كودًا أو قسمًا، نضيف قيمته إلى الأجزاء الوصفية
            if (
              !priceKeywords.some((kw) => normalizedKey.includes(kw)) &&
              !skuKeywords.some((kw) => normalizedKey.includes(kw)) &&
              !categoryKeywords.some((kw) => normalizedKey.includes(kw))
            ) {
              descriptiveParts.push(val);
            }
          }
        }
        const finalIdentifier = descriptiveParts
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        // تحسين: إذا لم ينجح بناء الاسم، نأخذ أول قيمة نصية كاسم (لضمان استخراج كل الـ 1100 صنف)
        const fallbackName = !finalIdentifier
          ? Object.values(r).find(
              (v) => v && isNaN(parseExcelNumber(v)) && String(v).length > 2,
            )
          : null;
        const resultIdentifier = finalIdentifier || fallbackName || sku;

        // إذا لم يكن هناك اسم وصفي، نستخدم الكود كمعرف نهائي (إذا كان موجوداً)
        if (!resultIdentifier) return null;

        return `${resultIdentifier}|${price}|${qty}${cat ? "|" + cat : ""}`;
      })
      .filter(Boolean);

    document.getElementById("bulk-price-data").value = textLines.join("\n");
    window.showToast(`تم استخراج ${textLines.length} صنف بنجاح`, "success");
  } catch (e) {
    window.showToast("خطأ في قراءة ملف الإكسل، تأكد من الصيغة", "error");
  }
}
// حفظ تحديثات الأسعار في قاعدة البيانات - نسخة محسّنة تعالج أكثر من 1500 منتج بكفاءة
export async function saveBulkPriceUpdates() {
  const catId = document.getElementById("bulk-price-cat")?.value;
  const percentage = parseFloat(
    document.getElementById("bulk-price-percentage")?.value || 0,
  );
  const rawData = document.getElementById("bulk-price-data")?.value.trim();

  const products = window.products || [];
  if (products.length === 0) {
    return window.showToast(
      "لا توجد منتجات محملة، يرجى الانتظار ثم المحاولة مجدداً",
      "warning",
    );
  }

  let targetCategoryName = "";
  if (catId && catId !== "none") {
    const cat = (window.categories || []).find((c) => c.id === catId);
    if (cat) targetCategoryName = normalizeArabic(cat.name);
  }

  const BATCH_SIZE = 450;
  const DELAY_MS = 800;

  const productsRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products",
  );

  let batch = window.firestoreUtils.writeBatch(window.db);
  let opCount = 0;
  let batchNum = 0;
  let updateCount = 0;
  let skippedCount = 0;
  let notFoundCount = 0;

  const commitAndReset = async () => {
    if (opCount === 0) return;
    try {
      await batch.commit();
      batchNum++;
      console.log(`[Price Update] ✅ دفعة ${batchNum}: ${opCount} تحديث`);
    } catch (err) {
      console.error(`[Price Update] ❌ خطأ في دفعة ${batchNum}:`, err);
      window.showToast(
        `تحذير: خطأ في إرسال الدفعة (${err.message})`,
        "warning",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    batch = window.firestoreUtils.writeBatch(window.db);
    opCount = 0;
  };

  // 🧠 بناء فهرس أكثر دقة باستخدام Prefixes لمنع تداخل الأسماء مع الأكواد
  const productMap = new Map();
  products.forEach((p) => {
    const nameKey = superClean(p.name || "");
    const skuKey = superClean(p.sku || "");
    if (nameKey) productMap.set("name_" + nameKey, p);
    if (skuKey) {
      productMap.set("sku_" + skuKey, p);
      productMap.set("sku_" + skuKey.replace(/^0+/, ""), p);
    }
  });

  // ═══════════════════════════════════════════════════
  // الحالة الأولى: التحديث عبر النص الملصق من الإكسل
  // ═══════════════════════════════════════════════════
  if (rawData) {
    const lines = rawData.split("\n");
    window.showNotification(`جاري معالجة ${lines.length} سطر...`);

    if (window.showProgress) window.showProgress("price-update", "جاري تحديث الأسعار والمخزون...", lines.length);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // فصل البيانات بذكاء (التاب \t هو الفاصل الأساسي عند النسخ من الإكسل)
      // نستخدم الفلتر لإزالة المسافات الفارغة الناتجة عن أعمدة فارغة
      let parts = trimmedLine
        .split(/\t|\|/)
        .map((s) => s.trim())
        .filter((s) => s !== "");

      // إذا لم ينجح الفصل بالتاب، نلجأ للمسافات المتعددة
      if (parts.length < 2) {
        parts = trimmedLine
          .split(/\s{2,}/)
          .map((s) => s.trim())
          .filter((s) => s !== "");
      }

      if (parts.length < 2) continue; // يجب أن يكون هناك على الأقل معرف وسعر

      const identifier = parts[0];
      const priceVal = parseExcelNumber(parts[1]);

      // استخراج الكمية إذا كان الإكسل المنسوخ يحتوي على 3 أعمدة (معرف، سعر، كمية) أو العكس
      let qtyVal = null;
      if (parts.length >= 3) {
        qtyVal = parseExcelNumber(parts[2]);
      }

      if (!identifier || isNaN(priceVal) || priceVal <= 0) continue;

      const normalizedIdentifier = superClean(identifier);
      const cleanIdentifier = normalizedIdentifier.replace(/^0+/, "");

      // 🔍 البحث الدقيق في الفهرس
      let p =
        productMap.get("sku_" + normalizedIdentifier) ||
        productMap.get("sku_" + cleanIdentifier) ||
        productMap.get("name_" + normalizedIdentifier);

      // بحث احتياطي
      if (!p) {
        p = products.find((x) => {
          const dbSku = superClean(x.sku || "");
          const dbName = superClean(x.name || "");
          return (
            (dbSku &&
              (dbSku === normalizedIdentifier ||
                dbSku.replace(/^0+/, "") === cleanIdentifier)) ||
            (dbName && dbName === normalizedIdentifier)
          );
        });
      }

      if (p) {
        // فلترة القسم
        if (catId === "none") {
          const pCat = normalizeArabic(p.category || "");
          if (pCat !== "" && pCat !== "عام") {
            skippedCount++;
            continue;
          }
        }

        const finalPrice =
          percentage !== 0 ? priceVal * (1 + percentage / 100) : priceVal;
        const updatedPrice = Number(finalPrice.toFixed(2));

        // التحقق من وجود تغيير في السعر أو في الكمية
        const priceChanged =
          Number(p.price) !== updatedPrice ||
          !p.prices ||
          Number((p.prices || {}).bag) !== updatedPrice;
        const qtyChanged =
          qtyVal !== null && !isNaN(qtyVal) && Number(p.quantity) !== qtyVal;

        if (priceChanged || qtyChanged) {
          const docRef = window.firestoreUtils.doc(productsRef, p.id);

          const updateData = {
            price: updatedPrice,
            "prices.bag": updatedPrice,
            "availableUnits.bag": true,
            updatedAt: window.firestoreUtils.serverTimestamp(),
          };

          // تحديث الكمية إذا تم العثور عليها في النص المنسوخ
          if (qtyChanged) {
            updateData.quantity = qtyVal;
            updateData.status = qtyVal > 0 ? "available" : "out_of_stock";
          }

          batch.update(docRef, updateData);

          // تحديث المرجع المحلي لمنع التكرار
          p.price = updatedPrice;
          if (qtyChanged) p.quantity = qtyVal;

          updateCount++;
          opCount++;
          if (opCount >= BATCH_SIZE) await commitAndReset();

          if (i % 10 === 0 || i === lines.length - 1) {
            if (window.updateProgress) window.updateProgress("price-update", i + 1, lines.length);
          }
        } else {
          skippedCount++;
        }
      } else {
        notFoundCount++;
        console.warn(`[Price Update] غير موجود: "${identifier}"`);
      }
    }
  }
  // ═══════════════════════════════════════════════════
  // الحالة الثانية: تحديث شامل بنسبة مئوية (بدون ملف)
  // ═══════════════════════════════════════════════════
  else if (percentage !== 0) {
    // ... [تم الاحتفاظ بنفس الكود الخاص بك في هذه الجزئية لأنه سليم]
    window.showNotification(
      `جاري تحديث ${products.length} منتج بنسبة ${percentage}%...`,
    );
    
    if (window.showProgress) window.showProgress("percent-update", `تعديل الأسعار بنسبة ${percentage}%...`, products.length);

    let processed = 0;
    for (const p of products) {
      if (!p.id) continue;
      processed++;
      if (processed % 200 === 0) {
        window.showNotification(
          `جاري التحديث... ${processed} / ${products.length}`,
        );
      }

      if (processed % 20 === 0 || processed === products.length) {
        if (window.updateProgress) window.updateProgress("percent-update", processed, products.length);
      }

      const pCat = normalizeArabic(p.category || "");
      if (catId === "none" && pCat !== "" && pCat !== "عام") continue;
      if (targetCategoryName && pCat !== targetCategoryName) continue;

      const oldPrice = parseFloat(p.price || 0);
      if (oldPrice <= 0) continue;
      const newPrice = Number((oldPrice * (1 + percentage / 100)).toFixed(2));

      const needsUpdate =
        !isNaN(newPrice) &&
        (Number(p.price) !== newPrice ||
          !p.prices ||
          Number((p.prices || {}).bag) !== newPrice);

      if (needsUpdate) {
        batch.update(window.firestoreUtils.doc(productsRef, p.id), {
          price: newPrice,
          "prices.bag": newPrice,
          updatedAt: window.firestoreUtils.serverTimestamp(),
        });
        updateCount++;
        opCount++;
        if (opCount >= BATCH_SIZE) await commitAndReset();
      } else {
        skippedCount++;
      }
    }
  } else {
    return window.showToast("يرجى إدخال نسبة تغيير أو لصق بيانات", "warning");
  }

  // إتمام آخر دفعة
  await commitAndReset();

  if (updateCount > 0) {
    const parts = [`✅ تم تحديث ${updateCount} منتج`];
    if (skippedCount > 0) parts.push(` ${skippedCount} متطابق`);
    if (notFoundCount > 0) parts.push(`⚠️ ${notFoundCount} غير موجود`);
    window.showToast(
      parts.join(" | "),
      notFoundCount > 0 ? "warning" : "success",
      8000,
    );

    if (typeof closeBulkPriceUpdateModal === "function")
      closeBulkPriceUpdateModal();

    // يفضل تحديث الواجهة بعد الانتهاء
    setTimeout(() => {
      if (typeof window.refreshAllData === "function") window.refreshAllData();
    }, 1000);
  } else if (notFoundCount > 0 && updateCount === 0) {
    window.showToast(
      `⚠️ لم يتم تحديث أي شيء! ${notFoundCount} صنف غير موجود - تأكد من تطابق الأسماء/الأكواد`,
      "warning",
      8000,
    );
  } else {
    window.showToast("البيانات متطابقة بالفعل ولا تحتاج لتحديث", "info", 5000);
  }
}

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
        "الحالة": Number(p.quantity || 0) <= 0 ? "⚠️ نفذت الكمية" : "🟠 كمية حرجة",
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
