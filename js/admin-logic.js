/**
 * admin-logic.js: نظام إدارة المخزن والتحديث الشامل عبر إكسل
 */

// دالة لتنظيف النصوص العربية للمطابقة الدقيقة (تجاهل الهمزات والتاء المربوطة والمسافات)
function normalizeArabic(text) {
  if (!text) return "";
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " "); // تحويل المسافات المتعددة لمسافة واحدة
}

// دالة ذكية للبحث عن قيمة داخل الكائن (Row) بناءً على جزء من اسم العمود
function findValByParts(obj, parts) {
  const keys = Object.keys(obj);
  // البحث عن مفتاح يحتوي على الكلمة المطلوبة
  for (const part of parts) {
    const foundKey = keys.find((k) => k.trim().includes(part));
    if (
      foundKey &&
      obj[foundKey] !== undefined &&
      String(obj[foundKey]).trim() !== ""
    ) {
      return obj[foundKey];
    }
  }
  // إذا لم يجد، يبحث في الأعمدة الفارغة (__EMPTY) إذا كانت تحتوي على بيانات ربما بسبب ترحيل الأعمدة
  const emptyKeys = keys.filter((k) => k.startsWith("__EMPTY")).reverse();
  if (parts.includes("كود") || parts.includes("SKU"))
    return obj[emptyKeys[0]] || ""; // الكود غالباً في آخر الأعمدة المكتوبة
  return "";
}

// دالة لمعالجة الأرقام التي تحتوي على فواصل (مثل 2,025.00) لضمان قراءتها بشكل صحيح
function parseExcelNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, "").trim();
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

  const pricing = window.getPricingValues ? window.getPricingValues() : {};
  const categoryObj = window.categories.find((c) => c.id === categoryId);

  const data = {
    name,
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
    .join("");

  // زر إضافة منتج في البداية
  const addBtn = `<button onclick="openProductModal()" class="col-span-full border-2 border-dashed border-slate-200 p-4 rounded-2xl text-slate-400 font-bold text-sm hover:border-emerald-500 hover:text-emerald-500 transition-all">+ إضافة منتج جديد</button>`;
  list.innerHTML = addBtn + html;
  if (window.lucide) lucide.createIcons();
}

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
  if (tab === "p" && typeof window.renderAdminProducts === "function")
    window.renderAdminProducts();
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

  // معاينة التغييرات قبل الحفظ (يمكنك تفعيل مودال هنا)
  if (
    confirm(`تم العثور على ${rows.length} صنف. هل تريد البدء في تحديث الموقع؟`)
  ) {
    await processBulkProducts(rows);
  }
}
window.handleBulkFileUpload = handleBulkFileUpload;

async function processBulkProducts(rows) {
  let batch = window.firestoreUtils.writeBatch(window.db);
  const productsRef = window.firestoreUtils.collection(
    window.db,
    "artifacts",
    window.appId,
    "public",
    "data",
    "products",
  );

  let updated = 0;
  let created = 0;

  for (const row of rows) {
    try {
      // تنظيف رؤوس الأعمدة من المسافات المخفية
      const r = {};
      Object.keys(row).forEach((k) => (r[k.trim()] = row[k]));

      // البحث بذكاء عن الأعمدة المطلوبة
      const sku = String(findValByParts(r, ["كود", "SKU", "الكود"])).trim();
      const name = String(findValByParts(r, ["صنف", "اسم", "البيان", "Name"])).trim();
      if (!name) continue;

      const wholesalePrice = parseExcelNumber(findValByParts(r, ["جملة", "Wholesale", "سعر"]));
      const bundlePrice = parseExcelNumber(findValByParts(r, ["شرنك", "Bundle", "سعر الشرنك"]));
      const cartonPrice = parseExcelNumber(findValByParts(r, ["كرتونة", "Carton", "سعر الكرتونة"]));

      const normName = normalizeArabic(name);
      let existing = window.products.find(
        (p) =>
          (sku &&
            p.sku &&
            String(p.sku).trim().toLowerCase() === sku.toLowerCase()) ||
          (p.name && normalizeArabic(p.name) === normName),
      );

      const genericPrice = parseExcelNumber(r.Price || r["السعر"] || r["سعر"] || r["سعر البيع"] || 0);
      const piecePrice = parseExcelNumber(r["سعر الكيس"] || r["سعر كيس"] || 0) || genericPrice;
      const totalStock = parseExcelNumber(r.Stock || r["المخزون"] || r["مخزون"] || r.Quantity || r["الكمية"] || r["الكميه"] || 0);

      const productData = {
        name: name,
        sku: sku,
        price: piecePrice,
        prices: {
          bag: piecePrice,
          tin: parseExcelNumber(r[" الكيس سعر "] || r["سعر الكيس"] || 0),
          box: parseExcelNumber(r["سعر العلبة"] || r["سعر علبة"] || 0),
          carton: parseExcelNumber(r["سعر الكرتونة"] || r["سعر كرتونة"] || 0),
          shrink: parseExcelNumber(r["سعر الشرنك"] || r["سعر شرنك"] || 0),
          bucket: parseExcelNumber(r["سعر الجردل"] || r["سعر جردل"] || 0),
          tin: parseExcelNumber(r["سعر الصفيحة"] || r["سعر صفيحة"] || 0),
          
          
        },
        availableUnits: {
          bag: !!piecePrice,
          tin: parseExcelNumber(r[" الكيس سعر "] || r["سعر الكيس"] || 0),
          box: !!(r["سعر العلبة"] || r["سعر علبة"]),
          carton: !!(r["سعر الكرتونة"] || r["سعر كرتونة"]),
          shrink: !!(r["سعر الشرنك"] || r["سعر شرنك"]),
          bucket: !!(r["سعر الجردل"] || r["سعر جردل"]),
          tin: !!(r["سعر الصفيحة"] || r["سعر صفيحة"]),
        },
        quantity: totalStock,
        unitMeasurement: String(r.Unit || r["التعبئة"] || r["حجم"] || r["وزن"] || r["كمية الوحدة"] || "").trim(),
        category: String(r.Category || r["القسم"] || r["اسم المجموعه"] || r["المجموعة"] || r["التصنيف"] || "عام").trim(),
        minThreshold: Number(r.MinStock || r["حد النواقص"] || 5),
        updatedAt: window.firestoreUtils.serverTimestamp(),
        status: deriveStatus(
          totalStock,
          Number(r.MinStock || r["حد النواقص"] || 5),
        ),
      };

      if (existing) {
        const docRef = window.firestoreUtils.doc(productsRef, existing.id);
        batch.update(docRef, productData);
        updated++;
      } else {
        const newDocRef = window.firestoreUtils.doc(productsRef);
        batch.set(newDocRef, productData);
        created++;
      }

      // Firestore batch limit is 500 operations
      if ((updated + created) % 500 === 0) {
        await batch.commit();
        batch = window.firestoreUtils.writeBatch(window.db);
      }
    } catch (err) {
      console.error("Error processing row:", row, err);
      continue; // تخطي السطر الذي يحتوي على خطأ والاستمرار في الباقي
    }
  }

  await batch.commit();
  window.showToast(
    `تم التحديث بنجاح: ${updated} تعديل، ${created} إضافة جديدة`,
    "success",
  );
}

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
        window.lastUploadedRows = null;
    }
}
window.closeBulkImportModal = closeBulkImportModal;

// معالجة وحفظ المنتجات المفلترة بالكلمات المفتاحية
export async function saveBulkProducts() {
    const keywords = document.getElementById("bulk-keywords").value.split(",").map(k => normalizeArabic(k)).filter(Boolean);
    const sheetDataText = document.getElementById("bulk-sheet-data").value.trim();
    const unit = document.getElementById("bulk-unit").value;
    const quantities = document.getElementById("bulk-quantities").value;
    
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
    if (keywords.length === 0) return window.showToast("يرجى إدخال كلمات مفتاحية للفلترة", "warning");

    // تصفية الصفوف بناءً على الكلمات المفتاحية
    const filteredRows = rows.filter(row => {
        // تنظيف اسم المنتج وتوحيد الحروف
        const nameNormalized = normalizeArabic(findValByParts(row, ["صنف", "اسم", "البيان", "Name"]));
        // تقسيم الاسم إلى كلمات بناءً على المسافات وعلامات الترقيم العربية والأجنبية
        const words = nameNormalized.split(/[\s،,._/-]+/);
        // التأكد من أن الكلمة المفتاحية موجودة ككلمة كاملة مستقلة
        return keywords.some(k => words.includes(k));
    });

    if (filteredRows.length === 0) return window.showToast("لم يتم العثور على أصناف مطابقة للكلمات المفتاحية", "warning");

    if (confirm(`تم العثور على ${filteredRows.length} صنف مطابق. هل تريد إضافتهم الآن؟`)) {
        window.showNotification("جاري معالجة الأصناف المختارة...");
        
        // تعديل البيانات لتشمل الوحدة والكميات المحددة في المودال قبل الإرسال
        const rowsToProcess = filteredRows.map(r => {
            const rowCleaned = {};
            Object.keys(r).forEach(k => rowCleaned[k.trim()] = r[k]);
            
            // التأكد من وجود الأعمدة الأساسية
            const sku = String(findValByParts(rowCleaned, ["كود", "SKU", "الكود"])).trim();
            const name = String(findValByParts(rowCleaned, ["صنف", "اسم", "البيان", "Name"])).trim();
            const price = parseExcelNumber(findValByParts(rowCleaned, ["سعر", "Price", "جملة"]));
            const qty = parseExcelNumber(findValByParts(rowCleaned, ["كمية", "Stock", "الكمية", "مخزون"]));

            return {
                ...rowCleaned,
                "Name": name,
                "SKU": sku,
                "Price": price,
                "Quantity": qty,
                "Unit": unit,
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
            <span class="text-[10px] font-bold text-emerald-700">كيس: ${p.prices?.bag || 0} ج.م</span>
            <span class="text-[10px] font-bold text-blue-700">كرتونة: ${p.prices?.carton || 0} ج.م</span>
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
  const selects = ["p-cat", "bulk-price-cat"];
  const options = (window.categories || [])
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  selects.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const defaultText =
        id === "p-cat"
          ? "-- القسم التابع له--"
          : "-- كل الأقسام (تحديث شامل) --";
      el.innerHTML = `<option value="">${defaultText}</option>${options}`;
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

    if (rows.length === 0) return window.showToast("الملف فارغ", "error");

    const textLines = rows
      .map((row) => {
        // تنظيف الكائن Row
        const r = row;

        // استخدام البحث الذكي عن الأعمدة
        const sku = String(findValByParts(r, ["كود", "SKU", "طلبية"])).trim();
        const name = String(
          findValByParts(r, ["صنف", "اسم", "البيان", "Name"]),
        ).trim();

        const rawPrice = findValByParts(r, ["سعر", "Price", "جملة"]);
        const price =
          typeof rawPrice === "string" ? rawPrice.replace(/,/g, "") : rawPrice;
        const cat = String(
          findValByParts(r, ["قسم", "مجموعة", "Category"]),
        ).trim();

        const identifier = sku || name;
        if (!identifier || price === "") return null;
        return `${identifier}|${price}${cat ? "|" + cat : ""}`;
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
  if (catId) {
    const cat = window.categories.find((c) => c.id === catId);
    if (cat) targetCategoryName = normalizeArabic(cat.name);
  }

  let batch = window.firestoreUtils.writeBatch(window.db);
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

  // الحالة الأولى: تحديث عبر النص الملصق أو الملف المرفوع
  if (rawData) {
    const lines = rawData.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const parts = line
        .split(/[\t|,]|\s{2,}/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length < 2) continue;

      const identifier = normalizeArabic(parts[0]);
      const rawPrice = String(parts[1]).replace(/[^0-9.]/g, ""); // تنظيف السعر من أي رموز غير رقمية
      const priceVal = parseFloat(rawPrice);
      if (isNaN(priceVal) || priceVal <= 0) continue; // تجاهل الأسعار الصفرية أو الخاطئة

      // البحث عن المنتج بالكود أو الاسم
      const p = products.find(
        (x) =>
          (x.sku && normalizeArabic(x.sku) === identifier) ||
          (x.name && normalizeArabic(x.name) === identifier),
      );

      if (p) {
        const pCat = normalizeArabic(p.category || "");
        if (targetCategoryName && pCat !== targetCategoryName) continue;

        const finalPrice =
          percentage !== 0 ? priceVal * (1 + percentage / 100) : priceVal;
        const updatedPrice = Number(finalPrice.toFixed(2));

        batch.update(window.firestoreUtils.doc(productsRef, p.id), {
          price: Number(updatedPrice.toFixed(2)),
          "prices.bag": Number(updatedPrice.toFixed(2)), // تحديث سعر الكيس في النظام الجديد أيضاً
        });
        updateCount++;

        if (updateCount % 500 === 0) {
          await batch.commit();
          batch = window.firestoreUtils.writeBatch(window.db);
        }
      } else {
        notFoundCount++;
      }
    }
  }

  if (updateCount > 0) {
    window.showNotification("جاري حفظ الأسعار...");
    await batch.commit();
    const statusType = notFoundCount > 0 ? "warning" : "success";
    const message =
      notFoundCount > 0
        ? `تم تحديث ${updateCount} سعر. (تنبيه: ${notFoundCount} صنف لم يتم العثور عليهم)`
        : `تم تحديث ${updateCount} سعر بنجاح`;
    window.showToast(message, statusType);
    closeBulkPriceUpdateModal();
  } else {
    window.showToast("لم يتم العثور على منتجات مطابقة لتحديثها", "warning");
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

ى
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
