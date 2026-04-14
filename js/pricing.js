
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
window.getEffectivePrice = function (product, unitType = 'bag') {
  if (!product) return 0;
  const prices = product.prices || {};
  // توافق مع النظام القديم إذا لم توجد خريطة أسعار
  if (!product.prices) {
      if (unitType === 'retail' || unitType === 'bag') return Number(product.retailPrice || product.price || 0);
      return Number(product.price || 0);
  }
  return Number(prices[unitType]) || 0;
};

/* ============================================================
   3. عرض بطاقة السعر المزدوج داخل كارت المنتج
   ============================================================ */
window.renderPriceBlock = function (product) {
  const prices = product.prices || { bag: product.price || 0 };
  const units = product.availableUnits || { bag: true };
  
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

  return `
    <div class="price-block flex flex-wrap gap-1 mt-2" data-product-id="${product.id}">
      ${Object.keys(unitLabels).map(unitKey => {
        if (!units[unitKey] || !prices[unitKey]) return '';
        const isActive = unitKey === 'bag'; // افتراضياً الكيس هو النشط
        return `
          <button
            class="unit-selector-btn ${isActive ? 'active-unit' : ''} border px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
            onclick="updateProductUnitSelection('${product.id}', '${unitKey}', ${prices[unitKey]}, event)"
          >
            <i data-lucide="${unitLabels[unitKey].icon}" class="w-3 h-3"></i>
            ${unitLabels[unitKey].label}: ${Number(prices[unitKey] || 0).toFixed(2)} <span class="currency-shic">EGP</span>
          </button>
        `;
      }).join('')}
    </div>`;
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
  
  return { 
    price: prices.bag || Object.values(prices).find(v => v > 0) || 0, 
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
