
/**
 * pricing.js — نظام التسعير المزدوج (جملة / قطعة)
 * يدير خيار السعر بالجملة وبالقطعة لكل منتج في الموقع
 */

/* ============================================================
   1. الحالة العامة لنوع السعر المختار
   ============================================================ */
// القيم المحتملة: 'wholesale' | 'retail'
// تم التحديث ليكون الاختيار لكل منتج بشكل مستقل عبر state محلي أو سمات الـ DOM

/* ============================================================
   2. حساب السعر الفعلي للمنتج بحسب الوضع الحالي
   ============================================================ */
window.cleanNumber = function(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  // تحويل الأرقام العربية/الفارسية وتنظيف الفواصل والرموز
  let str = String(val).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
                       .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  let cleaned = str.replace(/[^\d.-]/g, '').trim();
  let res = parseFloat(cleaned);
  return isNaN(res) ? 0 : res;
};

window.getEffectivePrice = function (product, unitType = 'bag') {
  if (!product) return 0;
  const prices = product.prices || {};
  // توافق مع النظام القديم إذا لم توجد خريطة أسعار
  if (!product.prices) {
      if (unitType === 'retail' || unitType === 'bag') 
          return window.cleanNumber(product.retailPrice || product.price || 0);
      return window.cleanNumber(product.price || 0);
  }
  let val = window.cleanNumber(prices[unitType]);
  // إذا كان سعر الوحدة المختارة 0، نستخدم السعر الأساسي كاحتياطي
  return val > 0 ? val : window.cleanNumber(product.price || 0);
};

/* ============================================================
   3. عرض بطاقة السعر المزدوج داخل كارت المنتج
   ============================================================ */
window.renderPriceBlock = function (product) {
  // دمج الأسعار القديمة والجديدة لضمان عدم ظهور أصفار إذا كانت البيانات ناقصة
  const pRef = product || { prices: {} };
  // التأكد من تحويل كائن الأسعار بالكامل لأرقام نظيفة
  const prices = {};
  if (pRef.prices) Object.keys(pRef.prices).forEach(k => prices[k] = window.cleanNumber(pRef.prices[k]));
  
  const basePrice = window.cleanNumber(pRef.price || pRef.retailPrice || 0);

  // إذا كان سعر الكيس 0 أو غير موجود، نستخدم السعر الأساسي للمنتج كاحتياطي
  if ((!prices.bag || prices.bag === 0) && basePrice > 0) {
    prices.bag = basePrice;
  }
  
  // تأمين وجود وحدات للعرض - إذا توفر سعر للكيس نظهر الوحدة فوراً
  const units = pRef.availableUnits ? { ...pRef.availableUnits } : {};
  if (prices.bag > 0) units.bag = true;
  
  const unitLabels = {
    bag: { label: 'كيس & شنطة', icon: 'package' },
    piece: { label: 'قطعة', icon: 'hash' },
    box: { label: 'علبة', icon: 'archive' },
    carton: { label: 'كرتونة', icon: 'layers' },
    shrink: { label: 'شرنك', icon: 'grid' },
    bundle: { label: 'رابطة (Bundle)', icon: 'grip-vertical' },
    bucket: { label: 'جردل', icon: 'shopping-basket' },
    tin: { label: 'صفيحة', icon: 'box' }
  };

  const html = Object.keys(unitLabels).map(unitKey => {
    const pVal = prices[unitKey] || 0;
    // إظهار الوحدة فقط إذا كانت مفعلة ولها سعر أكبر من صفر
    if (!units[unitKey] || pVal <= 0) return '';

    const isActive = unitKey === 'bag'; // افتراضياً الكيس هو النشط
    return `
      <button
        class="unit-selector-btn ${isActive ? 'active-unit bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white text-slate-700 border-slate-200'} border px-2 py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all flex items-center gap-1.5 hover:border-[#1B4332] shadow-sm grow justify-center touch-manipulation"
        onclick="updateProductUnitSelection('${product.id}', '${unitKey}', ${pVal}, event)"
      >
        <i data-lucide="${unitLabels[unitKey].icon}" class="w-4 h-4 sm:w-5 sm:h-5"></i>
        <div class="flex flex-col items-start leading-tight">
          <span class="text-[8px] sm:text-[9px] opacity-70">${unitLabels[unitKey].label}</span>
          <span class="text-sm sm:text-base font-bold">${pVal.toFixed(2)} <span class="text-[8px] ${isActive ? 'text-white/80' : 'text-emerald-600'}">EGP</span></span>
        </div>
      </button>
    `;
  }).join('');

  // إذا لم يتم توليد أي أزرار أو كان السعر الظاهر "صفر" - نظهر السعر الأساسي كخيار أخير
  if (!html || html.trim() === "" || Object.values(prices).every(v => v <= 0)) {
    // إذا لم تكن هناك وحدات مفعلة، نظهر السعر الأساسي للمنتج بشكل بارز جداً
    const finalDisplayPrice = basePrice > 0 ? basePrice : 0;
    return `<div class="flex items-center justify-between bg-emerald-50/80 p-3.5 rounded-2xl border border-emerald-200 w-full shadow-inner">
              <span class="text-xs font-black text-[#1B4332]">سعر المنتج:</span>
              <p class="font-black text-[#1B4332] text-2xl tracking-tighter">${Number(finalDisplayPrice).toFixed(2)} <span class="currency-shic text-xs">EGP</span></p>
            </div>`;
  }

  return `<div class="price-block flex flex-wrap gap-2 mt-2" data-product-id="${product.id}">${html}</div>`;
};

window.updateProductUnitSelection = function(productId, unitKey, price, event) {
    if(event) event.stopPropagation();
    
    // تحديث شكل الأزرار
    const container = document.querySelector(`.price-block[data-product-id="${productId}"]`);
    if(container) {
        container.querySelectorAll('.unit-selector-btn').forEach(btn => btn.classList.remove('active-unit', 'bg-emerald-600', 'text-white'));
        event.currentTarget.classList.add('active-unit', 'bg-emerald-600', 'text-white');
    }

    // تحديث بيانات زر "أضف للسلة" المخفي أو المرتبط
    const product = window.products.find(p => p.id === productId);
    const addBtn = document.querySelector(`.add-to-cart-btn[data-id="${productId}"]`);
    if(addBtn && product) {
        addBtn.setAttribute('data-selected-unit', unitKey);
        addBtn.setAttribute('data-selected-price', price);
        addBtn.onclick = () => window.addToCart(product.id, product.name, price, unitKey);
    }
};

/* ============================================================
   5. حقول إضافة / تعديل المنتج
   ============================================================ */
window.getPricingFieldsHTML = function (product) {
  const pPrices = product?.prices || {};
  const prices = {
    bag: pPrices.bag || '',
    piece: pPrices.piece || product?.price || '',
    box: pPrices.box || '',
    carton: pPrices.carton || '',
    shrink: pPrices.shrink || '',
    bundle: pPrices.bundle || '',
    bucket: pPrices.bucket || '',
    tin: pPrices.tin || ''
  };

  const sku       = product ? (product.sku || '') : '';
  const qty       = product ? (product.quantity || 0) : 0;
  const min       = product ? (product.minThreshold || 5) : 5;

  return `
    <div class="grid grid-cols-1 gap-3 mb-3">
      <div>
        <label class="text-[11px] font-bold text-slate-500 mb-1.5 block">الكود / SKU</label>
        <input type="text" id="p-sku" value="${sku}" placeholder="مثال: SH-1001" 
               class="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:border-emerald-500 font-mono text-xs" />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-3">
      <div>
        <label class="text-[11px] font-bold text-slate-500 mb-1.5 block">الكمية المتوفرة</label>
        <input type="number" id="p-qty" value="${qty}" class="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:border-emerald-500 font-semibold" />
      </div>
      <div>
        <label class="text-[11px] font-bold text-slate-500 mb-1.5 block">حد الطلب (تنبيه نقص)</label>
        <input type="number" id="p-min" value="${min}" class="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-transparent focus:border-red-400 font-semibold" />
      </div>
    </div>

    <div class="bg-slate-50 p-4 rounded-[2rem] border border-slate-100 mb-3">
      <p class="text-[10px] font-black text-slate-400 mb-3 uppercase tracking-wider">أسعار الوحدات (EGP)</p>
      <div class="grid grid-cols-2 gap-3">
        ${[
          { id: 'bag', label: 'كيس & شنطة', icon: 'package' },
          { id: 'piece', label: 'قطعة', icon: 'hash' },
          { id: 'box', label: 'علبة', icon: 'archive' },
          { id: 'carton', label: 'كرتونة', icon: 'layers' },
          { id: 'shrink', label: 'شرنك', icon: 'grid' },
          { id: 'bundle', label: 'رابطة (Bundle)', icon: 'grip-vertical' },
          { id: 'bucket', label: 'جردل', icon: 'shopping-basket' },
          { id: 'tin', label: 'صفيحة', icon: 'box' }
        ].map(u => `
          <div>
            <label class="text-[10px] font-bold text-slate-500 mb-1 block">${u.label}</label>
            <div class="relative">
              <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300">
                <i data-lucide="${u.icon}" class="w-3.5 h-3.5"></i>
              </span>
              <input type="number" id="p-price-${u.id}" value="${prices[u.id]}" placeholder="0.00" step="0.01" 
                     class="w-full p-2.5 pr-8 bg-white rounded-xl border border-slate-200 outline-none focus:border-emerald-500 text-xs font-bold" dir="ltr" />
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <p class="text-[10px] text-slate-400 -mt-1">
      💡 أدخل السعر أمام الوحدة التي تود تفعيلها لهذا المنتج فقط.
    </p>`;
};

/* ============================================================
   6. قراءة سعر الجملة والقطعة من نموذج إضافة/تعديل المنتج
   ============================================================ */
window.getPricingValues = function () {
  const prices = {
    bag: Number(document.getElementById('p-price-bag')?.value || 0),
    piece: Number(document.getElementById('p-price-piece')?.value || 0),
    box: Number(document.getElementById('p-price-box')?.value || 0),
    carton: Number(document.getElementById('p-price-carton')?.value || 0),
    shrink: Number(document.getElementById('p-price-shrink')?.value || 0),
    bundle: Number(document.getElementById('p-price-bundle')?.value || 0),
    bucket: Number(document.getElementById('p-price-bucket')?.value || 0),
    tin: Number(document.getElementById('p-price-tin')?.value || 0),
  };

  const sku       = document.getElementById('p-sku')?.value || '';
  const quantity  = Number(document.getElementById('p-qty')?.value || 0);
  const minThreshold = Number(document.getElementById('p-min')?.value || 5);
  
  // دالة ذكية لجلب السعر الرئيسي للمنتج (كيس أولاً ثم أي وحدة أخرى)
  const mainPrice = window.cleanNumber(prices.bag || Object.values(prices).find(v => v > 0) || 0);

  return {
    price: mainPrice, 
    prices,
    availableUnits: {
      bag: !!prices.bag, piece: !!prices.piece, box: !!prices.box, 
      carton: !!prices.carton, shrink: !!prices.shrink, bundle: !!prices.bundle,
      bucket: !!prices.bucket, tin: !!prices.tin
    },
    sku,
    quantity,
    minThreshold,
    status: quantity > 0 ? 'available' : 'out_of_stock'
  };
};

/* ============================================================
   7. إدراج حقول التسعير في نافذة المنتج عند الفتح
   ============================================================ */
window.injectPricingFields = function (product) {
  // البحث عن مكان الحقل القديم في نموذج الإضافة/التعديل
  const oldContainer = document.getElementById('pricing-fields-container');
  if (!oldContainer) return;
  oldContainer.innerHTML = window.getPricingFieldsHTML(product || null);
  if (window.lucide) lucide.createIcons();
};

/* ============================================================
   8. CSS المدمج — يُضاف ديناميكياً *مرة واحدة*
   ============================================================ */
(function injectPricingCSS() {
  if (document.getElementById('pricing-styles')) return;
  const style = document.createElement('style');
  style.id = 'pricing-styles';
  style.textContent = `
    /* تحسين اللمس للهواتف */
    .unit-selector-btn {
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    /* --- بطاقة السعر المزدوج --- */
    .price-block {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    /* سعر واحد فقط (بدون كيس) */
    .price-tag.wholesale-only {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
      border-radius: 10px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 800;
    }
    .price-tag.wholesale-only .currency { font-size: 9px; opacity: .8; }
    .price-tag.wholesale-only .unit-label { font-size: 9px; color: #6b7280; margin-right: 2px; }

    /* أزرار الجملة / القطعة */
    .price-mode-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 4px 9px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      border: 1.5px solid #e2e8f0;
      background: #f8fafc;
      color: #64748b;
      transition: all .15s ease;
      line-height: 1;
    }
    .price-mode-btn:hover {
      border-color: #1B4332;
      color: #1B4332;
      background: #f0fdf4;
    }
    .unit-selector-btn.active-unit {
      background: #1B4332 !important;
      color: #ffffff !important;
      border-color: #1B4332 !important;
      box-shadow: 0 4px 12px rgba(27,67,50,0.2);
    }
    .price-mode-btn.active-mode {
      background: #1B4332;
      color: #ffffff;
      border-color: #1B4332;
      box-shadow: 0 2px 8px rgba(27,67,50,.3);
    }
    .price-mode-btn .currency {
      font-size: 9px;
      opacity: .8;
    }

    /* لافتة السعرين في كارت المنتج */
    .product-price-wrapper { position: relative; }
    .dual-price-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      background: linear-gradient(135deg, #1B4332, #2D6A4F);
      color: white;
      font-size: 8px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 6px;
      letter-spacing: .5px;
      z-index: 5;
    }
    .currency-shic {
      font-family: serif;
      font-weight: 900;
      font-style: italic;
      margin-right: 2px;
      color: #1B4332;
    }
  `;
  document.head.appendChild(style);
})();
