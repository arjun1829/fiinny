/* eslint-disable */
/**
 * One-shot generator for the Help page i18n.
 *
 * Produces:
 *   1. The keyed content tree for app/views/helpContent.ts (HELP_SECTIONS).
 *   2. The en / mr / hi translation entries to inject into app/i18n/translations.ts.
 *
 * Every content string is registered once with a stable key + en/mr/hi values.
 * Run: node scripts/gen-help-i18n.js
 */
const fs = require('fs');
const path = require('path');

// key -> [en, mr, hi]
const T = {};
function reg(key, en, mr, hi) {
  if (T[key] && T[key][0] !== en) throw new Error('key collision with different EN: ' + key);
  T[key] = [en, mr, hi];
  return key;
}

// --- shared lexicon (platform terms reused across sections) -----------------
const L = {
  home: reg('helpTxtHome', 'Home', 'होम', 'होम'),
  market: reg('helpTxtMarket', 'Market', 'मार्केट', 'मार्केट'),
  hub: reg('helpTxtHub', 'Hub', 'हब', 'हब'),
  stores: reg('helpTxtStores', 'Stores', 'स्टोअर्स', 'स्टोर्स'),
  farmer: reg('helpTxtFarmer', 'Farmer', 'शेतकरी', 'किसान'),
  retailer: reg('helpTxtRetailer', 'Retailer', 'किरकोळ विक्रेता', 'रिटेलर'),
  manufacturer: reg('helpTxtManufacturer', 'Manufacturer', 'उत्पादक', 'निर्माता'),
  userCan: reg('helpTxtUserCan', 'User can:', 'वापरकर्ता हे करू शकतो:', 'उपयोगकर्ता यह कर सकता है:'),
  purpose: reg('helpTxtPurposeColon', 'Purpose:', 'उद्देश:', 'उद्देश्य:'),
};

// helper: paragraph/sub/note block creator returning {kind, key}
const p = (key) => ({ kind: 'p', key });
const sub = (key) => ({ kind: 'sub', key });
const note = (key) => ({ kind: 'note', key });
const list = (keys) => ({ kind: 'list', keys });
const steps = (keys) => ({ kind: 'steps', keys });
const states = (keys) => ({ kind: 'states', keys });

// ---------------------------------------------------------------------------
// SECTIONS — each registers its own strings inline and references shared ones.
// ---------------------------------------------------------------------------
const SECTIONS = [
  {
    id: 'overview', titleKey: 'helpSecOverview', icon: 'Docs',
    summaryKey: reg('helpSumOverview', 'What KrishiDukan is and how the ecosystem connects together.',
      'KrishiDukan म्हणजे काय आणि परिसंस्था एकत्र कशी जोडली जाते.',
      'KrishiDukan क्या है और पारिस्थितिकी तंत्र एक साथ कैसे जुड़ता है.'),
    blocks: [
      p(reg('helpOvP1', 'Based on the onboarding documentation, the KrishiDukan portal follows a complete agriculture commerce ecosystem flow connecting Farmers, Retailers and Manufacturers/Sellers.',
        'ऑनबोर्डिंग दस्तऐवजानुसार, KrishiDukan पोर्टल शेतकरी, किरकोळ विक्रेते आणि उत्पादक/विक्रेते यांना जोडणारा संपूर्ण कृषी वाणिज्य परिसंस्था प्रवाह अनुसरतो.',
        'ऑनबोर्डिंग दस्तावेज़ के आधार पर, KrishiDukan पोर्टल किसानों, रिटेलरों और निर्माताओं/विक्रेताओं को जोड़ने वाले संपूर्ण कृषि वाणिज्य पारिस्थितिकी प्रवाह का पालन करता है.')),
      p(reg('helpOvP2', 'The portal is designed as a full-stack agricultural marketplace + distribution + retailer management + subscription ecosystem.',
        'हे पोर्टल पूर्ण-स्टॅक कृषी मार्केटप्लेस + वितरण + किरकोळ विक्रेता व्यवस्थापन + सदस्यता परिसंस्था म्हणून तयार केले आहे.',
        'यह पोर्टल फुल-स्टैक कृषि मार्केटप्लेस + वितरण + रिटेलर प्रबंधन + सदस्यता पारिस्थितिकी तंत्र के रूप में डिज़ाइन किया गया है.')),
      note(reg('helpOvNote', 'Main goal: connect Farmers, Retailers and Manufacturers into one ecosystem — combining marketplace discovery, crop guidance, distribution networks and subscription-based business tools.',
        'मुख्य ध्येय: शेतकरी, किरकोळ विक्रेते आणि उत्पादक यांना एका परिसंस्थेत जोडणे — मार्केटप्लेस शोध, पीक मार्गदर्शन, वितरण नेटवर्क आणि सदस्यता-आधारित व्यवसाय साधने एकत्र करणे.',
        'मुख्य लक्ष्य: किसानों, रिटेलरों और निर्माताओं को एक पारिस्थितिकी तंत्र में जोड़ना — मार्केटप्लेस खोज, फसल मार्गदर्शन, वितरण नेटवर्क और सदस्यता-आधारित व्यावसायिक उपकरणों को संयोजित करना.')),
    ],
  },
  {
    id: 'entry', titleKey: 'helpSecEntry', icon: 'Compass',
    summaryKey: reg('helpSumEntry', 'How users first enter and discover the platform.',
      'वापरकर्ते प्रथम प्लॅटफॉर्ममध्ये कसे प्रवेश करतात आणि शोधतात.',
      'उपयोगकर्ता पहली बार प्लेटफ़ॉर्म में कैसे प्रवेश करते और खोजते हैं.'),
    blocks: [
      sub(reg('helpEntrySub1', 'Landing Experience', 'लँडिंग अनुभव', 'लैंडिंग अनुभव')),
      p(reg('helpEntryP1', 'User enters the platform through the primary navigation modules of the portal:',
        'वापरकर्ता पोर्टलच्या प्राथमिक नेव्हिगेशन मॉड्यूलद्वारे प्लॅटफॉर्ममध्ये प्रवेश करतो:',
        'उपयोगकर्ता पोर्टल के प्राथमिक नेविगेशन मॉड्यूल के माध्यम से प्लेटफ़ॉर्म में प्रवेश करता है:')),
      list([L.home, L.market, L.hub, L.stores]),
      sub(reg('helpEntrySub2', 'Purpose', 'उद्देश', 'उद्देश्य')),
      p(reg('helpEntryP2', 'The landing layer introduces:', 'लँडिंग स्तर सादर करतो:', 'लैंडिंग परत प्रस्तुत करती है:')),
      list([
        reg('helpEntryI1', 'products', 'उत्पादने', 'उत्पाद'),
        reg('helpEntryI2', 'marketplace discovery', 'मार्केटप्लेस शोध', 'मार्केटप्लेस खोज'),
        reg('helpEntryI3', 'crop guidance', 'पीक मार्गदर्शन', 'फसल मार्गदर्शन'),
        reg('helpEntryI4', 'nearby stores', 'जवळपासचे स्टोअर्स', 'आस-पास के स्टोर'),
        reg('helpEntryI5', 'onboarding access', 'ऑनबोर्डिंग प्रवेश', 'ऑनबोर्डिंग पहुंच'),
      ]),
    ],
  },
  {
    id: 'public', titleKey: 'helpSecPublic', icon: 'Home',
    summaryKey: reg('helpSumPublic', 'The four public modules: Home, Market, Hub and Stores.',
      'चार सार्वजनिक मॉड्यूल: होम, मार्केट, हब आणि स्टोअर्स.',
      'चार सार्वजनिक मॉड्यूल: होम, मार्केट, हब और स्टोर्स.'),
    blocks: [
      sub(reg('helpPubSubA', 'A. Home Page Flow', 'अ. होम पेज प्रवाह', 'अ. होम पेज प्रवाह')),
      p(reg('helpPubAP1', 'Purpose: acts as the platform introduction layer.',
        'उद्देश: प्लॅटफॉर्म परिचय स्तर म्हणून कार्य करते.', 'उद्देश्य: प्लेटफ़ॉर्म परिचय परत के रूप में कार्य करता है.')),
      p(L.userCan),
      list([
        reg('helpPubAI1', 'Explore KrishiDukan', 'KrishiDukan एक्सप्लोर करा', 'KrishiDukan एक्सप्लोर करें'),
        reg('helpPubAI2', 'View agricultural products', 'कृषी उत्पादने पहा', 'कृषि उत्पाद देखें'),
        reg('helpPubAI3', 'Access Market', 'मार्केट उघडा', 'मार्केट एक्सेस करें'),
        reg('helpPubAI4', 'Access Hub', 'हब उघडा', 'हब एक्सेस करें'),
        reg('helpPubAI5', 'Access Stores', 'स्टोअर्स उघडा', 'स्टोर्स एक्सेस करें'),
        reg('helpPubAI6', 'Start account creation', 'खाते तयार करणे सुरू करा', 'खाता निर्माण शुरू करें'),
      ]),
      note(reg('helpPubANote', 'Main goal: connect Farmers, Retailers and Manufacturers into one ecosystem.',
        'मुख्य ध्येय: शेतकरी, किरकोळ विक्रेते आणि उत्पादक यांना एका परिसंस्थेत जोडणे.',
        'मुख्य लक्ष्य: किसानों, रिटेलरों और निर्माताओं को एक पारिस्थितिकी तंत्र में जोड़ना.')),

      sub(reg('helpPubSubB', 'B. Market Page Flow', 'ब. मार्केट पेज प्रवाह', 'ब. मार्केट पेज प्रवाह')),
      p(reg('helpPubBP1', 'Purpose: marketplace discovery and product commerce.',
        'उद्देश: मार्केटप्लेस शोध आणि उत्पादन वाणिज्य.', 'उद्देश्य: मार्केटप्लेस खोज और उत्पाद वाणिज्य.')),
      p(L.userCan),
      list([
        reg('helpPubBI1', 'Search products', 'उत्पादने शोधा', 'उत्पाद खोजें'),
        reg('helpPubBI2', 'Explore categories', 'श्रेणी एक्सप्लोर करा', 'श्रेणियां एक्सप्लोर करें'),
        reg('helpPubBI3', 'Check pricing', 'किंमत तपासा', 'मूल्य जांचें'),
        reg('helpPubBI4', 'Check availability', 'उपलब्धता तपासा', 'उपलब्धता जांचें'),
        reg('helpPubBI5', 'Find nearby sellers', 'जवळपासचे विक्रेते शोधा', 'आस-पास के विक्रेता खोजें'),
        reg('helpPubBI6', 'Open product details', 'उत्पादन तपशील उघडा', 'उत्पाद विवरण खोलें'),
      ]),
      p(reg('helpPubBP2', 'Marketplace logic acts as a:', 'मार्केटप्लेस लॉजिक खालीलप्रमाणे कार्य करते:', 'मार्केटप्लेस लॉजिक इस प्रकार कार्य करता है:')),
      list([
        reg('helpPubBI7', 'product listing engine', 'उत्पादन लिस्टिंग इंजिन', 'उत्पाद लिस्टिंग इंजन'),
        reg('helpPubBI8', 'discovery engine', 'शोध इंजिन', 'खोज इंजन'),
        reg('helpPubBI9', 'buying ecosystem', 'खरेदी परिसंस्था', 'खरीद पारिस्थितिकी तंत्र'),
      ]),

      sub(reg('helpPubSubC', 'C. Hub Flow (Crop Intelligence System)', 'क. हब प्रवाह (पीक बुद्धिमत्ता प्रणाली)', 'स. हब प्रवाह (फसल इंटेलिजेंस सिस्टम)')),
      p(reg('helpPubCP1', 'Purpose: crop lifecycle guidance platform.', 'उद्देश: पीक जीवनचक्र मार्गदर्शन प्लॅटफॉर्म.', 'उद्देश्य: फसल जीवनचक्र मार्गदर्शन प्लेटफ़ॉर्म.')),
      p(L.userCan),
      list([
        reg('helpPubCI1', 'Select crop', 'पीक निवडा', 'फसल चुनें'),
        reg('helpPubCI2', 'Explore growth journey', 'वाढीचा प्रवास एक्सप्लोर करा', 'विकास यात्रा एक्सप्लोर करें'),
        reg('helpPubCI3', 'Learn stage-wise farming process', 'टप्प्याटप्प्याने शेती प्रक्रिया शिका', 'चरण-वार खेती प्रक्रिया सीखें'),
        reg('helpPubCI4', 'View recommended products', 'शिफारस केलेली उत्पादने पहा', 'अनुशंसित उत्पाद देखें'),
      ]),
      p(reg('helpPubCP2', 'Crop journey stages:', 'पीक प्रवासाचे टप्पे:', 'फसल यात्रा के चरण:')),
      states([
        reg('helpStEstablishment', 'Establishment', 'स्थापना', 'स्थापना'),
        reg('helpStVegetative', 'Vegetative Growth', 'वनस्पतिजन्य वाढ', 'वानस्पतिक विकास'),
        reg('helpStFlowering', 'Flowering', 'फुलोरा', 'फूल आना'),
        reg('helpStDevelopment', 'Development', 'विकास', 'विकास'),
        reg('helpStHarvesting', 'Harvesting', 'कापणी', 'कटाई'),
      ]),
      note(reg('helpPubCNote', 'System purpose: a digital farming guidance engine.', 'प्रणालीचा उद्देश: डिजिटल शेती मार्गदर्शन इंजिन.', 'सिस्टम का उद्देश्य: एक डिजिटल खेती मार्गदर्शन इंजन.')),

      sub(reg('helpPubSubD', 'D. Stores Flow', 'ड. स्टोअर्स प्रवाह', 'द. स्टोर्स प्रवाह')),
      p(reg('helpPubDP1', 'Purpose: geo-based agricultural store discovery.', 'उद्देश: भौगोलिक-आधारित कृषी स्टोअर शोध.', 'उद्देश्य: जियो-आधारित कृषि स्टोर खोज.')),
      p(reg('helpPubDP2', 'Features:', 'वैशिष्ट्ये:', 'विशेषताएं:')),
      list([
        reg('helpPubDI1', 'Nearby stores', 'जवळपासचे स्टोअर्स', 'आस-पास के स्टोर'),
        reg('helpPubDI2', 'Google Maps integration', 'Google Maps एकत्रीकरण', 'Google Maps एकीकरण'),
        reg('helpPubDI3', 'Distance visibility', 'अंतर दृश्यमानता', 'दूरी दृश्यता'),
        reg('helpPubDI4', 'Store availability', 'स्टोअर उपलब्धता', 'स्टोर उपलब्धता'),
        reg('helpPubDI5', 'Navigation support', 'नेव्हिगेशन समर्थन', 'नेविगेशन समर्थन'),
        reg('helpPubDI6', 'Product availability', 'उत्पादन उपलब्धता', 'उत्पाद उपलब्धता'),
      ]),
      note(reg('helpPubDNote', 'Core logic: location intelligence + retailer discovery system.', 'मुख्य लॉजिक: स्थान बुद्धिमत्ता + किरकोळ विक्रेता शोध प्रणाली.', 'मुख्य लॉजिक: स्थान इंटेलिजेंस + रिटेलर खोज सिस्टम.')),
    ],
  },
  {
    id: 'auth', titleKey: 'helpSecAuth', icon: 'Auth',
    summaryKey: reg('helpSumAuth', 'New user registration, role selection and OTP login.',
      'नवीन वापरकर्ता नोंदणी, भूमिका निवड आणि OTP लॉगिन.', 'नया उपयोगकर्ता पंजीकरण, भूमिका चयन और OTP लॉगिन.'),
    blocks: [
      sub(reg('helpAuthSub1', 'New User Registration — User Types', 'नवीन वापरकर्ता नोंदणी — वापरकर्ता प्रकार', 'नया उपयोगकर्ता पंजीकरण — उपयोगकर्ता प्रकार')),
      p(reg('helpAuthP1', 'User selects one of the following roles:', 'वापरकर्ता खालीलपैकी एक भूमिका निवडतो:', 'उपयोगकर्ता निम्नलिखित में से एक भूमिका चुनता है:')),
      list([L.farmer, L.retailer, L.manufacturer]),
      sub(reg('helpAuthSub2', 'Registration Steps', 'नोंदणी पायऱ्या', 'पंजीकरण चरण')),
      steps([
        reg('helpAuthS1', 'Enter name', 'नाव प्रविष्ट करा', 'नाम दर्ज करें'),
        reg('helpAuthS2', 'Enter mobile number', 'मोबाईल नंबर प्रविष्ट करा', 'मोबाइल नंबर दर्ज करें'),
        reg('helpAuthS3', 'Send OTP', 'OTP पाठवा', 'OTP भेजें'),
        reg('helpAuthS4', 'Verify OTP', 'OTP सत्यापित करा', 'OTP सत्यापित करें'),
        reg('helpAuthS5', 'Login success', 'लॉगिन यशस्वी', 'लॉगिन सफल'),
      ]),
      sub(reg('helpAuthSub3', 'System Outcome', 'प्रणाली परिणाम', 'सिस्टम परिणाम')),
      list([
        reg('helpAuthI1', 'Secure authentication', 'सुरक्षित प्रमाणीकरण', 'सुरक्षित प्रमाणीकरण'),
        reg('helpAuthI2', 'Role-based onboarding', 'भूमिका-आधारित ऑनबोर्डिंग', 'भूमिका-आधारित ऑनबोर्डिंग'),
        reg('helpAuthI3', 'Personalized dashboard', 'वैयक्तिकृत डॅशबोर्ड', 'व्यक्तिगत डैशबोर्ड'),
      ]),
    ],
  },
  {
    id: 'subscription', titleKey: 'helpSecSubscription', icon: 'Payment',
    summaryKey: reg('helpSumSubscription', 'Premium plan activation, seat logic and payment.',
      'प्रीमियम योजना सक्रियकरण, सीट लॉजिक आणि पेमेंट.', 'प्रीमियम प्लान सक्रियण, सीट लॉजिक और भुगतान.'),
    blocks: [
      sub(reg('helpSubsSub1', 'Premium Plan Activation', 'प्रीमियम योजना सक्रियकरण', 'प्रीमियम प्लान सक्रियण')),
      p(reg('helpSubsP1', 'After login, the user must activate a subscription.', 'लॉगिननंतर, वापरकर्त्याने सदस्यता सक्रिय करणे आवश्यक आहे.', 'लॉगिन के बाद, उपयोगकर्ता को सदस्यता सक्रिय करनी होगी.')),
      sub(reg('helpSubsSub2', 'Available Plans', 'उपलब्ध योजना', 'उपलब्ध प्लान')),
      states([
        reg('helpSubsPlan1', '1 Month', '1 महिना', '1 महीना'),
        reg('helpSubsPlan2', '3 Months', '3 महिने', '3 महीने'),
        reg('helpSubsPlan3', '6 Months', '6 महिने', '6 महीने'),
        reg('helpSubsPlan4', '1 Year', '1 वर्ष', '1 वर्ष'),
      ]),
      sub(reg('helpSubsSub3', 'Seat Logic', 'सीट लॉजिक', 'सीट लॉजिक')),
      note(reg('helpSubsNote1', '1 Seat = 1 Product Listing.', '1 सीट = 1 उत्पादन लिस्टिंग.', '1 सीट = 1 उत्पाद लिस्टिंग.')),
      p(reg('helpSubsP2', 'A seat is consumed when:', 'सीट खालील वेळी वापरली जाते:', 'सीट तब उपयोग होती है जब:')),
      list([
        reg('helpSubsI1', 'Product is published', 'उत्पादन प्रकाशित होते', 'उत्पाद प्रकाशित होता है'),
        reg('helpSubsI2', 'Product assigned to retailer', 'उत्पादन किरकोळ विक्रेत्याला नियुक्त केले जाते', 'उत्पाद रिटेलर को असाइन किया जाता है'),
      ]),
      sub(reg('helpSubsSub4', 'Payment Flow', 'पेमेंट प्रवाह', 'भुगतान प्रवाह')),
      p(reg('helpSubsP3', 'Razorpay integration supporting:', 'Razorpay एकत्रीकरण, समर्थन:', 'Razorpay एकीकरण, समर्थन:')),
      list([
        reg('helpSubsI3', 'UPI', 'UPI', 'UPI'),
        reg('helpSubsI4', 'Cards', 'कार्ड', 'कार्ड'),
        reg('helpSubsI5', 'Wallets', 'वॉलेट', 'वॉलेट'),
        reg('helpSubsI6', 'Net Banking', 'नेट बँकिंग', 'नेट बैंकिंग'),
      ]),
      sub(reg('helpSubsSub5', 'Post Payment', 'पेमेंट नंतर', 'भुगतान के बाद')),
      p(reg('helpSubsP4', 'The system:', 'प्रणाली:', 'सिस्टम:')),
      list([
        reg('helpSubsI7', 'activates subscription', 'सदस्यता सक्रिय करते', 'सदस्यता सक्रिय करता है'),
        reg('helpSubsI8', 'allocates seats', 'सीट वाटप करते', 'सीटें आवंटित करता है'),
        reg('helpSubsI9', 'unlocks dashboard', 'डॅशबोर्ड अनलॉक करते', 'डैशबोर्ड अनलॉक करता है'),
        reg('helpSubsI10', 'enables listings', 'लिस्टिंग सक्षम करते', 'लिस्टिंग सक्षम करता है'),
      ]),
    ],
  },
  {
    id: 'account', titleKey: 'helpSecAccount', icon: 'Settings',
    summaryKey: reg('helpSumAccount', 'Centralized account management menu.', 'केंद्रीकृत खाते व्यवस्थापन मेनू.', 'केंद्रीकृत खाता प्रबंधन मेनू.'),
    blocks: [
      sub(reg('helpAccSub1', 'Account Menu System', 'खाते मेनू प्रणाली', 'खाता मेनू सिस्टम')),
      p(L.userCan),
      list([
        reg('helpAccI1', 'Change language', 'भाषा बदला', 'भाषा बदलें'),
        reg('helpAccI2', 'Access dashboard', 'डॅशबोर्ड उघडा', 'डैशबोर्ड एक्सेस करें'),
        reg('helpAccI3', 'Manage profile', 'प्रोफाइल व्यवस्थापित करा', 'प्रोफ़ाइल प्रबंधित करें'),
        reg('helpAccI4', 'Logout', 'लॉगआउट', 'लॉगआउट'),
      ]),
      note(reg('helpAccNote', 'Purpose: a centralized account management layer.', 'उद्देश: केंद्रीकृत खाते व्यवस्थापन स्तर.', 'उद्देश्य: एक केंद्रीकृत खाता प्रबंधन परत.')),
    ],
  },
  {
    id: 'dashboard', titleKey: 'helpSecDashboard', icon: 'Dashboard',
    summaryKey: reg('helpSumDashboard', 'The core business control center unlocked after subscription.',
      'सदस्यतेनंतर अनलॉक होणारे मुख्य व्यवसाय नियंत्रण केंद्र.', 'सदस्यता के बाद अनलॉक होने वाला मुख्य व्यवसाय नियंत्रण केंद्र.'),
    blocks: [
      p(reg('helpDashP1', 'After subscription activation, the user gets dashboard access.', 'सदस्यता सक्रियकरणानंतर, वापरकर्त्याला डॅशबोर्ड प्रवेश मिळतो.', 'सदस्यता सक्रियण के बाद, उपयोगकर्ता को डैशबोर्ड पहुंच मिलती है.')),
      note(reg('helpDashNote', 'Dashboard purpose: a complete business management center.', 'डॅशबोर्ड उद्देश: संपूर्ण व्यवसाय व्यवस्थापन केंद्र.', 'डैशबोर्ड उद्देश्य: एक संपूर्ण व्यवसाय प्रबंधन केंद्र.')),
      p(L.userCan),
      list([
        reg('helpDashI1', 'Manage products', 'उत्पादने व्यवस्थापित करा', 'उत्पाद प्रबंधित करें'),
        reg('helpDashI2', 'Manage retailer network', 'किरकोळ विक्रेता नेटवर्क व्यवस्थापित करा', 'रिटेलर नेटवर्क प्रबंधित करें'),
        reg('helpDashI3', 'Track analytics', 'विश्लेषण ट्रॅक करा', 'एनालिटिक्स ट्रैक करें'),
        reg('helpDashI4', 'Handle orders', 'ऑर्डर हाताळा', 'ऑर्डर संभालें'),
        reg('helpDashI5', 'View reviews', 'पुनरावलोकने पहा', 'समीक्षाएं देखें'),
        reg('helpDashI6', 'Manage subscription', 'सदस्यता व्यवस्थापित करा', 'सदस्यता प्रबंधित करें'),
      ]),
      p(reg('helpDashP2', 'Additional system:', 'अतिरिक्त प्रणाली:', 'अतिरिक्त सिस्टम:')),
      list([
        reg('helpDashI7', 'Interactive onboarding walkthrough shown during first login.', 'पहिल्या लॉगिन दरम्यान दर्शविला जाणारा परस्परसंवादी ऑनबोर्डिंग वॉकथ्रू.', 'पहली लॉगिन के दौरान दिखाया जाने वाला इंटरैक्टिव ऑनबोर्डिंग वॉकथ्रू.'),
      ]),
    ],
  },
  {
    id: 'modules', titleKey: 'helpSecModules', icon: 'ListChecks',
    summaryKey: reg('helpSumModules', 'Overview, Analytics and Inventory modules.', 'आढावा, विश्लेषण आणि इन्व्हेंटरी मॉड्यूल.', 'अवलोकन, एनालिटिक्स और इन्वेंटरी मॉड्यूल.'),
    blocks: [
      sub(reg('helpModSubA', 'A. Overview Section', 'अ. आढावा विभाग', 'अ. अवलोकन अनुभाग')),
      p(reg('helpModP1', 'Shows:', 'दर्शवते:', 'दिखाता है:')),
      list([
        reg('helpModI1', 'Total views', 'एकूण दृश्ये', 'कुल व्यूज़'),
        reg('helpModI2', 'Interactions', 'परस्परसंवाद', 'इंटरैक्शन'),
        reg('helpModI3', 'Directions', 'दिशानिर्देश', 'दिशा-निर्देश'),
        reg('helpModI4', 'Product count', 'उत्पादन संख्या', 'उत्पाद संख्या'),
        reg('helpModI5', 'Inventory health', 'इन्व्हेंटरी आरोग्य', 'इन्वेंटरी स्वास्थ्य'),
        reg('helpModI6', 'Reviews', 'पुनरावलोकने', 'समीक्षाएं'),
      ]),
      p(reg('helpModP2', 'Includes quick actions:', 'द्रुत क्रिया समाविष्ट:', 'त्वरित क्रियाएं शामिल हैं:')),
      list([
        reg('helpModI7', 'Add Product', 'उत्पादन जोडा', 'उत्पाद जोड़ें'),
        reg('helpModI8', 'Update Stock', 'स्टॉक अद्यतनित करा', 'स्टॉक अपडेट करें'),
        reg('helpModI9', 'Open Analytics', 'विश्लेषण उघडा', 'एनालिटिक्स खोलें'),
        reg('helpModI10', 'Manage Orders', 'ऑर्डर व्यवस्थापित करा', 'ऑर्डर प्रबंधित करें'),
      ]),
      note(reg('helpModNoteA', 'Purpose: a business performance snapshot.', 'उद्देश: व्यवसाय कामगिरीचा स्नॅपशॉट.', 'उद्देश्य: एक व्यवसाय प्रदर्शन स्नैपशॉट.')),

      sub(reg('helpModSubB', 'B. Analytics Flow', 'ब. विश्लेषण प्रवाह', 'ब. एनालिटिक्स प्रवाह')),
      p(reg('helpModP3', 'Tracks:', 'ट्रॅक करते:', 'ट्रैक करता है:')),
      list([
        reg('helpModI11', 'Impressions', 'इंप्रेशन्स', 'इंप्रेशन'),
        reg('helpModI12', 'CTR', 'CTR', 'CTR'),
        reg('helpModI13', 'Average Position', 'सरासरी स्थान', 'औसत स्थिति'),
        reg('helpModI14', 'Views Over Time', 'कालांतराने दृश्ये', 'समय के साथ व्यूज़'),
        reg('helpModI15', 'Engagement', 'सहभाग', 'एंगेजमेंट'),
      ]),
      note(reg('helpModNoteB', 'Purpose: a digital business intelligence system.', 'उद्देश: डिजिटल व्यवसाय बुद्धिमत्ता प्रणाली.', 'उद्देश्य: एक डिजिटल व्यवसाय इंटेलिजेंस सिस्टम.')),
      p(reg('helpModP4', 'Helps in:', 'यामध्ये मदत करते:', 'इसमें मदद करता है:')),
      list([
        reg('helpModI16', 'performance tracking', 'कामगिरी ट्रॅकिंग', 'प्रदर्शन ट्रैकिंग'),
        reg('helpModI17', 'visibility monitoring', 'दृश्यमानता निरीक्षण', 'दृश्यता निगरानी'),
        reg('helpModI18', 'marketing optimization', 'मार्केटिंग ऑप्टिमायझेशन', 'मार्केटिंग ऑप्टिमाइज़ेशन'),
        reg('helpModI19', 'customer behavior understanding', 'ग्राहक वर्तन समजून घेणे', 'ग्राहक व्यवहार समझना'),
      ]),

      sub(reg('helpModSubC', 'C. Inventory Flow', 'क. इन्व्हेंटरी प्रवाह', 'स. इन्वेंटरी प्रवाह')),
      p(reg('helpModP5', 'Purpose: product & catalogue management.', 'उद्देश: उत्पादन आणि कॅटलॉग व्यवस्थापन.', 'उद्देश्य: उत्पाद और कैटलॉग प्रबंधन.')),
      p(L.userCan),
      list([
        reg('helpModI20', 'Add products', 'उत्पादने जोडा', 'उत्पाद जोड़ें'),
        reg('helpModI21', 'Edit products', 'उत्पादने संपादित करा', 'उत्पाद संपादित करें'),
        reg('helpModI22', 'Manage stock', 'स्टॉक व्यवस्थापित करा', 'स्टॉक प्रबंधित करें'),
        reg('helpModI23', 'Manage pricing', 'किंमत व्यवस्थापित करा', 'मूल्य निर्धारण प्रबंधित करें'),
        reg('helpModI24', 'Upload images', 'प्रतिमा अपलोड करा', 'छवियां अपलोड करें'),
        reg('helpModI25', 'Control listing status', 'लिस्टिंग स्थिती नियंत्रित करा', 'लिस्टिंग स्थिति नियंत्रित करें'),
      ]),
      p(reg('helpModP6', 'Each product includes:', 'प्रत्येक उत्पादनात समाविष्ट:', 'प्रत्येक उत्पाद में शामिल है:')),
      states([
        reg('helpModSt1', 'Name', 'नाव', 'नाम'),
        reg('helpModSt2', 'Category', 'श्रेणी', 'श्रेणी'),
        reg('helpModSt3', 'Size', 'आकार', 'आकार'),
        reg('helpModSt4', 'Price', 'किंमत', 'मूल्य'),
        reg('helpModSt5', 'Stock', 'स्टॉक', 'स्टॉक'),
        reg('helpModSt6', 'Source', 'स्रोत', 'स्रोत'),
        reg('helpModSt7', 'Status', 'स्थिती', 'स्थिति'),
      ]),
    ],
  },
  {
    id: 'product-creation', titleKey: 'helpSecProductCreation', icon: 'Package',
    summaryKey: reg('helpSumProductCreation', 'Step-by-step product creation and publishing.', 'टप्प्याटप्प्याने उत्पादन निर्मिती आणि प्रकाशन.', 'चरण-दर-चरण उत्पाद निर्माण और प्रकाशन.'),
    blocks: [
      sub(reg('helpPcSub1', 'Step 1 — Product Details', 'पायरी 1 — उत्पादन तपशील', 'चरण 1 — उत्पाद विवरण')),
      p(reg('helpPcP1', 'User enters:', 'वापरकर्ता प्रविष्ट करतो:', 'उपयोगकर्ता दर्ज करता है:')),
      list([
        reg('helpPcI1', 'Product Name', 'उत्पादनाचे नाव', 'उत्पाद का नाम'),
        reg('helpPcI2', 'Category', 'श्रेणी', 'श्रेणी'),
        reg('helpPcI3', 'Description', 'वर्णन', 'विवरण'),
        reg('helpPcI4', 'Crop Suitability', 'पीक योग्यता', 'फसल उपयुक्तता'),
        reg('helpPcI5', 'Quantity', 'प्रमाण', 'मात्रा'),
      ]),
      sub(reg('helpPcSub2', 'Step 2 — Pack Size & Pricing', 'पायरी 2 — पॅक आकार आणि किंमत', 'चरण 2 — पैक आकार और मूल्य')),
      p(reg('helpPcP2', 'Multiple variants supported:', 'अनेक प्रकार समर्थित:', 'कई वेरिएंट समर्थित:')),
      states([
        reg('helpPcSt1', '250gm', '250 ग्रॅम', '250 ग्राम'),
        reg('helpPcSt2', '500gm', '500 ग्रॅम', '500 ग्राम'),
        reg('helpPcSt3', '1kg', '1 किलो', '1 किलो'),
        reg('helpPcSt4', '5kg', '5 किलो', '5 किलो'),
        reg('helpPcSt5', 'etc.', 'इत्यादी', 'आदि'),
      ]),
      p(reg('helpPcP3', 'Each variant has:', 'प्रत्येक प्रकारात आहे:', 'प्रत्येक वेरिएंट में है:')),
      list([
        reg('helpPcI6', 'price', 'किंमत', 'मूल्य'),
        reg('helpPcI7', 'stock', 'स्टॉक', 'स्टॉक'),
      ]),
      sub(reg('helpPcSub3', 'Step 3 — Product Images', 'पायरी 3 — उत्पादन प्रतिमा', 'चरण 3 — उत्पाद छवियां')),
      p(reg('helpPcP4', 'Supports:', 'समर्थन करते:', 'समर्थन करता है:')),
      list([
        reg('helpPcI8', 'upload', 'अपलोड', 'अपलोड'),
        reg('helpPcI9', 'image link', 'प्रतिमा लिंक', 'छवि लिंक'),
      ]),
      note(reg('helpPcNote', 'Maximum: 5 images.', 'कमाल: 5 प्रतिमा.', 'अधिकतम: 5 छवियां.')),
      sub(reg('helpPcSub4', 'Step 4 — Publish Product', 'पायरी 4 — उत्पादन प्रकाशित करा', 'चरण 4 — उत्पाद प्रकाशित करें')),
      p(reg('helpPcP5', 'User clicks "Add to Catalogue". Then:', 'वापरकर्ता "कॅटलॉगमध्ये जोडा" वर क्लिक करतो. नंतर:', 'उपयोगकर्ता "कैटलॉग में जोड़ें" पर क्लिक करता है. फिर:')),
      list([
        reg('helpPcI10', 'product becomes active', 'उत्पादन सक्रिय होते', 'उत्पाद सक्रिय हो जाता है'),
        reg('helpPcI11', 'marketplace listing created', 'मार्केटप्लेस लिस्टिंग तयार होते', 'मार्केटप्लेस लिस्टिंग बनती है'),
      ]),
    ],
  },
  {
    id: 'retailer-network', titleKey: 'helpSecRetailerNetwork', icon: 'Network',
    summaryKey: reg('helpSumRetailerNetwork', 'Distribution network management for manufacturers.', 'उत्पादकांसाठी वितरण नेटवर्क व्यवस्थापन.', 'निर्माताओं के लिए वितरण नेटवर्क प्रबंधन.'),
    blocks: [
      p(reg('helpRnP1', 'Purpose: distribution network management system.', 'उद्देश: वितरण नेटवर्क व्यवस्थापन प्रणाली.', 'उद्देश्य: वितरण नेटवर्क प्रबंधन सिस्टम.')),
      sub(reg('helpRnSub1', 'Manufacturer Can', 'उत्पादक हे करू शकतो', 'निर्माता यह कर सकता है')),
      list([
        reg('helpRnI1', 'Add retailers', 'किरकोळ विक्रेते जोडा', 'रिटेलर जोड़ें'),
        reg('helpRnI2', 'Link existing retailers', 'विद्यमान किरकोळ विक्रेते लिंक करा', 'मौजूदा रिटेलरों को लिंक करें'),
        reg('helpRnI3', 'Assign products', 'उत्पादने नियुक्त करा', 'उत्पाद असाइन करें'),
        reg('helpRnI4', 'Manage retailer relationships', 'किरकोळ विक्रेता संबंध व्यवस्थापित करा', 'रिटेलर संबंध प्रबंधित करें'),
      ]),
      sub(reg('helpRnSub2', 'Retailer States', 'किरकोळ विक्रेता स्थिती', 'रिटेलर स्थितियां')),
      states([
        reg('helpRnSt1', 'Active', 'सक्रिय', 'सक्रिय'),
        reg('helpRnSt2', 'Pending', 'प्रलंबित', 'लंबित'),
        reg('helpRnSt3', 'Removed', 'काढून टाकले', 'हटाया गया'),
      ]),
    ],
  },
  {
    id: 'retailer-onboarding', titleKey: 'helpSecRetailerOnboarding', icon: 'Users',
    summaryKey: reg('helpSumRetailerOnboarding', 'Onboarding new retailers and linking existing ones.', 'नवीन किरकोळ विक्रेते ऑनबोर्ड करणे आणि विद्यमान लिंक करणे.', 'नए रिटेलरों को ऑनबोर्ड करना और मौजूदा को लिंक करना.'),
    blocks: [
      sub(reg('helpRoSubA', 'Flow A — New Retailer', 'प्रवाह अ — नवीन किरकोळ विक्रेता', 'प्रवाह अ — नया रिटेलर')),
      p(reg('helpRoP1', 'Step 1 — Enter:', 'पायरी 1 — प्रविष्ट करा:', 'चरण 1 — दर्ज करें:')),
      list([
        reg('helpRoI1', 'Shop name', 'दुकानाचे नाव', 'दुकान का नाम'),
        reg('helpRoI2', 'Owner name', 'मालकाचे नाव', 'मालिक का नाम'),
        reg('helpRoI3', 'Phone', 'फोन', 'फोन'),
        reg('helpRoI4', 'Email', 'ईमेल', 'ईमेल'),
        reg('helpRoI5', 'Address', 'पत्ता', 'पता'),
        reg('helpRoI6', 'City', 'शहर', 'शहर'),
        reg('helpRoI7', 'State', 'राज्य', 'राज्य'),
        reg('helpRoI8', 'Pincode', 'पिनकोड', 'पिनकोड'),
      ]),
      p(reg('helpRoP2', 'Step 2 — Maps Integration supports:', 'पायरी 2 — Maps एकत्रीकरण समर्थन करते:', 'चरण 2 — Maps एकीकरण समर्थन करता है:')),
      list([
        reg('helpRoI9', 'Maps search', 'Maps शोध', 'Maps खोज'),
        reg('helpRoI10', 'Current location', 'सध्याचे स्थान', 'वर्तमान स्थान'),
        reg('helpRoI11', 'Maps link', 'Maps लिंक', 'Maps लिंक'),
      ]),
      p(reg('helpRoP3', 'Step 3 — Location Pinning. The system:', 'पायरी 3 — स्थान पिनिंग. प्रणाली:', 'चरण 3 — स्थान पिनिंग. सिस्टम:')),
      list([
        reg('helpRoI12', 'detects coordinates', 'निर्देशांक शोधते', 'निर्देशांक का पता लगाता है'),
        reg('helpRoI13', 'previews map', 'नकाशा पूर्वावलोकन करते', 'मानचित्र का पूर्वावलोकन करता है'),
        reg('helpRoI14', 'autofills address', 'पत्ता स्वयं भरते', 'पता स्वतः भरता है'),
      ]),
      p(reg('helpRoP4', 'Step 4 — Retailer Creation. The system:', 'पायरी 4 — किरकोळ विक्रेता निर्मिती. प्रणाली:', 'चरण 4 — रिटेलर निर्माण. सिस्टम:')),
      list([
        reg('helpRoI15', 'creates retailer profile', 'किरकोळ विक्रेता प्रोफाइल तयार करते', 'रिटेलर प्रोफ़ाइल बनाता है'),
        reg('helpRoI16', 'generates invite code', 'आमंत्रण कोड तयार करते', 'आमंत्रण कोड उत्पन्न करता है'),
        reg('helpRoI17', 'creates network entry', 'नेटवर्क नोंद तयार करते', 'नेटवर्क प्रविष्टि बनाता है'),
      ]),
      sub(reg('helpRoSubB', 'Flow B — Existing Retailer Linking', 'प्रवाह ब — विद्यमान किरकोळ विक्रेता लिंकिंग', 'प्रवाह ब — मौजूदा रिटेलर लिंकिंग')),
      p(reg('helpRoP5', 'Manufacturer can:', 'उत्पादक हे करू शकतो:', 'निर्माता यह कर सकता है:')),
      list([
        reg('helpRoI18', 'search retailer', 'किरकोळ विक्रेता शोधा', 'रिटेलर खोजें'),
        reg('helpRoI19', 'select retailer', 'किरकोळ विक्रेता निवडा', 'रिटेलर चुनें'),
        reg('helpRoI20', 'directly connect retailer', 'थेट किरकोळ विक्रेता जोडा', 'सीधे रिटेलर कनेक्ट करें'),
      ]),
    ],
  },
  {
    id: 'invite', titleKey: 'helpSecInvite', icon: 'Share',
    summaryKey: reg('helpSumInvite', 'Invite codes and fast retailer onboarding.', 'आमंत्रण कोड आणि जलद किरकोळ विक्रेता ऑनबोर्डिंग.', 'आमंत्रण कोड और तेज़ रिटेलर ऑनबोर्डिंग.'),
    blocks: [
      p(reg('helpInvP1', 'Each retailer gets:', 'प्रत्येक किरकोळ विक्रेत्याला मिळते:', 'प्रत्येक रिटेलर को मिलता है:')),
      list([
        reg('helpInvI1', 'Invite code', 'आमंत्रण कोड', 'आमंत्रण कोड'),
        reg('helpInvI2', 'Copy link', 'लिंक कॉपी करा', 'लिंक कॉपी करें'),
        reg('helpInvI3', 'WhatsApp sharing', 'WhatsApp शेअरिंग', 'WhatsApp शेयरिंग'),
        reg('helpInvI4', 'Email sharing', 'ईमेल शेअरिंग', 'ईमेल शेयरिंग'),
      ]),
      note(reg('helpInvNote', 'Purpose: fast retailer onboarding.', 'उद्देश: जलद किरकोळ विक्रेता ऑनबोर्डिंग.', 'उद्देश्य: तेज़ रिटेलर ऑनबोर्डिंग.')),
    ],
  },
  {
    id: 'assignment', titleKey: 'helpSecAssignment', icon: 'Clipboard',
    summaryKey: reg('helpSumAssignment', 'Assigning catalogue and marketplace products to retailers.', 'किरकोळ विक्रेत्यांना कॅटलॉग आणि मार्केटप्लेस उत्पादने नियुक्त करणे.', 'रिटेलरों को कैटलॉग और मार्केटप्लेस उत्पाद असाइन करना.'),
    blocks: [
      p(reg('helpAsP1', 'Manufacturer can assign:', 'उत्पादक नियुक्त करू शकतो:', 'निर्माता असाइन कर सकता है:')),
      list([
        reg('helpAsI1', 'own catalogue products', 'स्वतःची कॅटलॉग उत्पादने', 'अपने कैटलॉग उत्पाद'),
        reg('helpAsI2', 'marketplace products', 'मार्केटप्लेस उत्पादने', 'मार्केटप्लेस उत्पाद'),
      ]),
      p(reg('helpAsP2', 'to retailers.', 'किरकोळ विक्रेत्यांना.', 'रिटेलरों को.')),
      sub(reg('helpAsSub1', 'Rules', 'नियम', 'नियम')),
      list([
        reg('helpAsI3', '1 assignment = 1 seat', '1 नियुक्ती = 1 सीट', '1 असाइनमेंट = 1 सीट'),
        reg('helpAsI4', 'monthly seat basis', 'मासिक सीट आधार', 'मासिक सीट आधार'),
        reg('helpAsI5', 'products removable/reassignable', 'उत्पादने काढता/पुन्हा नियुक्त करता येतात', 'उत्पाद हटाने/पुनः असाइन करने योग्य'),
      ]),
    ],
  },
  {
    id: 'retailer-details', titleKey: 'helpSecRetailerDetails', icon: 'Users',
    summaryKey: reg('helpSumRetailerDetails', 'The retailer side panel: info, geo data and actions.', 'किरकोळ विक्रेता साइड पॅनेल: माहिती, भौगोलिक डेटा आणि क्रिया.', 'रिटेलर साइड पैनल: जानकारी, जियो डेटा और क्रियाएं.'),
    blocks: [
      sub(reg('helpRdSub1', 'Side Panel Includes — Basic Info', 'साइड पॅनेलमध्ये समाविष्ट — मूलभूत माहिती', 'साइड पैनल में शामिल — मूल जानकारी')),
      list([
        reg('helpRdI1', 'Shop name', 'दुकानाचे नाव', 'दुकान का नाम'),
        reg('helpRdI2', 'Owner name', 'मालकाचे नाव', 'मालिक का नाम'),
        reg('helpRdI3', 'Phone', 'फोन', 'फोन'),
        reg('helpRdI4', 'Email', 'ईमेल', 'ईमेल'),
        reg('helpRdI5', 'Address', 'पत्ता', 'पता'),
        reg('helpRdI6', 'Full address', 'संपूर्ण पत्ता', 'पूरा पता'),
        reg('helpRdI7', 'City', 'शहर', 'शहर'),
        reg('helpRdI8', 'State', 'राज्य', 'राज्य'),
        reg('helpRdI9', 'Pincode', 'पिनकोड', 'पिनकोड'),
      ]),
      sub(reg('helpRdSub2', 'Geo Data', 'भौगोलिक डेटा', 'जियो डेटा')),
      list([
        reg('helpRdI10', 'Coordinates', 'निर्देशांक', 'निर्देशांक'),
        reg('helpRdI11', 'Maps preview', 'Maps पूर्वावलोकन', 'Maps पूर्वावलोकन'),
      ]),
      sub(reg('helpRdSub3', 'Actions', 'क्रिया', 'क्रियाएं')),
      list([
        reg('helpRdI12', 'View details', 'तपशील पहा', 'विवरण देखें'),
        reg('helpRdI13', 'Edit retailer', 'किरकोळ विक्रेता संपादित करा', 'रिटेलर संपादित करें'),
        reg('helpRdI14', 'Assign products', 'उत्पादने नियुक्त करा', 'उत्पाद असाइन करें'),
        reg('helpRdI15', 'Remove retailer', 'किरकोळ विक्रेता काढा', 'रिटेलर हटाएं'),
      ]),
    ],
  },
  {
    id: 'subscription-mgmt', titleKey: 'helpSecSubscriptionMgmt', icon: 'Payment',
    summaryKey: reg('helpSumSubscriptionMgmt', 'Seat management, dynamic pricing and payment success.', 'सीट व्यवस्थापन, डायनॅमिक किंमत आणि पेमेंट यश.', 'सीट प्रबंधन, डायनामिक मूल्य और भुगतान सफलता.'),
    blocks: [
      sub(reg('helpSmSub1', 'Core Features', 'मुख्य वैशिष्ट्ये', 'मुख्य विशेषताएं')),
      list([
        reg('helpSmI1', 'seat management', 'सीट व्यवस्थापन', 'सीट प्रबंधन'),
        reg('helpSmI2', 'expiry tracking', 'समाप्ती ट्रॅकिंग', 'समाप्ति ट्रैकिंग'),
        reg('helpSmI3', 'payment history', 'पेमेंट इतिहास', 'भुगतान इतिहास'),
        reg('helpSmI4', 'active listings', 'सक्रिय लिस्टिंग', 'सक्रिय लिस्टिंग'),
      ]),
      sub(reg('helpSmSub2', 'Dynamic Pricing', 'डायनॅमिक किंमत', 'डायनामिक मूल्य')),
      p(reg('helpSmP1', 'Calculated using:', 'याद्वारे गणना केली जाते:', 'इसका उपयोग करके गणना की जाती है:')),
      list([
        reg('helpSmI5', 'duration', 'कालावधी', 'अवधि'),
        reg('helpSmI6', 'seat count', 'सीट संख्या', 'सीट संख्या'),
        reg('helpSmI7', 'discount', 'सूट', 'छूट'),
      ]),
      sub(reg('helpSmSub3', 'Promo Support', 'प्रोमो समर्थन', 'प्रोमो समर्थन')),
      list([
        reg('helpSmI8', 'promo validation', 'प्रोमो प्रमाणीकरण', 'प्रोमो सत्यापन'),
        reg('helpSmI9', 'final recalculation', 'अंतिम पुनर्गणना', 'अंतिम पुनर्गणना'),
      ]),
      sub(reg('helpSmSub4', 'Payment Success Flow', 'पेमेंट यश प्रवाह', 'भुगतान सफलता प्रवाह')),
      list([
        reg('helpSmI10', 'activate subscription', 'सदस्यता सक्रिय करा', 'सदस्यता सक्रिय करें'),
        reg('helpSmI11', 'allocate seats', 'सीट वाटप करा', 'सीटें आवंटित करें'),
        reg('helpSmI12', 'unlock dashboard', 'डॅशबोर्ड अनलॉक करा', 'डैशबोर्ड अनलॉक करें'),
      ]),
    ],
  },
  {
    id: 'listing', titleKey: 'helpSecListing', icon: 'ListChecks',
    summaryKey: reg('helpSumListing', 'Tracking listings, states and expiry logic.', 'लिस्टिंग, स्थिती आणि समाप्ती लॉजिक ट्रॅक करणे.', 'लिस्टिंग, स्थितियों और समाप्ति लॉजिक को ट्रैक करना.'),
    blocks: [
      sub(reg('helpLsSub1', 'Tracks', 'ट्रॅक करते', 'ट्रैक करता है')),
      list([
        reg('helpLsI1', 'active listings', 'सक्रिय लिस्टिंग', 'सक्रिय लिस्टिंग'),
        reg('helpLsI2', 'assigned listings', 'नियुक्त लिस्टिंग', 'असाइन की गई लिस्टिंग'),
        reg('helpLsI3', 'retailer listings', 'किरकोळ विक्रेता लिस्टिंग', 'रिटेलर लिस्टिंग'),
        reg('helpLsI4', 'expiry', 'समाप्ती', 'समाप्ति'),
        reg('helpLsI5', 'listing status', 'लिस्टिंग स्थिती', 'लिस्टिंग स्थिति'),
      ]),
      sub(reg('helpLsSub2', 'Listing States', 'लिस्टिंग स्थिती', 'लिस्टिंग स्थितियां')),
      states([
        reg('helpLsSt1', 'Active', 'सक्रिय', 'सक्रिय'),
        reg('helpLsSt2', 'Removed', 'काढून टाकले', 'हटाया गया'),
        reg('helpLsSt3', 'Expiring Soon', 'लवकरच समाप्त होणारे', 'जल्द समाप्त होने वाला'),
      ]),
      sub(reg('helpLsSub3', 'Expiry Logic', 'समाप्ती लॉजिक', 'समाप्ति लॉजिक')),
      p(reg('helpLsP1', 'When expired:', 'समाप्त झाल्यावर:', 'समाप्त होने पर:')),
      list([
        reg('helpLsI6', 'listing becomes inactive', 'लिस्टिंग निष्क्रिय होते', 'लिस्टिंग निष्क्रिय हो जाती है'),
        reg('helpLsI7', 'seat released', 'सीट मुक्त होते', 'सीट जारी हो जाती है'),
      ]),
    ],
  },
  {
    id: 'orders', titleKey: 'helpSecOrders', icon: 'Orders',
    summaryKey: reg('helpSumOrders', 'Order placement, fulfillment and dispatch.', 'ऑर्डर प्लेसमेंट, पूर्तता आणि पाठवणी.', 'ऑर्डर प्लेसमेंट, पूर्ति और डिस्पैच.'),
    blocks: [
      sub(reg('helpOrSub1', 'Farmer Flow', 'शेतकरी प्रवाह', 'किसान प्रवाह')),
      steps([
        reg('helpOrS1', 'Farmer views product', 'शेतकरी उत्पादन पाहतो', 'किसान उत्पाद देखता है'),
        reg('helpOrS2', 'Farmer places order', 'शेतकरी ऑर्डर देतो', 'किसान ऑर्डर देता है'),
        reg('helpOrS3', 'Delivery request generated', 'डिलिव्हरी विनंती तयार होते', 'डिलीवरी अनुरोध उत्पन्न होता है'),
      ]),
      sub(reg('helpOrSub2', 'Manufacturer Flow', 'उत्पादक प्रवाह', 'निर्माता प्रवाह')),
      p(reg('helpOrP1', 'Manufacturer can:', 'उत्पादक हे करू शकतो:', 'निर्माता यह कर सकता है:')),
      list([
        reg('helpOrI1', 'view orders', 'ऑर्डर पहा', 'ऑर्डर देखें'),
        reg('helpOrI2', 'update order status', 'ऑर्डर स्थिती अद्यतनित करा', 'ऑर्डर स्थिति अपडेट करें'),
        reg('helpOrI3', 'manage dispatch', 'पाठवणी व्यवस्थापित करा', 'डिस्पैच प्रबंधित करें'),
        reg('helpOrI4', 'manage delivery', 'डिलिव्हरी व्यवस्थापित करा', 'डिलीवरी प्रबंधित करें'),
      ]),
      note(reg('helpOrNote', 'Purpose: commerce fulfillment management.', 'उद्देश: वाणिज्य पूर्तता व्यवस्थापन.', 'उद्देश्य: वाणिज्य पूर्ति प्रबंधन.')),
    ],
  },
  {
    id: 'reviews', titleKey: 'helpSecReviews', icon: 'Review',
    summaryKey: reg('helpSumReviews', 'The trust & reputation system.', 'विश्वास आणि प्रतिष्ठा प्रणाली.', 'विश्वास और प्रतिष्ठा प्रणाली.'),
    blocks: [
      sub(reg('helpRvSub1', 'Customer Review Journey', 'ग्राहक पुनरावलोकन प्रवास', 'ग्राहक समीक्षा यात्रा')),
      steps([
        reg('helpRvS1', 'Farmer purchases product', 'शेतकरी उत्पादन खरेदी करतो', 'किसान उत्पाद खरीदता है'),
        reg('helpRvS2', 'Farmer uses product', 'शेतकरी उत्पादन वापरतो', 'किसान उत्पाद का उपयोग करता है'),
        reg('helpRvS3', 'Farmer submits rating, comments and experience', 'शेतकरी रेटिंग, टिप्पण्या आणि अनुभव सबमिट करतो', 'किसान रेटिंग, टिप्पणियां और अनुभव सबमिट करता है'),
      ]),
      p(reg('helpRvP1', 'The review then appears on:', 'त्यानंतर पुनरावलोकन येथे दिसते:', 'समीक्षा फिर यहां दिखाई देती है:')),
      list([
        reg('helpRvI1', 'manufacturer dashboard', 'उत्पादक डॅशबोर्ड', 'निर्माता डैशबोर्ड'),
        reg('helpRvI2', 'marketplace reputation layer', 'मार्केटप्लेस प्रतिष्ठा स्तर', 'मार्केटप्लेस प्रतिष्ठा परत'),
      ]),
      note(reg('helpRvNote', 'Purpose: a trust & reputation system.', 'उद्देश: विश्वास आणि प्रतिष्ठा प्रणाली.', 'उद्देश्य: एक विश्वास और प्रतिष्ठा प्रणाली.')),
    ],
  },
  {
    id: 'profile-settings', titleKey: 'helpSecProfileSettings', icon: 'Settings',
    summaryKey: reg('helpSumProfileSettings', 'Business profile, maps features and social platforms.', 'व्यवसाय प्रोफाइल, नकाशा वैशिष्ट्ये आणि सोशल प्लॅटफॉर्म.', 'व्यवसाय प्रोफ़ाइल, मानचित्र सुविधाएं और सोशल प्लेटफ़ॉर्म.'),
    blocks: [
      sub(reg('helpPsSub1', 'Profile Includes', 'प्रोफाइलमध्ये समाविष्ट', 'प्रोफ़ाइल में शामिल')),
      list([
        reg('helpPsI1', 'business identity', 'व्यवसाय ओळख', 'व्यवसाय पहचान'),
        reg('helpPsI2', 'owner info', 'मालक माहिती', 'मालिक जानकारी'),
        reg('helpPsI3', 'contact details', 'संपर्क तपशील', 'संपर्क विवरण'),
        reg('helpPsI4', 'location', 'स्थान', 'स्थान'),
        reg('helpPsI5', 'social links', 'सोशल लिंक', 'सोशल लिंक'),
        reg('helpPsI6', 'product showcase', 'उत्पादन प्रदर्शन', 'उत्पाद शोकेस'),
      ]),
      sub(reg('helpPsSub2', 'Maps Features', 'नकाशा वैशिष्ट्ये', 'मानचित्र सुविधाएं')),
      list([
        reg('helpPsI7', 'address autofill', 'पत्ता स्वयं भरणे', 'पता स्वतः भरना'),
        reg('helpPsI8', 'geo location', 'भौगोलिक स्थान', 'जियो लोकेशन'),
        reg('helpPsI9', 'map pinning', 'नकाशा पिनिंग', 'मानचित्र पिनिंग'),
        reg('helpPsI10', 'GPS support', 'GPS समर्थन', 'GPS समर्थन'),
      ]),
      sub(reg('helpPsSub3', 'Social Platforms', 'सोशल प्लॅटफॉर्म', 'सोशल प्लेटफ़ॉर्म')),
      states([
        reg('helpPsSt1', 'Instagram', 'Instagram', 'Instagram'),
        reg('helpPsSt2', 'Facebook', 'Facebook', 'Facebook'),
        reg('helpPsSt3', 'WhatsApp', 'WhatsApp', 'WhatsApp'),
        reg('helpPsSt4', 'YouTube', 'YouTube', 'YouTube'),
      ]),
    ],
  },
  {
    id: 'settings', titleKey: 'helpSecSettings', icon: 'Settings',
    summaryKey: reg('helpSumSettings', 'Delivery toggle, visibility and business configuration.', 'डिलिव्हरी टॉगल, दृश्यमानता आणि व्यवसाय कॉन्फिगरेशन.', 'डिलीवरी टॉगल, दृश्यता और व्यवसाय कॉन्फ़िगरेशन.'),
    blocks: [
      sub(reg('helpSeSub1', 'Controls', 'नियंत्रणे', 'नियंत्रण')),
      list([
        reg('helpSeI1', 'Online delivery toggle', 'ऑनलाइन डिलिव्हरी टॉगल', 'ऑनलाइन डिलीवरी टॉगल'),
        reg('helpSeI2', 'seller visibility', 'विक्रेता दृश्यमानता', 'विक्रेता दृश्यता'),
        reg('helpSeI3', 'business configuration', 'व्यवसाय कॉन्फिगरेशन', 'व्यवसाय कॉन्फ़िगरेशन'),
        reg('helpSeI4', 'tagline settings', 'टॅगलाइन सेटिंग्ज', 'टैगलाइन सेटिंग्स'),
      ]),
      sub(reg('helpSeSub2', 'Online Delivery Enabled', 'ऑनलाइन डिलिव्हरी सक्षम', 'ऑनलाइन डिलीवरी सक्षम')),
      list([
        reg('helpSeI5', 'orders accepted', 'ऑर्डर स्वीकारले जातात', 'ऑर्डर स्वीकार किए जाते हैं'),
        reg('helpSeI6', 'delivery active', 'डिलिव्हरी सक्रिय', 'डिलीवरी सक्रिय'),
        reg('helpSeI7', 'marketplace visibility active', 'मार्केटप्लेस दृश्यमानता सक्रिय', 'मार्केटप्लेस दृश्यता सक्रिय'),
      ]),
      sub(reg('helpSeSub3', 'Disabled State', 'अक्षम स्थिती', 'अक्षम स्थिति')),
      list([
        reg('helpSeI8', 'orders blocked', 'ऑर्डर अवरोधित', 'ऑर्डर अवरुद्ध'),
        reg('helpSeI9', 'delivery disabled', 'डिलिव्हरी अक्षम', 'डिलीवरी अक्षम'),
      ]),
    ],
  },
  {
    id: 'architecture', titleKey: 'helpSecArchitecture', icon: 'Network',
    summaryKey: reg('helpSumArchitecture', 'The full layered architecture, top to bottom.', 'संपूर्ण स्तरित आर्किटेक्चर, वरपासून खालपर्यंत.', 'संपूर्ण स्तरित आर्किटेक्चर, ऊपर से नीचे तक.'),
    blocks: [
      p(reg('helpArP1', 'The complete KrishiDukan portal architecture flows top-to-bottom through the following layers:', 'संपूर्ण KrishiDukan पोर्टल आर्किटेक्चर खालील स्तरांमधून वरपासून खालपर्यंत वाहते:', 'संपूर्ण KrishiDukan पोर्टल आर्किटेक्चर निम्नलिखित परतों के माध्यम से ऊपर से नीचे प्रवाहित होता है:')),
      {
        kind: 'flow',
        layers: [
          { titleKey: reg('helpArL1', 'Public Layer', 'सार्वजनिक स्तर', 'सार्वजनिक परत'), keys: [L.home, L.market, L.hub, L.stores] },
          { titleKey: reg('helpArL2', 'Authentication Layer', 'प्रमाणीकरण स्तर', 'प्रमाणीकरण परत'),
            keys: [reg('helpArL2a', 'Registration', 'नोंदणी', 'पंजीकरण'), reg('helpArL2b', 'OTP Login', 'OTP लॉगिन', 'OTP लॉगिन'), reg('helpArL2c', 'Role Selection', 'भूमिका निवड', 'भूमिका चयन')] },
          { titleKey: reg('helpArL3', 'Subscription Layer', 'सदस्यता स्तर', 'सदस्यता परत'),
            keys: [reg('helpArL3a', 'Plans', 'योजना', 'प्लान'), reg('helpArL3b', 'Seats', 'सीट', 'सीटें'), reg('helpArL3c', 'Payments', 'पेमेंट', 'भुगतान')] },
          { titleKey: reg('helpArL4', 'Business Dashboard Layer', 'व्यवसाय डॅशबोर्ड स्तर', 'व्यवसाय डैशबोर्ड परत'),
            keys: [
              reg('helpArL4a', 'Overview', 'आढावा', 'अवलोकन'),
              reg('helpArL4b', 'Analytics', 'विश्लेषण', 'एनालिटिक्स'),
              reg('helpArL4c', 'Inventory', 'इन्व्हेंटरी', 'इन्वेंटरी'),
              reg('helpArL4d', 'Retailer Network', 'किरकोळ विक्रेता नेटवर्क', 'रिटेलर नेटवर्क'),
              reg('helpArL4e', 'Subscription', 'सदस्यता', 'सदस्यता'),
              reg('helpArL4f', 'Orders', 'ऑर्डर', 'ऑर्डर'),
              reg('helpArL4g', 'Reviews', 'पुनरावलोकने', 'समीक्षाएं'),
              reg('helpArL4h', 'Profile', 'प्रोफाइल', 'प्रोफ़ाइल'),
              reg('helpArL4i', 'Settings', 'सेटिंग्ज', 'सेटिंग्स'),
            ] },
          { titleKey: reg('helpArL5', 'Marketplace Commerce Layer', 'मार्केटप्लेस वाणिज्य स्तर', 'मार्केटप्लेस वाणिज्य परत'),
            keys: [
              reg('helpArL5a', 'Listings', 'लिस्टिंग', 'लिस्टिंग'),
              reg('helpArL5b', 'Distribution', 'वितरण', 'वितरण'),
              reg('helpArL5c', 'Orders', 'ऑर्डर', 'ऑर्डर'),
              reg('helpArL5d', 'Delivery', 'डिलिव्हरी', 'डिलीवरी'),
              reg('helpArL5e', 'Reviews', 'पुनरावलोकने', 'समीक्षाएं'),
            ] },
          { titleKey: reg('helpArL6', 'Agricultural Ecosystem Layer', 'कृषी परिसंस्था स्तर', 'कृषि पारिस्थितिकी परत'),
            keys: [
              reg('helpArL6a', 'Farmers', 'शेतकरी', 'किसान'),
              reg('helpArL6b', 'Retailers', 'किरकोळ विक्रेते', 'रिटेलर'),
              reg('helpArL6c', 'Manufacturers', 'उत्पादक', 'निर्माता'),
              reg('helpArL6d', 'Marketplace', 'मार्केटप्लेस', 'मार्केटप्लेस'),
              reg('helpArL6e', 'Crop Guidance', 'पीक मार्गदर्शन', 'फसल मार्गदर्शन'),
              reg('helpArL6f', 'Distribution Network', 'वितरण नेटवर्क', 'वितरण नेटवर्क'),
            ] },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Emit helpContent.ts
// ---------------------------------------------------------------------------
function blockToSrc(b) {
  if (b.kind === 'p' || b.kind === 'sub' || b.kind === 'note') return `{ kind: '${b.kind}', key: '${b.key}' }`;
  if (b.kind === 'list' || b.kind === 'steps' || b.kind === 'states')
    return `{ kind: '${b.kind}', keys: [${b.keys.map((k) => `'${k}'`).join(', ')}] }`;
  if (b.kind === 'flow') {
    const layers = b.layers
      .map((l) => `        { titleKey: '${l.titleKey}', keys: [${l.keys.map((k) => `'${k}'`).join(', ')}] }`)
      .join(',\n');
    return `{\n      kind: 'flow',\n      layers: [\n${layers},\n      ],\n    }`;
  }
  throw new Error('unknown block ' + b.kind);
}

const sectionsSrc = SECTIONS.map((s) => {
  const blocks = s.blocks.map((b) => `      ${blockToSrc(b)}`).join(',\n');
  return `  {
    id: '${s.id}',
    titleKey: '${s.titleKey}',
    icon: '${s.icon}',
    summaryKey: '${s.summaryKey}',
    blocks: [
${blocks},
    ],
  }`;
}).join(',\n');

const contentFile = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structured documentation content for the KrishiDukan Help / Documentation page.
 *
 * This is the single source of truth for the Help page body. It mirrors the full
 * "KrishiDukan Portal — Complete Functional Flow" reference document, section by
 * section, with NO content omitted.
 *
 * IMPORTANT (multilingual): every user-visible string is an i18n KEY, not literal
 * text. HelpView resolves each key through the existing \`useI18n().t()\` hook, so the
 * whole page (titles, summaries, paragraphs, lists, steps, chips, notes and the
 * architecture map) switches with the selected portal language exactly like the
 * rest of the platform. To add a future documentation module, register its strings
 * in app/i18n/translations.ts (en/mr/hi) and reference the keys here.
 *
 * Block model (each holds translation key(s), never literal copy):
 *  - 'p'      → a paragraph of prose            ({ key })
 *  - 'sub'    → a sub-heading inside a section   ({ key })
 *  - 'note'   → a highlighted callout            ({ key })
 *  - 'list'   → a bulleted list                  ({ keys[] })
 *  - 'steps'  → an ordered (numbered) list       ({ keys[] })
 *  - 'states' → a row of small "state/tag" chips ({ keys[] })
 *  - 'flow'   → an arrow-connected layer diagram ({ layers: { titleKey, keys[] }[] })
 *
 * THIS FILE IS GENERATED by scripts/gen-help-i18n.js — edit the generator, not this.
 */

import type { translations } from '../i18n/translations';

type TranslationKey = keyof typeof translations['en'];

export type HelpBlock =
  | { kind: 'p'; key: TranslationKey }
  | { kind: 'sub'; key: TranslationKey }
  | { kind: 'note'; key: TranslationKey }
  | { kind: 'list'; keys: TranslationKey[] }
  | { kind: 'steps'; keys: TranslationKey[] }
  | { kind: 'states'; keys: TranslationKey[] }
  | { kind: 'flow'; layers: { titleKey: TranslationKey; keys: TranslationKey[] }[] };

export interface HelpSection {
  /** Stable anchor id used for the URL hash, TOC links and scroll-spy. */
  id: string;
  /** i18n key for the section title shown in the TOC and section header. */
  titleKey: TranslationKey;
  /** Icon key from ICONS in app/constants.ts. */
  icon: keyof typeof import('../constants')['ICONS'];
  /** i18n key for the short one-line summary shown under the section title. */
  summaryKey: TranslationKey;
  /** Ordered content blocks rendered inside the section body. */
  blocks: HelpBlock[];
}

export const HELP_SECTIONS: HelpSection[] = [
${sectionsSrc},
];
`;

fs.writeFileSync(path.join(__dirname, '..', 'app', 'views', 'helpContent.ts'), contentFile, 'utf8');

// ---------------------------------------------------------------------------
// Emit translation entries per language
// ---------------------------------------------------------------------------
function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
const langIdx = { en: 0, mr: 1, hi: 2 };
const out = {};
for (const lang of ['en', 'mr', 'hi']) {
  const lines = Object.keys(T).map((k) => `    ${k}: '${esc(T[k][langIdx[lang]])}',`);
  out[lang] = lines.join('\n');
}
fs.writeFileSync(path.join(__dirname, 'help-i18n-en.txt'), out.en, 'utf8');
fs.writeFileSync(path.join(__dirname, 'help-i18n-mr.txt'), out.mr, 'utf8');
fs.writeFileSync(path.join(__dirname, 'help-i18n-hi.txt'), out.hi, 'utf8');

console.log('Generated helpContent.ts and 3 translation blocks. Total keys:', Object.keys(T).length);
