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
    const foundKey = keys.find(k => k.trim().includes(part));
    if (foundKey && obj[foundKey] !== undefined && String(obj[foundKey]).trim() !== "") {
      return obj[foundKey];
    }
  }
  // إذا لم يجد، يبحث في الأعمدة الفارغة (__EMPTY) إذا كانت تحتوي على بيانات ربما بسبب ترحيل الأعمدة
  const emptyKeys = keys.filter(k => k.startsWith('__EMPTY')).reverse();
  if (parts.includes("كود") || parts.includes("SKU")) return obj[emptyKeys[0]] || ""; // الكود غالباً في آخر الأعمدة المكتوبة
  return "";
}

// دالة لمعالجة الأرقام التي تحتوي على فواصل (مثل 2,025.00) لضمان قراءتها بشكل صحيح
function parseExcelNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// 0. التبديل بين التبويبات الفرعية في لوحة التحكم
export function showAdminSubTab(tab) {
  const tabs = ['p', 'c', 'o', 'i'];
  tabs.forEach(t => {
    const btn = document.getElementById(`admin-tab-${t}`);
    const list = document.getElementById(`admin-${t}-list`);
    if (btn) {
      // تنسيق الزر النشط
      const isActive = t === tab;
      btn.classList.toggle('bg-white', isActive);
      btn.classList.toggle('shadow-sm', isActive);
      btn.classList.toggle('text-[#1B4332]', isActive);
      btn.classList.toggle('font-black', isActive);
      btn.classList.toggle('text-slate-500', !isActive);
      btn.classList.toggle('font-bold', !isActive);
    }
    if (list) list.classList.toggle('hidden', t !== tab);
  });

  // رندرة المحتوى بناءً على التبويب
  if (tab === 'i') renderInventoryAudit();
  if (tab === 'p' && typeof window.renderAdminProducts === 'function') window.renderAdminProducts();
  if (tab === 'c' && typeof window.renderAdminCategories === 'function') window.renderAdminCategories();
  
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
  if (confirm(`تم العثور على ${rows.length} صنف. هل تريد البدء في تحديث الموقع؟`)) {
    await processBulkProducts(rows);
  }
}

async function processBulkProducts(rows) {
  const batch = window.firestoreUtils.writeBatch(window.db);
  const productsRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "products");
  
  let updated = 0;
  let created = 0;

  for (const row of rows) {
    // تنظيف رؤوس الأعمدة من المسافات المخفية
    const r = {}; Object.keys(row).forEach(k => r[k.trim()] = row[k]);

    const sku = String(r.SKU || r["كود"] || r["الكود"] || "").trim();
    const name = String(r.Name || r["الاسم"] || r["اسم المنتج"] || r["الصنف"] || r["البيان"] || r["اسم الصنف"] || "").trim();
    if (!name) continue;

    // منطق البحث عن منتج موجود (بالكود أو الاسم)
    const normName = normalizeArabic(name);
    let existing = window.products.find(p => 
      (sku && p.sku && String(p.sku).trim().toLowerCase() === sku.toLowerCase()) || 
      (p.name && normalizeArabic(p.name) === normName)
    );
    
    const productData = {
      name: name,
      sku: sku,
      prices: {
        piece: parseExcelNumber(r["سعر القطعة"] || r["سعر قطعة"] || 0),
        box: parseExcelNumber(r["سعر العلبة"] || r["سعر علبة"] || 0),
        carton: parseExcelNumber(r["سعر الكرتونة"] || r["سعر كرتونة"] || 0),
        bundle: parseExcelNumber(r["سعر الربطة"] || r["سعر ربطة"] || 0)
      },
      availableUnits: {
        piece: !!(r["سعر القطعة"]),
        box: !!(r["سعر العلبة"]),
        carton: !!(r["سعر الكرتونة"]),
        bundle: !!(r["سعر الربطة"])
      },
      quantity: parseExcelNumber(r.Quantity || r["الكمية"] || r["الكميه"] || 0),
      category: r.Category || r["القسم"] || r["اسم المجموعه"] || "عام",
      minThreshold: Number(row.MinStock || 5),
      updatedAt: window.firestoreUtils.serverTimestamp(),
      status: deriveStatus(parseExcelNumber(r.Quantity || 0), Number(row.MinStock || 5))
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
  }

  await batch.commit();
  window.showToast(`تم التحديث بنجاح: ${updated} تعديل، ${created} إضافة جديدة`, "success");
}

function deriveStatus(qty, min) {
    if (qty <= 0) return "out_of_stock";
    if (qty <= min) return "low_stock";
    return "available";
}

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

  products.sort((a,b) => (a.quantity || 0) - (b.quantity || 0)).forEach(p => {
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
          <p class="text-[10px] text-slate-400">SKU: ${p.sku || '---'}</p>
        </td>
        <td class="p-4">
          <div class="flex flex-col gap-1">
            <span class="text-[10px] font-bold text-emerald-700">ق: ${p.prices?.piece || 0} ج.م</span>
            <span class="text-[10px] font-bold text-blue-700">ك: ${p.prices?.carton || 0} ج.م</span>
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
  const modal = document.getElementById('bulk-price-update-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    updateCategorySelects();
  }
}

export function closeBulkPriceUpdateModal() {
  const modal = document.getElementById('bulk-price-update-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function updateCategorySelects() {
  const selects = ['p-cat', 'bulk-price-cat'];
  const options = (window.categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const defaultText = id === 'p-cat' ? '-- القسم التابع له--' : '-- كل الأقسام (تحديث شامل) --';
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

    const textLines = rows.map(row => {
      // تنظيف الكائن Row
      const r = row;

      // استخدام البحث الذكي عن الأعمدة
      const sku = String(findValByParts(r, ["كود", "SKU", "طلبية"])).trim();
      const name = String(findValByParts(r, ["صنف", "اسم", "البيان", "Name"])).trim();
      
      const rawPrice = findValByParts(r, ["سعر", "Price", "جملة"]);
      const price = typeof rawPrice === 'string' ? rawPrice.replace(/,/g, '') : rawPrice;
      const cat = String(findValByParts(r, ["قسم", "مجموعة", "Category"])).trim();
      
      const identifier = sku || name;
      if (!identifier || price === "") return null;
      return `${identifier}|${price}${cat ? '|' + cat : ''}`;
    }).filter(Boolean);

    document.getElementById('bulk-price-data').value = textLines.join('\n');
    window.showToast(`تم استخراج ${textLines.length} صنف بنجاح`, "success");
  } catch (e) {
    window.showToast("خطأ في قراءة ملف الإكسل، تأكد من الصيغة", "error");
  }
}

// حفظ تحديثات الأسعار في قاعدة البيانات
export async function saveBulkPriceUpdates() {
  const catId = document.getElementById('bulk-price-cat').value;
  const percentage = parseFloat(document.getElementById('bulk-price-percentage').value || 0);
  const rawData = document.getElementById('bulk-price-data').value.trim();
  
  const products = window.products || [];
  let targetCategoryName = "";
  if (catId) {
    const cat = window.categories.find(c => c.id === catId);
    if (cat) targetCategoryName = normalizeArabic(cat.name);
  }

  const batch = window.firestoreUtils.writeBatch(window.db);
  const productsRef = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "products");
  let updateCount = 0;
  let notFoundCount = 0;

  // الحالة الأولى: تحديث عبر النص الملصق أو الملف المرفوع
  if (rawData) {
    const lines = rawData.split('\n');
    lines.forEach(line => {
      // تحسين: دعم التقسيم بالتاب (النسخ من إكسل)، الفاصلة، أو الخط الرأسي
      const parts = line.split(/[\t|,]|\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) return;

      const identifier = normalizeArabic(parts[0]);
      // تنظيف السعر من الفواصل قبل التحويل في حالة اللصق اليدوي
      const priceVal = parseFloat(String(parts[1]).replace(/,/g, ''));
      if (isNaN(priceVal)) return;

      // البحث عن المنتج بالكود أو الاسم
      const p = products.find(x => 
        (x.sku && normalizeArabic(x.sku) === identifier) || 
        (x.name && normalizeArabic(x.name) === identifier)
      );

      if (p) {
        const pCat = normalizeArabic(p.category || "");
        if (targetCategoryName && pCat !== targetCategoryName) return;
        
        const finalPrice = percentage !== 0 ? priceVal * (1 + percentage / 100) : priceVal;
        const updatedPrice = Number(finalPrice.toFixed(2));
        
        batch.update(window.firestoreUtils.doc(productsRef, p.id), { 
          price: updatedPrice,
          "prices.piece": updatedPrice // تحديث سعر القطعة في النظام الجديد أيضاً
        });
        updateCount++;
      } else {
        notFoundCount++;
      }
    });
  }

  if (updateCount > 0) {
    window.showNotification("جاري حفظ الأسعار...");
    await batch.commit();
    const statusType = notFoundCount > 0 ? "warning" : "success";
    const message = notFoundCount > 0 ? `تم تحديث ${updateCount} سعر. (تنبيه: ${notFoundCount} صنف لم يتم العثور عليهم)` : `تم تحديث ${updateCount} سعر بنجاح`;
    window.showToast(message, statusType);
    closeBulkPriceUpdateModal();
  } else {
    window.showToast("لم يتم العثور على منتجات مطابقة لتحديثها", "warning");
  }
}

// 3. تصدير تقرير النواقص إلى ملف إكسل
window.exportShortageReport = function() {
  const products = window.products || [];
  const shortage = products
    .filter(p => (p.quantity || 0) <= (p.minThreshold || 5))
    .map(p => ({
      "الاسم": p.name,
      "الكود (SKU)": p.sku || "",
      "الكمية الحالية": p.quantity || 0,
      "حد الطلب": p.minThreshold || 5,
      "الحالة": (p.quantity || 0) <= 0 ? "نفذت" : "حرجة"
    }));

  if (shortage.length === 0) {
    return window.showToast("لا توجد نواقص لتصديرها حالياً", "info");
  }

  const ws = XLSX.utils.json_to_sheet(shortage);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Shortage Report");
  
  const date = new Date().toLocaleDateString('ar-EG').replace(/\//g, '-');
  XLSX.writeFile(wb, `نواقص_أولاد_الشيخ_${date}.xlsx`);
};

window.updateProductQty = async (id) => {
  const newQty = Number(document.getElementById(`inline-qty-${id}`).value);
  await window.firestoreUtils.updateDoc(window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "products", id), { quantity: newQty });
  window.showNotification("تم تحديث الكمية");
};