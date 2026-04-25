// /**
//  * SheikhApp Chatbot Script
//  * المنطق الخاص ببوت المساعدة (هدى ويوسف)
//  */

// console.log('chatbot.js loaded.'); // رسالة لتأكيد تحميل السكريبت

// const HODA_BOT_IMAGE = 'img/download (1).png'; // صورة البنت
// const YOUSSEF_BOT_IMAGE = 'img/CALLB.png'; // صورة الولد

// window.getBotPersona = function() {
//     // جلب الجنس من بيانات المستخدم الحالية
//     const userGender = (window.currentUser && window.currentUser.gender) ? window.currentUser.gender.toLowerCase() : 'male';

//     if (userGender === 'male') {
//         return { name: 'يوسف', greeting: 'أنا يوسف هنا للمساعدة، ما هو استفسارك؟', image: YOUSSEF_BOT_IMAGE }; // إذا كان المستخدم ذكر، البوت يوسف
//     } else { // userGender is female or default
//         return { name: 'هدى', greeting: 'أنا هدى هنا للمساعدة، ما هو استفسارك؟', image: HODA_BOT_IMAGE }; // إذا كانت المستخدمة أنثى، البوت هدى
//     }
// };

// let chatbotOpen = false;

// window.toggleChatbot = function() {
//     const container = document.getElementById('chatbot-container');
//     const toggle = document.getElementById('chatbot-toggle');
//     chatbotOpen = !chatbotOpen;

//     if(chatbotOpen) {
//         // تحديث معلومات الشخصية عند الفتح
//         const persona = window.getBotPersona();
//         const nameElem = document.getElementById('chatbot-name');
//         const avatarElem = document.getElementById('chatbot-avatar');
//         if(nameElem) nameElem.innerText = persona.name;
//         if(avatarElem) avatarElem.innerHTML = `<img src="${persona.image}" class="w-full h-full object-cover">`;
//         if(window.lucide) lucide.createIcons(); // التأكد من رندرة الأيقونات الجديدة

//         container.classList.remove('hidden');
//         document.getElementById('chatbot-input').focus();
//         toggle.classList.add('scale-110');
//     } else {
//         container.classList.add('hidden');
//         toggle.classList.remove('scale-110');
//     }
// };

// window.sendChatMessage = function() {
//     const input = document.getElementById('chatbot-input');
//     const message = input.value.trim();
//     if(!message) return;

//     const messagesDiv = document.getElementById('chatbot-messages');
//     const userMsg = document.createElement('div');
//     userMsg.className = 'flex gap-3 justify-end animate-fade-in-up';
//     userMsg.innerHTML = `
//         <div class="bg-slate-800 text-white px-4 py-2 rounded-2xl rounded-tr-none text-sm max-w-[80%] font-semibold">${message}</div>
//         <div class="w-8 h-8 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">👤</div>
//     `;
//     messagesDiv.appendChild(userMsg);
//     input.value = '';
//     if(window.lucide) lucide.createIcons();
//     messagesDiv.scrollTop = messagesDiv.scrollHeight;

//     // تقليل الوقت لزيادة السرعة (100ms بدلاً من 300ms)
//     setTimeout(async () => {
//         const botPersona = window.getBotPersona();
//         const response = await window.getChatbotResponse(message, botPersona);
//         const botMsg = document.createElement('div');
//         botMsg.className = 'flex gap-3 animate-fade-in-up';
//         botMsg.innerHTML = `
//             <div class="w-8 h-8 bg-[#1B4332] text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm overflow-hidden">
//                 <img src="${botPersona.image}" alt="${botPersona.name}" class="w-full h-full object-cover">
//             </div>
//             <div class="bg-white border border-slate-200 text-slate-800 px-4 py-2 rounded-2xl rounded-tl-none text-sm max-w-[80%] font-semibold shadow-sm">${response}</div>
//         `;
//         messagesDiv.appendChild(botMsg);
//         if(window.lucide) lucide.createIcons();
//         messagesDiv.scrollTop = messagesDiv.scrollHeight;
//     }, 100);
// };

// window.getChatbotResponse = async function(userMessage, botPersona) {
//     const msg = userMessage.toLowerCase().trim();
//     const products = window.products || [];
//     const categories = window.categories || [];

//     // التحقق مما إذا كانت البيانات قد تم تحميلها
//     if (products.length === 0 && categories.length === 0) {
//         return `أهلاً بك! أنا ${botPersona.name}. يبدو أنني ما زلت أقوم بتحميل بيانات المنتجات والأقسام. يرجى المحاولة بعد قليل.`;
//     }

//     if(msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('كيف حالك') || msg.includes('اهلا') || msg === 'hi' || msg === 'hello') {
//         return botPersona.greeting;
//     }

//     // بحث سريع في المنتجات
//     const matchedProduct = products.find(p => p.name.toLowerCase().includes(msg) || (p.code && p.code.toLowerCase().includes(msg)));
//     if(matchedProduct) {
//         return `✨ وجدت! "${matchedProduct.name}"\n💰 السعر: ${matchedProduct.price} ج.م/${matchedProduct.unit || 'قطعة'}\nتريد إضافته للسلة؟ 🛒`;
//     }

//     // بحث عن قسم
//     const matchedCategory = categories.find(c => c.name.toLowerCase().includes(msg));
//     if (matchedCategory) {
//         const productsInCategory = products.filter(p => p.category && p.category.toLowerCase() === matchedCategory.name.toLowerCase());
//         if (productsInCategory.length > 0) {
//             return `لدينا ${productsInCategory.length} منتج في قسم "${matchedCategory.name}". هل تريد تصفحها؟`;
//         } else {
//             return `قسم "${matchedCategory.name}" موجود، لكن لا توجد منتجات فيه حالياً.`;
//         }
//     }

//     if(msg.includes('كم') && (msg.includes('منتج') || msg.includes('عدد'))) {
//         return `📊 لدينا ${products.length} منتجات في ${categories.length} أقسام!`;
//     }

//     if(msg.includes('تواصل') || msg.includes('رقم') || msg.includes('هاتف') || msg.includes('اتصل')) {
//         return `📞 يمكنك التواصل معنا عبر صفحة الحساب أو الاتصال بالدعم الفني مباشرة.`;
//     }

//     if(msg.includes('شحن') || msg.includes('توصيل') || msg.includes('مدة التوصيل')) {
//         return `🚚 التوصيل سريع جداً! سيصلك الطلب خلال 24 ساعة من تأكيده.`;
//     }

//     const defaultResponses = [
//         '🤔 لم أفهم جيداً! اسألني عن المنتجات أو الأسعار! 😊',
//         '💡 أنا هنا للمساعدة! جرب أن تسأل عن "توصيل" أو "رقم الهاتف".',
//         '🎯 هل تبحث عن منتج معين؟ اكتب اسمه فقط وسأبحث لك عنه.',
//         'ماذا يمكنني أن أفعل لك؟'
//     ];
//     return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
// };

// // تفعيل زر Enter للإرسال
// document.addEventListener('DOMContentLoaded', () => {
//     const chatInput = document.getElementById('chatbot-input');

//     if(chatInput) {
//         chatInput.addEventListener('keypress', (e) => {
//             if(e.key === 'Enter') window.sendChatMessage();
//         });
//     }
// });

/**
 * SheikhApp Chatbot Script - المطور
 * تم تحسين المنطق والردود مع الحفاظ على هيكلة الكود الأصلي
 */

/**
 * SheikhApp Chatbot Script - النسخة المصلحة والمطورة
 */
/**
 * SheikhApp Chatbot Script - Pro & Smart Version
 */

console.log("chatbot.js loaded.");

const HODA_BOT_IMAGE = "img/CALLB.png"; // هدى (صورة البنت)
const YOUSSEF_BOT_IMAGE = "img/download (1).png"; // يوسف (صورة الولد)
const CHAT_HISTORY_KEY = "sheikh_chat_history";

// دالة تحديد الشخصية (هدى أو يوسف)
window.getBotPersona = function () {
  const userGender =
    window.currentUser && window.currentUser.gender
      ? window.currentUser.gender.toLowerCase()
      : "male";

  // جلب اسم المستخدم إذا كان مسجلاً دخول، وإلا نستخدم مناداة عامة
  const userName = (window.currentUser && !window.currentUser.isAnonymous) 
    ? (window.currentUser.displayName || window.currentUser.name || "عزيزي") 
    : "عزيزي";

  if (userGender === "male") {
    return {
      name: "يوسف",
      greeting: `أهلاً بك يا ${userName}، أنا يوسف مساعدك الشخصي. كيف يمكنني خدمتك اليوم؟`,
      image: YOUSSEF_BOT_IMAGE,
    };
  } else {
    return {
      name: "هدى",
      greeting:
        `أهلاً بكِ يا ${userName}، أنا هدى مساعدتكِ الشخصية. كيف يمكنني مساعدتكِ الجميلة اليوم؟`,
      image: HODA_BOT_IMAGE,
    };
  }
};

let chatbotOpen = false;

// دالة فتح وإغلاق الشات
window.toggleChatbot = function () {
  const container = document.getElementById("chatbot-container");
  if (!container) return;
  chatbotOpen = !chatbotOpen;

  if (chatbotOpen) {
    const persona = window.getBotPersona();
    
    // تحديث الاسم والصورة في واجهة الشات عند الفتح
    const nameElem = document.getElementById("chatbot-name");
    const avatarElem = document.getElementById("chatbot-avatar");
    
    if (nameElem) nameElem.innerText = persona.name;
    if (avatarElem) avatarElem.innerHTML = `<img src="${persona.image}" class="w-full h-full object-cover">`;

    container.classList.remove("hidden");
    container.style.animation = "fadeInUp 0.3s ease-out";
    
    if (document.getElementById("chatbot-messages").childElementCount === 0) {
      window.loadChatHistory();
    }
  } else {
    container.classList.add("hidden");
  }
};

// دالة الإرسال الرئيسية (تم إصلاحها لتعمل 100%)
window.sendChatMessage = function () {
  const input = document.getElementById("chatbot-input");
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  // إظهار رسالة المستخدم
  appendMessage("أنت", message, "user");
  input.value = "";

  // إضافة تأثير "جاري الكتابة"
  showTyping();

  // رد البوت الذكي بعد تأخير بسيط ليظهر كأنه شخص حقيقي
  setTimeout(() => {
    removeTyping();
    const response = getSmartResponse(message);
    const persona = window.getBotPersona();
    appendMessage(persona.name, response, "bot");
  }, 800);
};

// محرك الرد الذكي - يرد على المنتجات، الأسعار، وأي شيء في الموقع
function getSmartResponse(msg) {
  const rawMsg = msg.trim();
  msg = rawMsg.toLowerCase();
  
  // 0. التحقق من الردود المخصصة أولاً (الأولوية القصوى)
  if (window.customChatbotResponses && window.customChatbotResponses.length > 0) {
      for (const qa of window.customChatbotResponses) {
          // إذا كانت أي من الكلمات المفتاحية موجودة في رسالة العميل
          if (qa.keywords.some(k => msg.includes(k))) {
              return qa.response;
          }
      }
  }

  const products = window.products || [];
  const categories = window.categories || [];
  const contactNumbers = "01033743734 أو 01063748966";

  const normMsg = window.normalizeArabic(msg);

  // 1. الترحيب
  if (
    normMsg.includes("سلام") ||
    normMsg.includes("هلا") ||
    normMsg.includes("مرحبا") ||
    normMsg.includes("اهلا") ||
    normMsg.includes("صباح") ||
    normMsg.includes("مساء")
  ) {
    return "أهلاً بك في مدينة أولاد الشيخ! 😊 أنا هنا لمساعدتك في الحصول على أفضل أسعار الجملة. هل تبحث عن منتج معين أم تود تصفح الأقسام؟";
  }

  // 2. البحث عن منتجات (بالاسم)
  const matchedProduct = products.find((p) => {
    const pName = window.normalizeArabic(p.name);
    return normMsg.includes(pName) || pName.includes(normMsg);
  });
  if (matchedProduct) {
    const price = matchedProduct.price || (matchedProduct.prices && matchedProduct.prices.bag) || 0;
    const unit = matchedProduct.unitMeasurement || matchedProduct.unit || "كيس";
    const text = `بخصوص "${matchedProduct.name}"، هو متوفر حالياً بسعر ${Number(price).toFixed(2)} ج.م للـ ${unit}. هل تود إضافته للسلة الآن؟ 🛒`;
    
    if (matchedProduct.img) {
      return `
        <div class="flex flex-col gap-2">
          <img src="${matchedProduct.img}" class="w-full h-32 object-contain rounded-xl bg-white border border-slate-100 shadow-sm">
          <p>${text}</p>
        </div>`;
    }
    return text;
  }

  // 3. البحث عن الأقسام
  const matchedCategory = categories.find((c) => {
    const cName = window.normalizeArabic(c.name);
    return normMsg.includes(cName) || cName.includes(normMsg);
  });
  if (matchedCategory) {
    const subProducts = products
      .filter((p) => p.category === matchedCategory.name)
      .slice(0, 3);
    let resp = `قسم "${matchedCategory.name}" متميز جداً لدينا! ✨<br>`;
    if (subProducts.length > 0) {
      resp +=
        "من أشهر منتجاتنا فيه: " +
        subProducts.map((p) => p.name).join(" و ") +
        ".";
    }
    const finalMsg = resp + "<br>يمكنك الضغط على القسم في الأعلى لمشاهدة كافة الأصناف.";
    if (matchedCategory.img) {
      return `
        <div class="flex flex-col gap-2">
          <img src="${matchedCategory.img}" class="w-full h-28 object-cover rounded-xl bg-white border border-slate-100 shadow-sm">
          <p>${finalMsg}</p>
        </div>`;
    }
    return finalMsg;
  }

  // 4. الشحن والتوصيل
  if (msg.includes("توصيل") || msg.includes("شحن") || msg.includes("وقت")) {
    return "🚚 خدمة التوصيل لدينا تغطي كافة المناطق بسرعة فائقة! عادة ما يصل الطلب خلال 24 ساعة فقط من وقت التأكيد.";
  }

  // 5. الدفع
  if (
    msg.includes("دفع") ||
    msg.includes("كاش") ||
    msg.includes("فيزا") ||
    msg.includes("فلوس")
  ) {
    return "💳 نوفر لك طرق دفع متنوعة: كاش عند الاستلام، أو عبر الفيزا والمحافظ الإلكترونية بكل أمان.";
  }

  // 6. الاستفسار عن مكان المحل أو التواصل
  if (
    msg.includes("عنوان") ||
    msg.includes("مكان") ||
    msg.includes("تواصل") ||
    msg.includes("تلفون") ||
    msg.includes("رقم")
  ) {
    return `يسعدنا تواصلك معنا! يمكنك الاتصال بخدمة العملاء مباشرة على الأرقام: ${contactNumbers}. أو تواصل عبر الواتساب: <a href="https://wa.me/201033743734" target="_blank" class="text-blue-500 font-bold inline-flex items-center gap-1 hover:underline"><i data-lucide="message-circle" class="w-4 h-4"></i> واتساب 1</a> | <a href="https://wa.me/201063748966" target="_blank" class="text-blue-500 font-bold inline-flex items-center gap-1 hover:underline"><i data-lucide="message-circle" class="w-4 h-4"></i> واتساب 2</a>`;
  }

  // 7. جودة المنتجات
  if (msg.includes("جودة") || msg.includes("أصلي") || msg.includes("ضمان")) {
    return "نحن نضمن لك جودة كافة المنتجات لأننا نتعامل مع المصانع والشركات الكبرى مباشرة لتوفير أفضل سعر وأعلى جودة للجملة. ✅";
  }

  // 8. طريقة الطلب
  if (msg.includes("اطلب") || msg.includes("اشتري") || msg.includes("طريقة")) {
    return "الأمر بسيط جداً! اختر المنتجات التي تريدها وأضفها للسلة، ثم اضغط على أيقونة السلة في الأسفل وأكمل بيانات التوصيل. 🛍️";
  }

  // 9. الرد عند عدم الفهم (مع الأرقام المطلوبة)
  const fallbacks = [
    `عذراً، لم أفهم طلبك جيداً. 🤔 يمكنك التواصل مع خدمة العملاء مباشرة لمساعدتك عبر الاتصال أو <a href="https://wa.me/201033743734" target="_blank" class="text-blue-500 font-bold inline-flex items-center hover:underline">الواتساب</a>.`,
    `لدينا فريق مخصص للرد على استفساراتك المتقدمة. يرجى مراسلة خدمة العملاء على الواتساب: <br><br><a href="https://wa.me/201063748966" target="_blank" class="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-bold border border-emerald-100 flex items-center justify-center gap-1"><i data-lucide="message-circle" class="w-4 h-4"></i> تواصل عبر واتساب</a>`,
    `آسفة، لم أستطع العثور على إجابة لهذا السؤال. يمكنك الاتصال بنا على ${contactNumbers} وسيقوم أحد زملائي بمساعدتك فوراً، أو راسلنا <a href="https://wa.me/201033743734" target="_blank" class="text-blue-500 font-bold hover:underline">هنا على واتساب</a>.`,
  ];

  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// دالة عرض الرسائل بتصميم "فقاعات" عصري
function appendMessage(sender, text, type, shouldSave = true) {
  const chatMessages = document.getElementById("chatbot-messages");
  if (!chatMessages) return;

  if (shouldSave) saveMessageToHistory(sender, text, type);

  const msgDiv = document.createElement("div");
  msgDiv.className = `flex ${type === "user" ? "justify-end" : "justify-start"} mb-3 items-end`;

  const persona = window.getBotPersona();
  const avatar =
    type === "bot"
      ? persona.image
      : "https://ui-avatars.com/api/?name=U&bg=4F46E5&color=fff";

  msgDiv.innerHTML = `
        <div class="flex ${type === "user" ? "flex-row-reverse" : "flex-row"} items-end max-w-[85%]">
            <img src="${avatar}" class="w-8 h-8 rounded-full border border-gray-200 shadow-sm ${type === "user" ? "ml-2" : "mr-2"}">
            <div class="${type === "user" ? "bg-indigo-600 text-white rounded-t-2xl rounded-bl-2xl" : "bg-gray-100 text-gray-800 rounded-t-2xl rounded-br-2xl"} p-3 shadow-sm text-sm font-medium leading-relaxed">
                ${text}
            </div>
        </div>
    `;

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// وظائف حفظ واستعادة سجل المحادثة
function saveMessageToHistory(sender, text, type) {
  const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
  history.push({ sender, text, type });
  // الاحتفاظ بآخر 50 رسالة فقط لتجنب امتلاء التخزين
  if (history.length > 50) history.shift();
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
}

window.loadChatHistory = function() {
  const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
  if (history.length === 0) {
    const persona = window.getBotPersona();
    appendMessage(persona.name, persona.greeting, "bot");
  } else {
    history.forEach(msg => appendMessage(msg.sender, msg.text, msg.type, false));
  }
};

// وظائف مساعدة للشكل الجمالي
function showTyping() {
  const chatMessages = document.getElementById("chatbot-messages");
  const div = document.createElement("div");
  div.id = "bot-typing-ui";
  div.className = "text-[10px] text-gray-400 ml-10 mb-2 animate-pulse";
  div.innerText = "جاري الرد...";
  chatMessages.appendChild(div);
}

function removeTyping() {
  const el = document.getElementById("bot-typing-ui");
  if (el) el.remove();
}

// --- تفعيل زر الإرسال و مفتاح Enter تلقائياً ---
document.addEventListener("click", function (e) {
  // إذا ضغط المستخدم على أي زر يحتوي على نص "إرسال" داخل حاوية الشات
  if (
    e.target &&
    (e.target.id === "send-btn" || e.target.innerText === "إرسال")
  ) {
    window.sendChatMessage();
  }
});

document.addEventListener("keypress", function (e) {
  if (e.key === "Enter" && document.activeElement && document.activeElement.id === "chatbot-input") {
    window.sendChatMessage();
  }
});

// ==========================================
// Admin Custom Bot Responses (Super Admin)
// ==========================================

window.customChatbotResponses = [];

// جلب الردود المخصصة من قاعدة البيانات
window.loadCustomBotResponses = async function() {
    if (!window.firestoreUtils || !window.db) return;
    
    try {
        const ref = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "chatbotQA");
        window.firestoreUtils.onSnapshot(ref, (snapshot) => {
            window.customChatbotResponses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if(document.getElementById("admin-bot-responses-list") && !document.getElementById("admin-bot-list").classList.contains("hidden")) {
                window.renderBotResponses();
            }
        });
    } catch(e) {
        console.error("Error loading custom bot responses:", e);
    }
};

window.saveBotResponse = async function() {
    const keywordsInput = document.getElementById("bot-train-keywords");
    const responseInput = document.getElementById("bot-train-response");
    
    if(!keywordsInput || !responseInput) return;

    const keywords = keywordsInput.value.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
    const responseText = responseInput.value.trim();

    if(keywords.length === 0 || !responseText) {
        return window.showToast("يرجى إدخال كلمات مفتاحية والرد المناسب", "warning");
    }

    try {
        const ref = window.firestoreUtils.collection(window.db, "artifacts", window.appId, "public", "data", "chatbotQA");
        await window.firestoreUtils.addDoc(ref, {
            keywords: keywords,
            response: responseText,
            createdAt: window.firestoreUtils.serverTimestamp()
        });
        
        window.showToast("تم الحفظ بنجاح! البوت الآن أذكى ", "success");
        keywordsInput.value = "";
        responseInput.value = "";
    } catch(e) {
        console.error(e);
        window.showToast("حدث خطأ أثناء الحفظ", "error");
    }
};

window.renderBotResponses = function() {
    const list = document.getElementById("admin-bot-responses-list");
    if(!list) return;

    if(window.customChatbotResponses.length === 0) {
        list.innerHTML = `<div class="text-center text-slate-400 font-bold p-4 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">لا توجد ردود مخصصة حتى الآن. درّبي مساحتكِ الخاصة!</div>`;
        return;
    }

    list.innerHTML = window.customChatbotResponses.map(qa => `
        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between gap-4">
            <div class="flex-1 space-y-2">
                <div class="flex flex-wrap gap-1">
                    ${qa.keywords.map(k => `<span class="bg-[#1B4332]/10 text-[#1B4332] px-2 py-0.5 rounded-lg text-xs font-black">#${k}</span>`).join("")}
                </div>
                <p class="text-sm text-slate-700 font-semibold bg-slate-50 p-3 rounded-xl border border-slate-100">${qa.response}</p>
            </div>
            <button onclick="window.deleteBotResponse('${qa.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
        </div>
    `).join("");

    if(window.lucide) window.lucide.createIcons();
};

window.deleteBotResponse = async function(id) {
    if(!confirm("هل أنتِ متأكدة من حذف هذا الرد؟")) return;
    try {
        await window.firestoreUtils.deleteDoc(
            window.firestoreUtils.doc(window.db, "artifacts", window.appId, "public", "data", "chatbotQA", id)
        );
        window.showToast("تم حذف الرد", "success");
    } catch (e) {
        window.showToast("خطأ في الحذف", "error");
    }
};

// Initial load
if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(window.loadCustomBotResponses, 1000);
} else {
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(window.loadCustomBotResponses, 1000);
    });
}
