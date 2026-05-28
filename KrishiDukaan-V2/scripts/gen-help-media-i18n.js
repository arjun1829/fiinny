/* eslint-disable */
/**
 * One-shot generator for the Help page screenshot/deep-link i18n keys.
 * Injects en/mr/hi entries after each language's `helpSecArchitecture:` block is
 * already present (we anchor on the existing `helpLinkOpenHome` absence to stay idempotent).
 * Run: node scripts/gen-help-media-i18n.js
 */
const fs = require('fs');
const path = require('path');

// key -> [en, mr, hi]
const T = {};
const reg = (k, en, mr, hi) => { T[k] = [en, mr, hi]; };

// UI chrome for the visual/actions blocks
reg('helpVisualPreview', 'Visual preview', 'दृश्य पूर्वावलोकन', 'विज़ुअल पूर्वावलोकन');
reg('helpRelatedScreens', 'Open the actual screen', 'प्रत्यक्ष स्क्रीन उघडा', 'वास्तविक स्क्रीन खोलें');
reg('helpScreenshotComingSoon', 'Preview coming soon', 'पूर्वावलोकन लवकरच', 'पूर्वावलोकन जल्द ही');
reg('helpLoginToOpen', 'Log in as a retailer or manufacturer to open this module.', 'हे मॉड्यूल उघडण्यासाठी किरकोळ विक्रेता किंवा उत्पादक म्हणून लॉगिन करा.', 'इस मॉड्यूल को खोलने के लिए रिटेलर या निर्माता के रूप में लॉगिन करें.');

// Deep-link button labels
reg('helpLinkOpenHome', 'Open Home', 'होम उघडा', 'होम खोलें');
reg('helpLinkOpenMarket', 'Open Market', 'मार्केट उघडा', 'मार्केट खोलें');
reg('helpLinkOpenHub', 'Open Hub', 'हब उघडा', 'हब खोलें');
reg('helpLinkOpenStores', 'Open Stores', 'स्टोअर्स उघडा', 'स्टोर्स खोलें');
reg('helpLinkOpenLogin', 'Go to Login', 'लॉगिनवर जा', 'लॉगिन पर जाएं');
reg('helpLinkOpenSubscription', 'Open Subscription', 'सदस्यता उघडा', 'सदस्यता खोलें');
reg('helpLinkOpenProfile', 'Open Profile', 'प्रोफाइल उघडा', 'प्रोफ़ाइल खोलें');
reg('helpLinkOpenDashboard', 'Open Dashboard', 'डॅशबोर्ड उघडा', 'डैशबोर्ड खोलें');
reg('helpLinkOpenOverview', 'Open Overview', 'आढावा उघडा', 'अवलोकन खोलें');
reg('helpLinkOpenAnalytics', 'Open Analytics', 'विश्लेषण उघडा', 'एनालिटिक्स खोलें');
reg('helpLinkOpenInventory', 'Open Inventory', 'इन्व्हेंटरी उघडा', 'इन्वेंटरी खोलें');
reg('helpLinkOpenRetailers', 'Open Retailer Network', 'किरकोळ विक्रेता नेटवर्क उघडा', 'रिटेलर नेटवर्क खोलें');
reg('helpLinkOpenOrders', 'Open Orders', 'ऑर्डर उघडा', 'ऑर्डर खोलें');
reg('helpLinkOpenReviews', 'Open Reviews', 'पुनरावलोकने उघडा', 'समीक्षाएं खोलें');
reg('helpLinkOpenSettings', 'Open Settings', 'सेटिंग्ज उघडा', 'सेटिंग्स खोलें');

// Screenshot captions
reg('helpCapHome', 'KrishiDukan home — products, crops and nearby stores at a glance.', 'KrishiDukan होम — उत्पादने, पिके आणि जवळपासचे स्टोअर्स एका दृष्टीक्षेपात.', 'KrishiDukan होम — उत्पाद, फसलें और आस-पास के स्टोर एक नज़र में.');
reg('helpCapLanding', 'The landing experience and primary navigation modules.', 'लँडिंग अनुभव आणि प्राथमिक नेव्हिगेशन मॉड्यूल.', 'लैंडिंग अनुभव और प्राथमिक नेविगेशन मॉड्यूल.');
reg('helpCapMarket', 'Market — search, filter and discover products near you.', 'मार्केट — तुमच्या जवळ उत्पादने शोधा, फिल्टर करा आणि शोधा.', 'मार्केट — अपने पास उत्पाद खोजें, फ़िल्टर करें और खोजें.');
reg('helpCapHub', 'Hub — stage-wise crop guidance and recommended products.', 'हब — टप्प्याटप्प्याने पीक मार्गदर्शन आणि शिफारस केलेली उत्पादने.', 'हब — चरण-वार फसल मार्गदर्शन और अनुशंसित उत्पाद.');
reg('helpCapStores', 'Stores — nearby agri stores on the map with directions.', 'स्टोअर्स — नकाशावर जवळपासची कृषी स्टोअर्स दिशानिर्देशांसह.', 'स्टोर्स — मानचित्र पर आस-पास के कृषि स्टोर दिशा-निर्देशों के साथ.');
reg('helpCapAuth', 'Sign up / login with role selection and OTP.', 'भूमिका निवड आणि OTP सह साइन अप / लॉगिन.', 'भूमिका चयन और OTP के साथ साइन अप / लॉगिन.');
reg('helpCapSubscription', 'Choose a plan and number of listings, then pay securely.', 'योजना आणि लिस्टिंग संख्या निवडा, नंतर सुरक्षितपणे पैसे द्या.', 'प्लान और लिस्टिंग संख्या चुनें, फिर सुरक्षित रूप से भुगतान करें.');
reg('helpCapAccount', 'Account menu — language, dashboard, profile and logout.', 'खाते मेनू — भाषा, डॅशबोर्ड, प्रोफाइल आणि लॉगआउट.', 'खाता मेनू — भाषा, डैशबोर्ड, प्रोफ़ाइल और लॉगआउट.');
reg('helpCapDashboard', 'Dashboard — your complete business control center.', 'डॅशबोर्ड — तुमचे संपूर्ण व्यवसाय नियंत्रण केंद्र.', 'डैशबोर्ड — आपका संपूर्ण व्यवसाय नियंत्रण केंद्र.');
reg('helpCapOverviewModule', 'Overview — views, interactions and inventory health.', 'आढावा — दृश्ये, परस्परसंवाद आणि इन्व्हेंटरी आरोग्य.', 'अवलोकन — व्यूज़, इंटरैक्शन और इन्वेंटरी स्वास्थ्य.');
reg('helpCapAnalytics', 'Analytics — impressions, CTR and engagement over time.', 'विश्लेषण — इंप्रेशन्स, CTR आणि कालांतराने सहभाग.', 'एनालिटिक्स — इंप्रेशन, CTR और समय के साथ एंगेजमेंट.');
reg('helpCapInventory', 'Inventory — manage products, stock, pricing and listings.', 'इन्व्हेंटरी — उत्पादने, स्टॉक, किंमत आणि लिस्टिंग व्यवस्थापित करा.', 'इन्वेंटरी — उत्पाद, स्टॉक, मूल्य और लिस्टिंग प्रबंधित करें.');
reg('helpCapProductCreation', 'Product creation — details, pack sizes, images and publish.', 'उत्पादन निर्मिती — तपशील, पॅक आकार, प्रतिमा आणि प्रकाशन.', 'उत्पाद निर्माण — विवरण, पैक आकार, छवियां और प्रकाशन.');
reg('helpCapRetailerNetwork', 'Retailer network — add, link and manage your distribution.', 'किरकोळ विक्रेता नेटवर्क — तुमचे वितरण जोडा, लिंक करा आणि व्यवस्थापित करा.', 'रिटेलर नेटवर्क — अपना वितरण जोड़ें, लिंक करें और प्रबंधित करें.');
reg('helpCapAddRetailer', 'Add retailer — shop details with maps location pinning.', 'किरकोळ विक्रेता जोडा — नकाशा स्थान पिनिंगसह दुकान तपशील.', 'रिटेलर जोड़ें — मानचित्र स्थान पिनिंग के साथ दुकान विवरण.');
reg('helpCapInvite', 'Invite & share — invite code with link, WhatsApp and email.', 'आमंत्रण आणि शेअर — लिंक, WhatsApp आणि ईमेलसह आमंत्रण कोड.', 'आमंत्रण और शेयर — लिंक, WhatsApp और ईमेल के साथ आमंत्रण कोड.');
reg('helpCapAssign', 'Assign products — push catalogue items to retailers.', 'उत्पादने नियुक्त करा — किरकोळ विक्रेत्यांना कॅटलॉग आयटम पाठवा.', 'उत्पाद असाइन करें — रिटेलरों को कैटलॉग आइटम भेजें.');
reg('helpCapRetailerDetails', 'Retailer details — info, geo data and quick actions.', 'किरकोळ विक्रेता तपशील — माहिती, भौगोलिक डेटा आणि द्रुत क्रिया.', 'रिटेलर विवरण — जानकारी, जियो डेटा और त्वरित क्रियाएं.');
reg('helpCapSubscriptionMgmt', 'Subscription management — seats, expiry and payment history.', 'सदस्यता व्यवस्थापन — सीट, समाप्ती आणि पेमेंट इतिहास.', 'सदस्यता प्रबंधन — सीटें, समाप्ति और भुगतान इतिहास.');
reg('helpCapListing', 'Listings — active, assigned and expiring listings.', 'लिस्टिंग — सक्रिय, नियुक्त आणि समाप्त होणारी लिस्टिंग.', 'लिस्टिंग — सक्रिय, असाइन की गई और समाप्त होने वाली लिस्टिंग.');
reg('helpCapOrders', 'Orders — view, update status and manage dispatch.', 'ऑर्डर — पहा, स्थिती अद्यतनित करा आणि पाठवणी व्यवस्थापित करा.', 'ऑर्डर — देखें, स्थिति अपडेट करें और डिस्पैच प्रबंधित करें.');
reg('helpCapReviews', 'Reviews — ratings and feedback from farmers.', 'पुनरावलोकने — शेतकऱ्यांकडून रेटिंग आणि अभिप्राय.', 'समीक्षाएं — किसानों से रेटिंग और प्रतिक्रिया.');
reg('helpCapProfile', 'Profile — business identity, maps and social links.', 'प्रोफाइल — व्यवसाय ओळख, नकाशे आणि सोशल लिंक.', 'प्रोफ़ाइल — व्यवसाय पहचान, मानचित्र और सोशल लिंक.');
reg('helpCapSettings', 'Settings — delivery toggle and seller visibility.', 'सेटिंग्ज — डिलिव्हरी टॉगल आणि विक्रेता दृश्यमानता.', 'सेटिंग्स — डिलीवरी टॉगल और विक्रेता दृश्यता.');

// --- inject -----------------------------------------------------------------
const tPath = path.join(__dirname, '..', 'app', 'i18n', 'translations.ts');
let src = fs.readFileSync(tPath, 'utf8');
if (src.includes('helpLinkOpenHome:')) {
  console.error('ABORT: media i18n keys already present.');
  process.exit(1);
}
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const langIdx = { en: 0, mr: 1, hi: 2 };
const lines = src.split('\n');
const anchorIdx = [];
lines.forEach((l, i) => { if (/^\s+helpSecArchitecture:/.test(l)) anchorIdx.push(i); });
if (anchorIdx.length !== 3) { console.error('ABORT: expected 3 anchors, got', anchorIdx.length); process.exit(1); }
const order = ['en', 'mr', 'hi'];
for (let k = anchorIdx.length - 1; k >= 0; k--) {
  const lang = order[k];
  const block = Object.keys(T).map((key) => `    ${key}: '${esc(T[key][langIdx[lang]])}',`).join('\n');
  const marker = `    // --- Help page screenshots + deep links (generated, ${lang}) ---`;
  lines.splice(anchorIdx[k] + 1, 0, marker + '\n' + block);
}
fs.writeFileSync(tPath, lines.join('\n'), 'utf8');
console.log('Injected media/link i18n. Keys per language:', Object.keys(T).length);
