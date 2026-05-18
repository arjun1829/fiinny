/**
 * Centralized dictionary for contextual helper texts and the onboarding tour.
 *
 * Keep the keys flat and stable. Each entry must define an `en` string; `mr`
 * and `hi` translations are encouraged but optional — when a translation is
 * missing the helper falls back to the English text.
 */

export type HelperLang = 'en' | 'mr' | 'hi';

export interface HelperTextEntry {
  en: string;
  mr?: string;
  hi?: string;
}

export interface HelperPair {
  title?: HelperTextEntry;
  body: HelperTextEntry;
}

export const HELPER_TEXTS = {
  // --- Navbar ---
  searchBar: {
    title: { en: 'Search tip', mr: 'शोध टीप', hi: 'खोज सुझाव' },
    body: {
      en: 'Search products, crops, fertilizers, or nearby stores. Example: "Urea", "Tomato Seeds", "NPK 19:19:19"',
      mr: 'उत्पादने, पिके, खते किंवा जवळील दुकाने शोधा. उदा.: "युरिया", "टोमॅटो बियाणे", "एनपीके १९:१९:१९"',
      hi: 'उत्पाद, फसलें, उर्वरक या नज़दीकी दुकानें खोजें। उदाहरण: "यूरिया", "टमाटर के बीज", "एनपीके 19:19:19"',
    },
  },
  location: {
    title: { en: 'Why we ask', mr: 'का विचारतो', hi: 'क्यों पूछते हैं' },
    body: {
      en: 'Your location helps us show nearby stores, stock availability, and delivery range.',
      mr: 'तुमचे स्थान आम्हाला जवळील दुकाने, साठा उपलब्धता आणि वितरण श्रेणी दाखवण्यास मदत करते.',
      hi: 'आपका स्थान हमें नज़दीकी दुकानें, स्टॉक उपलब्धता और डिलीवरी रेंज दिखाने में मदद करता है।',
    },
  },

  // --- Home ---
  hero: {
    title: { en: 'Getting started', mr: 'सुरुवात कशी करावी', hi: 'शुरू कैसे करें' },
    body: {
      en: 'Start by exploring nearby products or browse crop categories below.',
      mr: 'जवळील उत्पादने शोधून सुरुवात करा किंवा खालील पिकांच्या श्रेणी पाहा.',
      hi: 'नज़दीकी उत्पादों को देखकर शुरुआत करें या नीचे फसल श्रेणियाँ ब्राउज़ करें।',
    },
  },
  shopByCrop: {
    title: { en: 'Crop hubs', mr: 'पीक हब', hi: 'फसल हब' },
    body: {
      en: 'Crop hubs organize products, fertilizers, and tools specifically for each crop.',
      mr: 'पीक हब प्रत्येक पिकासाठी विशेषतः उत्पादने, खते आणि साधने व्यवस्थित करतात.',
      hi: 'फसल हब हर फसल के लिए विशेष रूप से उत्पाद, उर्वरक और उपकरण व्यवस्थित करते हैं।',
    },
  },

  // --- Market ---
  marketFilter: {
    title: { en: 'Filters', mr: 'फिल्टर', hi: 'फ़िल्टर' },
    body: {
      en: 'Narrow products by category, availability, or nearby stores.',
      mr: 'श्रेणी, उपलब्धता किंवा जवळील दुकानांनुसार उत्पादने कमी करा.',
      hi: 'श्रेणी, उपलब्धता या नज़दीकी दुकानों के आधार पर उत्पाद सीमित करें।',
    },
  },
  marketDistance: {
    title: { en: 'Distance', mr: 'अंतर', hi: 'दूरी' },
    body: {
      en: 'Increase distance to discover more stores and products.',
      mr: 'अधिक दुकाने आणि उत्पादने शोधण्यासाठी अंतर वाढवा.',
      hi: 'अधिक दुकानें और उत्पाद खोजने के लिए दूरी बढ़ाएँ।',
    },
  },
  stockBadge: {
    title: { en: 'Stock', mr: 'साठा', hi: 'स्टॉक' },
    body: {
      en: '"Low Stock" means limited quantity available nearby.',
      mr: '"कमी साठा" म्हणजे जवळ मर्यादित प्रमाणात उपलब्ध आहे.',
      hi: '"लो स्टॉक" का अर्थ है आस-पास सीमित मात्रा उपलब्ध है।',
    },
  },

  // --- Stores ---
  storeSearch: {
    title: { en: 'Search stores', mr: 'दुकाने शोधा', hi: 'दुकानें खोजें' },
    body: {
      en: 'Search by store name, locality, or available products.',
      mr: 'दुकानाचे नाव, परिसर किंवा उपलब्ध उत्पादांनुसार शोधा.',
      hi: 'दुकान के नाम, स्थान या उपलब्ध उत्पादों से खोजें।',
    },
  },
  storeOpenNow: {
    title: { en: 'Open Now', mr: 'सध्या उघडे', hi: 'अभी खुला' },
    body: {
      en: 'Shows stores currently accepting orders or visits.',
      mr: 'सध्या ऑर्डर किंवा भेटी स्वीकारणारी दुकाने दाखवते.',
      hi: 'अभी ऑर्डर या विज़िट स्वीकार करने वाली दुकानें दिखाता है।',
    },
  },
  storeClosest: {
    title: { en: 'Closest', mr: 'सर्वात जवळचे', hi: 'सबसे नज़दीकी' },
    body: {
      en: '"Closest" is based on your currently selected location.',
      mr: '"सर्वात जवळचे" तुमच्या सध्याच्या निवडलेल्या स्थानावर आधारित आहे.',
      hi: '"सबसे नज़दीकी" आपके वर्तमान चयनित स्थान पर आधारित है।',
    },
  },
  storeMap: {
    title: { en: 'Map legend', mr: 'नकाशा सूचक', hi: 'मानचित्र संकेत' },
    body: {
      en: 'Green markers represent nearby agricultural stores. Click a store card to highlight it on the map.',
      mr: 'हिरवे मार्कर जवळील कृषी दुकाने दर्शवतात. नकाशावर हायलाइट करण्यासाठी दुकान कार्डवर क्लिक करा.',
      hi: 'हरे मार्कर पास की कृषि दुकानों को दर्शाते हैं। मानचित्र पर हाइलाइट करने के लिए स्टोर कार्ड पर क्लिक करें।',
    },
  },

  // --- Hub ---
  hubTabs: {
    title: { en: 'Hubs', mr: 'हब', hi: 'हब' },
    body: {
      en: 'Each hub contains curated seeds, fertilizers, and tools for that crop.',
      mr: 'प्रत्येक हबमध्ये त्या पिकासाठी निवडक बियाणे, खते आणि साधने असतात.',
      hi: 'प्रत्येक हब में उस फसल के लिए चुनिंदा बीज, उर्वरक और उपकरण होते हैं।',
    },
  },
  hubFeatured: {
    title: { en: 'Featured Crop', mr: 'वैशिष्ट्यीकृत पीक', hi: 'विशेष फसल' },
    body: {
      en: 'Explore agricultural solutions tailored for this crop.',
      mr: 'या पिकासाठी तयार केलेले कृषी उपाय एक्सप्लोर करा.',
      hi: 'इस फसल के लिए तैयार किए गए कृषि समाधान देखें।',
    },
  },
  hubNutrition: {
    title: { en: 'Nutrition', mr: 'पोषण', hi: 'पोषण' },
    body: {
      en: 'Targeted nutrition products improve crop growth and yield.',
      mr: 'लक्ष्यित पोषण उत्पादने पिकाची वाढ आणि उत्पादन सुधारतात.',
      hi: 'लक्षित पोषण उत्पाद फसल की वृद्धि और उपज को बेहतर बनाते हैं।',
    },
  },
  hubIrrigation: {
    title: { en: 'Irrigation', mr: 'सिंचन', hi: 'सिंचाई' },
    body: {
      en: 'Efficient irrigation tools help reduce water usage and improve consistency.',
      mr: 'कार्यक्षम सिंचन साधने पाण्याचा वापर कमी करण्यास आणि सातत्य सुधारण्यास मदत करतात.',
      hi: 'कुशल सिंचाई उपकरण पानी का उपयोग कम करने और निरंतरता बढ़ाने में मदद करते हैं।',
    },
  },

  // --- Onboarding tour ---
  tourWelcome: {
    title: {
      en: 'Welcome to Krishidukan',
      mr: 'कृषीदुकानमध्ये स्वागत आहे',
      hi: 'कृषीदुकान में आपका स्वागत है',
    },
    body: {
      en: 'Your one-stop platform for nearby agricultural supplies. Let’s show you around — it only takes a moment.',
      mr: 'जवळील कृषी पुरवठ्यासाठी तुमचे एकमेव व्यासपीठ. चला तुम्हाला फेरफटका दाखवू — फक्त एक क्षण लागेल.',
      hi: 'नज़दीकी कृषि आपूर्ति के लिए आपका एकमात्र मंच. चलिए आपको एक झलक दिखाते हैं — बस एक क्षण लगेगा।',
    },
  },
  tourSearch: {
    title: { en: 'Search anything', mr: 'काहीही शोधा', hi: 'कुछ भी खोजें' },
    body: {
      en: 'Find products, crops, fertilizers, or nearby stores — try "Urea" or "Tomato Seeds".',
      mr: 'उत्पादने, पिके, खते किंवा जवळील दुकाने शोधा — "युरिया" किंवा "टोमॅटो बियाणे" वापरून पहा.',
      hi: 'उत्पाद, फसलें, उर्वरक या नज़दीकी दुकानें खोजें — "यूरिया" या "टमाटर के बीज" आज़माएँ।',
    },
  },
  tourLocation: {
    title: { en: 'Your location', mr: 'तुमचे स्थान', hi: 'आपका स्थान' },
    body: {
      en: 'We use your location to show nearby stores, live stock, and delivery range.',
      mr: 'जवळील दुकाने, थेट साठा आणि वितरण श्रेणी दाखवण्यासाठी आम्ही तुमचे स्थान वापरतो.',
      hi: 'हम नज़दीकी दुकानें, लाइव स्टॉक और डिलीवरी रेंज दिखाने के लिए आपके स्थान का उपयोग करते हैं।',
    },
  },
  tourShopByCrop: {
    title: { en: 'Shop by Crop', mr: 'पिकानुसार खरेदी', hi: 'फसल के अनुसार खरीदें' },
    body: {
      en: 'Open a crop hub to see curated seeds, fertilizers, and tools for that crop.',
      mr: 'त्या पिकासाठी निवडक बियाणे, खते आणि साधने पाहण्यासाठी पीक हब उघडा.',
      hi: 'उस फसल के लिए चुनिंदा बीज, उर्वरक और उपकरण देखने के लिए फसल हब खोलें।',
    },
  },
  tourMarket: {
    title: {
      en: 'Marketplace filters',
      mr: 'बाजार फिल्टर',
      hi: 'मार्केटप्लेस फ़िल्टर',
    },
    body: {
      en: 'Browse products from local stores and filter by category, stock, or distance.',
      mr: 'स्थानिक दुकानांमधील उत्पादने ब्राउझ करा आणि श्रेणी, साठा किंवा अंतरानुसार फिल्टर करा.',
      hi: 'स्थानीय दुकानों के उत्पाद ब्राउज़ करें और श्रेणी, स्टॉक या दूरी से फ़िल्टर करें।',
    },
  },
  tourStores: {
    title: { en: 'Nearby stores', mr: 'जवळील दुकाने', hi: 'नज़दीकी दुकानें' },
    body: {
      en: 'View nearby agri stores on a map and get directions in one tap.',
      mr: 'जवळील कृषी दुकाने नकाशावर पाहा आणि एका टॅपमध्ये दिशा मिळवा.',
      hi: 'नज़दीकी कृषि दुकानें मानचित्र पर देखें और एक टैप में दिशा प्राप्त करें।',
    },
  },
  tourHubs: {
    title: { en: 'Crop Hubs', mr: 'पीक हब', hi: 'फसल हब' },
    body: {
      en: 'Targeted recommendations for seeds, nutrition, and irrigation per crop.',
      mr: 'प्रत्येक पिकासाठी बियाणे, पोषण आणि सिंचनासाठी लक्ष्यित शिफारसी.',
      hi: 'प्रत्येक फसल के लिए बीज, पोषण और सिंचाई की लक्षित सिफारिशें।',
    },
  },

  // --- Market: extended ---
  marketCategories: {
    title: { en: 'Categories', mr: 'श्रेणी', hi: 'श्रेणियाँ' },
    body: {
      en: 'Browse products grouped by Seeds, Fertilizers, Pesticides, or Tools.',
      mr: 'बियाणे, खते, कीटकनाशके किंवा साधने अशा गटांनुसार उत्पादने पाहा.',
      hi: 'बीज, उर्वरक, कीटनाशक या उपकरणों के अनुसार समूहीकृत उत्पाद देखें।',
    },
  },
  marketNearbyStore: {
    title: { en: 'Nearby store', mr: 'जवळील दुकान', hi: 'नज़दीकी दुकान' },
    body: {
      en: 'Sold by this local store, with the distance from your selected location.',
      mr: 'या स्थानिक दुकानात विकले जाते, तुमच्या निवडलेल्या स्थानापासूनचे अंतर.',
      hi: 'इस स्थानीय दुकान द्वारा बेचा जाता है, आपके चयनित स्थान से दूरी सहित।',
    },
  },
  marketPriceInfo: {
    title: { en: 'Price', mr: 'किंमत', hi: 'मूल्य' },
    body: {
      en: 'Latest store price. A struck-through value shows the original price before discount.',
      mr: 'दुकानाची ताजी किंमत. कापलेली किंमत सवलतीपूर्वीची मूळ किंमत दर्शवते.',
      hi: 'दुकान का ताज़ा मूल्य। काटा गया मूल्य छूट से पहले की मूल कीमत दर्शाता है।',
    },
  },
  marketAddToCart: {
    title: { en: 'Quick add', mr: 'त्वरित जोडा', hi: 'त्वरित जोड़ें' },
    body: {
      en: 'Opens the product details to confirm size, stock, and the nearest store before reserving.',
      mr: 'राखीव करण्यापूर्वी आकार, साठा आणि जवळचे दुकान खात्री करण्यासाठी उत्पादन तपशील उघडते.',
      hi: 'आरक्षित करने से पहले आकार, स्टॉक और निकटतम दुकान की पुष्टि के लिए उत्पाद विवरण खोलता है।',
    },
  },
  marketUnits: {
    title: { en: 'Pack size', mr: 'पॅक आकार', hi: 'पैक का आकार' },
    body: {
      en: 'Quantity in one pack — compare sizes before choosing.',
      mr: 'एका पॅकमधील प्रमाण — निवडण्यापूर्वी आकारांची तुलना करा.',
      hi: 'एक पैक में मात्रा — चुनने से पहले आकारों की तुलना करें।',
    },
  },

  // --- Product Detail ---
  productInsights: {
    title: { en: 'Product insights', mr: 'उत्पादन माहिती', hi: 'उत्पाद जानकारी' },
    body: {
      en: 'Key facts about the product — composition, how to apply, and best-fit crops.',
      mr: 'उत्पादनाची प्रमुख माहिती — रचना, वापर पद्धत आणि योग्य पिके.',
      hi: 'उत्पाद के मुख्य तथ्य — संरचना, उपयोग विधि और उपयुक्त फसलें।',
    },
  },
  productComposition: {
    title: { en: 'Composition', mr: 'रचना', hi: 'संरचना' },
    body: {
      en: 'Active nutrient percentages in this product.',
      mr: 'या उत्पादनातील सक्रिय पोषक घटकांची टक्केवारी.',
      hi: 'इस उत्पाद में सक्रिय पोषक तत्वों का प्रतिशत।',
    },
  },
  productDosage: {
    title: { en: 'Recommended dosage', mr: 'शिफारस केलेले प्रमाण', hi: 'अनुशंसित मात्रा' },
    body: {
      en: 'Use this dosage as a starting point. Always follow the label and consult your local agronomist.',
      mr: 'हे प्रमाण सुरुवात म्हणून वापरा. लेबल वाचा आणि स्थानिक कृषितज्ज्ञांचा सल्ला घ्या.',
      hi: 'इस मात्रा को शुरुआती बिंदु मानें। हमेशा लेबल पढ़ें और स्थानीय कृषि विशेषज्ञ से सलाह लें।',
    },
  },
  productApplication: {
    title: { en: 'Application', mr: 'वापर', hi: 'प्रयोग' },
    body: {
      en: 'How and when to apply this product for the best results.',
      mr: 'सर्वोत्तम परिणामांसाठी हे उत्पादन कधी आणि कसे वापरावे.',
      hi: 'सर्वोत्तम परिणामों के लिए इस उत्पाद का उपयोग कब और कैसे करें।',
    },
  },
  productCropSupport: {
    title: { en: 'Best for crops', mr: 'योग्य पिके', hi: 'उपयुक्त फसलें' },
    body: {
      en: 'Crops where this product has shown the most consistent results.',
      mr: 'जिथे या उत्पादनाने सातत्यपूर्ण परिणाम दाखवले आहेत अशी पिके.',
      hi: 'वे फसलें जहाँ इस उत्पाद ने सबसे लगातार परिणाम दिए हैं।',
    },
  },
  productStoreAvailability: {
    title: { en: 'Available stores', mr: 'उपलब्ध दुकाने', hi: 'उपलब्ध दुकानें' },
    body: {
      en: 'Local stores carrying this product. Tap a store to see stock, status, and directions.',
      mr: 'हे उत्पादन ठेवणारी स्थानिक दुकाने. साठा, स्थिती आणि दिशा पाहण्यासाठी दुकानावर टॅप करा.',
      hi: 'इस उत्पाद को रखने वाली स्थानीय दुकानें. स्टॉक, स्थिति और दिशा देखने के लिए दुकान पर टैप करें।',
    },
  },
  productStockStatus: {
    title: { en: 'Stock status', mr: 'साठा स्थिती', hi: 'स्टॉक स्थिति' },
    body: {
      en: '"In Stock" is currently available; "Low Stock" means few units left.',
      mr: '"साठ्यात" सध्या उपलब्ध आहे; "कमी साठा" म्हणजे काही नग शिल्लक.',
      hi: '"स्टॉक में" अभी उपलब्ध है; "कम स्टॉक" का मतलब कुछ इकाइयाँ बची हैं।',
    },
  },
  productDeliveryInfo: {
    title: { en: 'Farm delivery', mr: 'शेतावर पोहोच', hi: 'फार्म डिलीवरी' },
    body: {
      en: 'When available, get supplies delivered directly to your farm.',
      mr: 'जेव्हा उपलब्ध असेल तेव्हा, पुरवठा थेट तुमच्या शेतावर मिळवा.',
      hi: 'जब उपलब्ध हो, आपूर्ति सीधे आपके खेत तक पहुँचाई जाती है।',
    },
  },
  productQualityBadge: {
    title: { en: 'Quality badge', mr: 'गुणवत्ता बॅज', hi: 'गुणवत्ता बैज' },
    body: {
      en: 'Verified quality — Premium / Organic Certified products are checked for authenticity.',
      mr: 'पडताळणी केलेली गुणवत्ता — प्रीमियम / सेंद्रिय प्रमाणित उत्पादनांची सत्यता तपासली जाते.',
      hi: 'सत्यापित गुणवत्ता — प्रीमियम / जैविक प्रमाणित उत्पादों की प्रामाणिकता जाँची जाती है।',
    },
  },
  productReviews: {
    title: { en: 'Reviews', mr: 'पुनरावलोकने', hi: 'समीक्षाएँ' },
    body: {
      en: 'Average rating from verified farmers who bought this product.',
      mr: 'हे उत्पादन घेतलेल्या पडताळणी केलेल्या शेतकऱ्यांची सरासरी रेटिंग.',
      hi: 'इस उत्पाद को खरीदने वाले सत्यापित किसानों की औसत रेटिंग।',
    },
  },
  productContact: {
    title: { en: 'Confirm availability', mr: 'उपलब्धता तपासा', hi: 'उपलब्धता पुष्टि करें' },
    body: {
      en: 'Call the store first to confirm current stock and price before visiting.',
      mr: 'भेट देण्यापूर्वी सध्याचा साठा आणि किंमत खात्री करण्यासाठी आधी दुकानात फोन करा.',
      hi: 'दौरा करने से पहले मौजूदा स्टॉक और कीमत की पुष्टि के लिए पहले दुकान को फ़ोन करें।',
    },
  },

  // --- Store / Map: extended ---
  storeMapInteraction: {
    title: { en: 'Map view', mr: 'नकाशा दृश्य', hi: 'मानचित्र दृश्य' },
    body: {
      en: 'Tap a pin or a store card — the map will recenter and zoom to that store.',
      mr: 'पिन किंवा दुकान कार्डवर टॅप करा — नकाशा त्या दुकानावर केंद्रीत आणि झूम होईल.',
      hi: 'किसी पिन या स्टोर कार्ड पर टैप करें — मानचित्र उस स्टोर पर केंद्रित और ज़ूम होगा।',
    },
  },
  storeDirections: {
    title: { en: 'Get directions', mr: 'दिशा मिळवा', hi: 'दिशा प्राप्त करें' },
    body: {
      en: 'Opens Google Maps with turn-by-turn directions to this store.',
      mr: 'या दुकानापर्यंत वळणवळण दिशांसह Google नकाशे उघडते.',
      hi: 'इस दुकान तक मोड़-दर-मोड़ दिशाओं के साथ Google Maps खोलता है।',
    },
  },
  storeDetails: {
    title: { en: 'Store details', mr: 'दुकान तपशील', hi: 'दुकान विवरण' },
    body: {
      en: 'See address, phone, status, and the products this store currently carries.',
      mr: 'पत्ता, फोन, स्थिती आणि या दुकानात सध्या असलेली उत्पादने पाहा.',
      hi: 'पता, फ़ोन, स्थिति और इस दुकान में मौजूद उत्पाद देखें।',
    },
  },
  storeDistance: {
    title: { en: 'Distance', mr: 'अंतर', hi: 'दूरी' },
    body: {
      en: 'Straight-line distance from your selected location.',
      mr: 'तुमच्या निवडलेल्या स्थानापासूनचे सरळ रेषेतील अंतर.',
      hi: 'आपके चयनित स्थान से सीधी रेखा की दूरी।',
    },
  },
  storeInventory: {
    title: { en: 'In-stock products', mr: 'साठ्यातील उत्पादने', hi: 'स्टॉक में उत्पाद' },
    body: {
      en: 'Popular products this store keeps in stock today.',
      mr: 'या दुकानात आज साठ्यात असलेली लोकप्रिय उत्पादने.',
      hi: 'इस दुकान में आज स्टॉक में मौजूद लोकप्रिय उत्पाद।',
    },
  },
  storeLocateMe: {
    title: { en: 'Use my location', mr: 'माझे स्थान वापरा', hi: 'मेरा स्थान उपयोग करें' },
    body: {
      en: 'Detects your current location so distances and nearby stores update automatically.',
      mr: 'तुमचे सध्याचे स्थान शोधते जेणेकरून अंतर आणि जवळील दुकाने आपोआप अपडेट होतात.',
      hi: 'आपका वर्तमान स्थान पहचानता है ताकि दूरी और नज़दीकी दुकानें स्वतः अपडेट हों।',
    },
  },
  storeCallAction: {
    title: { en: 'Call store', mr: 'दुकानात फोन करा', hi: 'दुकान को कॉल करें' },
    body: {
      en: 'Dial the store directly to confirm stock, pricing, or hold an item.',
      mr: 'साठा, किंमत खात्री करण्यासाठी किंवा वस्तू राखून ठेवण्यासाठी दुकानात थेट फोन करा.',
      hi: 'स्टॉक, मूल्य की पुष्टि या वस्तु रोकने के लिए सीधे दुकान पर कॉल करें।',
    },
  },
  mapZoomControls: {
    title: { en: 'Zoom', mr: 'झूम', hi: 'ज़ूम' },
    body: {
      en: 'Zoom in to inspect a neighborhood or out to see more stores at once.',
      mr: 'परिसर पाहण्यासाठी झूम इन करा किंवा अधिक दुकाने एकाच वेळी पाहण्यासाठी झूम आउट करा.',
      hi: 'किसी क्षेत्र को देखने के लिए ज़ूम इन करें या अधिक दुकानें एक साथ देखने के लिए ज़ूम आउट करें।',
    },
  },

  // --- Home page extensions ---
  homeHeroCta: {
    title: { en: 'Banner action', mr: 'बॅनर क्रिया', hi: 'बैनर क्रिया' },
    body: {
      en: 'Opens the highlighted product, hub, or programme tied to this banner.',
      mr: 'या बॅनरशी संबंधित निवडक उत्पादन, हब किंवा कार्यक्रम उघडते.',
      hi: 'इस बैनर से जुड़ा चयनित उत्पाद, हब या कार्यक्रम खोलता है।',
    },
  },
  homeCategories: {
    title: { en: 'Shop by category', mr: 'श्रेणीनुसार खरेदी', hi: 'श्रेणी के अनुसार खरीदें' },
    body: {
      en: 'Jump straight into a product type — seeds, fertilizers, pesticides, sprayers or tools.',
      mr: 'थेट उत्पादन प्रकारात जा — बियाणे, खते, कीटकनाशके, फवारणी यंत्रे किंवा साधने.',
      hi: 'सीधे किसी उत्पाद प्रकार में जाएँ — बीज, उर्वरक, कीटनाशक, स्प्रेयर या उपकरण।',
    },
  },
  homeTrending: {
    title: { en: 'Trending near you', mr: 'जवळ ट्रेंडिंग', hi: 'आसपास ट्रेंडिंग' },
    body: {
      en: 'Most ordered products from stores around your selected location this week.',
      mr: 'या आठवड्यात तुमच्या निवडलेल्या स्थानाजवळील दुकानांकडून सर्वाधिक मागवली गेलेली उत्पादने.',
      hi: 'इस सप्ताह आपके चयनित स्थान के आसपास की दुकानों से सबसे अधिक मंगाए गए उत्पाद।',
    },
  },
  homePowerPlus: {
    title: { en: 'Direct from manufacturer', mr: 'थेट उत्पादकाकडून', hi: 'सीधे निर्माता से' },
    body: {
      en: 'KaranArjun Power Plus™ ships directly from the maker — no middlemen, factory-fresh price.',
      mr: 'करणअर्जुन पॉवर प्लस™ थेट उत्पादकाकडून पाठवले जाते — मध्यस्थ नाही, कारखाना ताजी किंमत.',
      hi: 'करणअर्जुन पॉवर प्लस™ सीधे निर्माता से भेजा जाता है — कोई बिचौलिया नहीं, फ़ैक्टरी-ताज़ा कीमत।',
    },
  },
  homeServicePowerPlus: {
    title: { en: 'Order Power Plus', mr: 'पॉवर प्लस ऑर्डर करा', hi: 'पॉवर प्लस ऑर्डर करें' },
    body: {
      en: 'Choose 1 L, 3 L or 5 L packs shipped straight from the manufacturer.',
      mr: '१ लि, ३ लि किंवा ५ लि पॅक थेट उत्पादकाकडून पाठवले जातील.',
      hi: '1 ली, 3 ली या 5 ली पैक सीधे निर्माता से भेजे जाते हैं।',
    },
  },
  homeServiceRetailer: {
    title: { en: 'Become a retailer', mr: 'विक्रेता बना', hi: 'खुदरा विक्रेता बनें' },
    body: {
      en: 'List your shop, manage inventory, and get discovered by nearby farmers.',
      mr: 'तुमचे दुकान नोंदवा, साठा व्यवस्थापित करा आणि जवळील शेतकऱ्यांपर्यंत पोहोचा.',
      hi: 'अपनी दुकान सूचीबद्ध करें, इन्वेंट्री प्रबंधित करें और नज़दीकी किसानों तक पहुँचें।',
    },
  },
  homeServiceAdvisory: {
    title: { en: 'Free crop advisory', mr: 'मोफत पीक सल्ला', hi: 'मुफ़्त फसल सलाह' },
    body: {
      en: 'Crop-specific hubs with dosage, spray schedules, and soil-care guidance.',
      mr: 'पीकनिहाय हब — प्रमाण, फवारणी वेळापत्रक आणि माती-संगोपन मार्गदर्शनासह.',
      hi: 'फसल-विशिष्ट हब — मात्रा, स्प्रे शेड्यूल और मिट्टी-देखभाल मार्गदर्शन के साथ।',
    },
  },

  // --- Hub page extensions ---
  hubCropProfile: {
    title: { en: 'Crop profile', mr: 'पीक प्रोफाइल', hi: 'फसल प्रोफ़ाइल' },
    body: {
      en: 'Quick facts — climate, soil, water and season — that suit this crop best.',
      mr: 'या पिकाला सर्वात अनुकूल असे संक्षिप्त तथ्य — हवामान, माती, पाणी आणि हंगाम.',
      hi: 'इस फसल के लिए सबसे उपयुक्त त्वरित तथ्य — जलवायु, मिट्टी, पानी और मौसम।',
    },
  },
  hubGrowthJourney: {
    title: { en: 'Growth journey', mr: 'वाढीचा प्रवास', hi: 'वृद्धि यात्रा' },
    body: {
      en: 'Every stage from seed to harvest with the inputs recommended at each step.',
      mr: 'बियाण्यापासून कापणीपर्यंत प्रत्येक टप्पा, सोबत प्रत्येक टप्प्यासाठी शिफारस केलेले इनपुट.',
      hi: 'बीज से कटाई तक हर चरण, साथ ही हर चरण के लिए अनुशंसित इनपुट।',
    },
  },
  hubGrowthStage: {
    title: { en: 'Stage details', mr: 'टप्प्याचे तपशील', hi: 'चरण विवरण' },
    body: {
      en: 'Phase length, what happens, and the products that support this stage best.',
      mr: 'टप्प्याची लांबी, काय घडते आणि या टप्प्याला सर्वोत्तम मदत करणारी उत्पादने.',
      hi: 'चरण की अवधि, क्या होता है, और इस चरण को सबसे अच्छा समर्थन देने वाले उत्पाद।',
    },
  },
  hubSeeds: {
    title: { en: 'Premium seeds', mr: 'प्रीमियम बियाणे', hi: 'प्रीमियम बीज' },
    body: {
      en: 'Verified varieties known to perform reliably for this crop in this region.',
      mr: 'या प्रदेशात या पिकासाठी विश्वासार्ह कामगिरी देणाऱ्या पडताळणी केलेल्या जाती.',
      hi: 'इस क्षेत्र में इस फसल के लिए विश्वसनीय प्रदर्शन के लिए जानी जाने वाली सत्यापित किस्में।',
    },
  },
  hubMistakes: {
    title: { en: 'Avoid these mistakes', mr: 'या चुका टाळा', hi: 'इन गलतियों से बचें' },
    body: {
      en: 'Common pitfalls real farmers report — quick wins if you avoid them.',
      mr: 'खरे शेतकरी सांगणाऱ्या सामान्य चुका — टाळल्यास झटपट फायदा.',
      hi: 'असली किसानों द्वारा बताई गई आम गलतियाँ — इनसे बचने पर त्वरित लाभ।',
    },
  },
  hubAdvisory: {
    title: { en: 'Agronomy alert', mr: 'कृषी सल्ला सूचना', hi: 'कृषि सलाह अलर्ट' },
    body: {
      en: 'Timely guidance from agronomists on issues likely to hit this crop right now.',
      mr: 'सध्या या पिकावर येण्याची शक्यता असलेल्या समस्यांवर कृषितज्ज्ञांचे वेळेवर मार्गदर्शन.',
      hi: 'अभी इस फसल पर आने वाली संभावित समस्याओं पर कृषि विशेषज्ञों का समय पर मार्गदर्शन।',
    },
  },
  hubConsult: {
    title: { en: 'Consult specialist', mr: 'तज्ज्ञांचा सल्ला घ्या', hi: 'विशेषज्ञ से सलाह लें' },
    body: {
      en: 'Talk to a crop specialist about your field and get a tailored plan.',
      mr: 'तुमच्या शेताबद्दल पीक तज्ज्ञाशी बोला आणि अनुरूप योजना मिळवा.',
      hi: 'अपने खेत के बारे में फसल विशेषज्ञ से बात करें और अनुकूल योजना पाएँ।',
    },
  },
  hubDownloadGuide: {
    title: { en: 'Download guide', mr: 'मार्गदर्शक डाउनलोड करा', hi: 'गाइड डाउनलोड करें' },
    body: {
      en: 'Save the full hub as a printable PDF for offline reference in the field.',
      mr: 'शेतात ऑफलाइन वापरासाठी संपूर्ण हब छापण्यायोग्य PDF म्हणून जतन करा.',
      hi: 'खेत में ऑफ़लाइन उपयोग के लिए पूरे हब को प्रिंट करने योग्य PDF के रूप में सहेजें।',
    },
  },
  hubFaq: {
    title: { en: "Farmer's wisdom", mr: 'शेतकरी ज्ञान', hi: 'किसान ज्ञान' },
    body: {
      en: 'Quick answers to the most common questions about growing this crop.',
      mr: 'हे पीक घेण्याबद्दलच्या सर्वात सामान्य प्रश्नांची झटपट उत्तरे.',
      hi: 'इस फसल को उगाने के बारे में सबसे सामान्य प्रश्नों के त्वरित उत्तर।',
    },
  },

  // --- Dashboard: section helpers ---
  dashOverview: {
    title: { en: 'Overview', mr: 'सारांश', hi: 'अवलोकन' },
    body: {
      en: 'Performance snapshot for your storefront — views, interactions, inventory, and recent reviews at a glance.',
      mr: 'तुमच्या स्टोअरफ्रंटसाठी कार्यप्रदर्शनाचा झलक — दृश्ये, संवाद, साठा आणि अलीकडील पुनरावलोकने एका दृष्टीक्षेपात.',
      hi: 'आपके स्टोरफ्रंट का प्रदर्शन सारांश — व्यूज़, इंटरैक्शन, इन्वेंट्री और हाल की समीक्षाएँ एक नज़र में।',
    },
  },
  dashAnalytics: {
    title: { en: 'Analytics', mr: 'विश्लेषण', hi: 'विश्लेषण' },
    body: {
      en: 'Track impressions, CTR, calls, and direction requests so you can see what farmers are doing with your listing.',
      mr: 'इंप्रेशन, CTR, कॉल आणि दिशा विनंत्या ट्रॅक करा — शेतकरी तुमच्या लिस्टिंगसोबत काय करत आहेत ते पाहा.',
      hi: 'इंप्रेशन, CTR, कॉल और दिशा अनुरोध ट्रैक करें — किसान आपकी लिस्टिंग के साथ क्या कर रहे हैं देखें।',
    },
  },
  dashInventory: {
    title: { en: 'Inventory', mr: 'साठा', hi: 'इन्वेंट्री' },
    body: {
      en: 'Your stock list — own products and manufacturer-assigned items. Update quantities and track stock health here.',
      mr: 'तुमची साठा यादी — स्वतःची आणि उत्पादकाने नेमून दिलेली उत्पादने. इथे प्रमाण अद्ययावत करा आणि साठ्याची स्थिती तपासा.',
      hi: 'आपकी स्टॉक सूची — स्वयं के और निर्माता द्वारा सौंपे गए उत्पाद. यहाँ मात्रा अपडेट करें और स्टॉक स्वास्थ्य ट्रैक करें।',
    },
  },
  dashSubscription: {
    title: { en: 'Subscription seats', mr: 'सबस्क्रिप्शन सीट्स', hi: 'सब्सक्रिप्शन सीट्स' },
    body: {
      en: '1 seat = 1 active product listing. Seats are consumed when you publish a product or assign one to a retailer.',
      mr: '१ सीट = १ सक्रिय उत्पादन लिस्टिंग. उत्पादन प्रकाशित केल्यावर किंवा विक्रेत्याला नेमून दिल्यावर सीट वापरली जाते.',
      hi: '1 सीट = 1 सक्रिय उत्पाद लिस्टिंग। उत्पाद प्रकाशित करने पर या किसी विक्रेता को सौंपने पर सीट उपयोग होती है।',
    },
  },
  dashBuySeats: {
    title: { en: 'Buy more seats', mr: 'अधिक सीट्स घ्या', hi: 'और सीट्स खरीदें' },
    body: {
      en: 'Each seat lets you keep one extra product listed. Buy seats in bundles to scale your catalogue.',
      mr: 'प्रत्येक सीट तुम्हाला एक अतिरिक्त उत्पादन सूचीबद्ध ठेवू देते. कॅटलॉग वाढवण्यासाठी सीट्स बंडलमध्ये घ्या.',
      hi: 'हर सीट आपको एक अतिरिक्त उत्पाद सूचीबद्ध रखने देती है। कैटलॉग बढ़ाने के लिए सीट्स बंडल में खरीदें।',
    },
  },
  dashOrders: {
    title: { en: 'Incoming orders', mr: 'येणाऱ्या ऑर्डर्स', hi: 'आने वाले ऑर्डर' },
    body: {
      en: 'Orders placed by farmers for your online-delivery products. Confirm, pack, and dispatch from here.',
      mr: 'तुमच्या ऑनलाइन-डिलिव्हरी उत्पादांसाठी शेतकऱ्यांनी दिलेल्या ऑर्डर्स. इथून पुष्टी करा, पॅक करा आणि पाठवा.',
      hi: 'आपके ऑनलाइन-डिलीवरी उत्पादों के लिए किसानों द्वारा दिए गए ऑर्डर। यहाँ से पुष्टि करें, पैक करें और भेजें।',
    },
  },
  dashReviews: {
    title: { en: 'Reviews', mr: 'पुनरावलोकने', hi: 'समीक्षाएँ' },
    body: {
      en: 'Customer feedback linked to your products. Respond quickly to build trust and improve ratings.',
      mr: 'तुमच्या उत्पादांशी जोडलेले ग्राहक अभिप्राय. विश्वास निर्माण करण्यासाठी आणि रेटिंग सुधारण्यासाठी पटकन प्रतिसाद द्या.',
      hi: 'आपके उत्पादों से जुड़ी ग्राहक प्रतिक्रिया. विश्वास बनाने और रेटिंग सुधारने के लिए जल्दी जवाब दें।',
    },
  },
  dashProfile: {
    title: { en: 'Business profile', mr: 'व्यवसाय प्रोफाइल', hi: 'व्यवसाय प्रोफ़ाइल' },
    body: {
      en: 'How your shop appears to farmers. Use Google Maps search to auto-fill your address for accurate distance.',
      mr: 'शेतकऱ्यांना तुमचे दुकान कसे दिसते. अचूक अंतरासाठी पत्ता आपोआप भरण्यासाठी Google Maps शोध वापरा.',
      hi: 'किसानों को आपकी दुकान कैसे दिखती है. सटीक दूरी के लिए पता स्वतः भरने के लिए Google Maps खोज का उपयोग करें।',
    },
  },
  dashSettings: {
    title: { en: 'Settings', mr: 'सेटिंग्ज', hi: 'सेटिंग्स' },
    body: {
      en: 'Shop profile, contact channels, address, and business preferences in one place.',
      mr: 'दुकानाची प्रोफाइल, संपर्क चॅनेल, पत्ता आणि व्यवसाय प्राधान्ये एकाच ठिकाणी.',
      hi: 'दुकान की प्रोफ़ाइल, संपर्क चैनल, पता और व्यवसाय प्राथमिकताएँ एक ही जगह।',
    },
  },
  dashInventoryHealth: {
    title: { en: 'Inventory health', mr: 'साठा स्थिती', hi: 'इन्वेंट्री स्वास्थ्य' },
    body: {
      en: 'Share of in-stock SKUs out of your total catalogue. Aim for 80%+ to stay discoverable.',
      mr: 'तुमच्या एकूण कॅटलॉगपैकी साठ्यात असलेल्या SKUs चे प्रमाण. शोधण्यायोग्य राहण्यासाठी ८०%+ लक्ष्य ठेवा.',
      hi: 'आपके पूरे कैटलॉग में स्टॉक में मौजूद SKUs का अनुपात. खोज में बने रहने के लिए 80%+ का लक्ष्य रखें।',
    },
  },
  dashQuickActions: {
    title: { en: 'Quick actions', mr: 'त्वरित क्रिया', hi: 'त्वरित क्रियाएँ' },
    body: {
      en: 'Shortcuts to the tasks you do most — add product, adjust stock, view analytics, manage orders.',
      mr: 'सर्वाधिक केल्या जाणाऱ्या कामांसाठी शॉर्टकट — उत्पादन जोडा, साठा समायोजित करा, विश्लेषण पाहा, ऑर्डर्स व्यवस्थापित करा.',
      hi: 'सबसे ज़्यादा किए जाने वाले कामों के लिए शॉर्टकट — उत्पाद जोड़ें, स्टॉक समायोजित करें, विश्लेषण देखें, ऑर्डर प्रबंधित करें।',
    },
  },
  dashImpressions: {
    title: { en: 'Impressions', mr: 'इंप्रेशन', hi: 'इंप्रेशन' },
    body: {
      en: 'How many times your store appeared in farmers’ search results.',
      mr: 'शेतकऱ्यांच्या शोध निकालांमध्ये तुमचे दुकान किती वेळा दिसले.',
      hi: 'किसानों के खोज परिणामों में आपकी दुकान कितनी बार दिखी।',
    },
  },
  dashCtr: {
    title: { en: 'CTR (Click-through rate)', mr: 'CTR (क्लिक-थ्रू रेट)', hi: 'CTR (क्लिक-थ्रू रेट)' },
    body: {
      en: 'Share of impressions that became clicks. Higher CTR = more relevant listings.',
      mr: 'इंप्रेशनपैकी क्लिक झालेले प्रमाण. जास्त CTR = अधिक संबंधित लिस्टिंग.',
      hi: 'इंप्रेशन में से क्लिक बने अनुपात. अधिक CTR = ज़्यादा प्रासंगिक लिस्टिंग।',
    },
  },
  dashAvgPosition: {
    title: { en: 'Avg. position', mr: 'सरासरी स्थान', hi: 'औसत स्थिति' },
    body: {
      en: 'Your average rank in search results — lower is better, 1.0 is the top spot.',
      mr: 'शोध निकालांमधील तुमची सरासरी रँक — कमी जास्त चांगले, १.० म्हणजे सर्वोच्च स्थान.',
      hi: 'खोज परिणामों में आपकी औसत रैंक — कम बेहतर है, 1.0 शीर्ष स्थान है।',
    },
  },
  dashListingSeats: {
    title: { en: 'Listing seats', mr: 'लिस्टिंग सीट्स', hi: 'लिस्टिंग सीट्स' },
    body: {
      en: 'Available product slots from your subscription. Buy more seats to publish additional products.',
      mr: 'तुमच्या सबस्क्रिप्शनमधून उपलब्ध उत्पादन स्लॉट. अतिरिक्त उत्पादने प्रकाशित करण्यासाठी अधिक सीट्स घ्या.',
      hi: 'आपके सब्सक्रिप्शन से उपलब्ध उत्पाद स्लॉट. अतिरिक्त उत्पाद प्रकाशित करने के लिए और सीट्स खरीदें।',
    },
  },
  dashRetailerNetwork: {
    title: { en: 'Retailer network', mr: 'विक्रेता नेटवर्क', hi: 'विक्रेता नेटवर्क' },
    body: {
      en: 'Add retailers to your network and assign your products to them. Each product assignment uses one seat (1 month validity).',
      mr: 'तुमच्या नेटवर्कमध्ये विक्रेते जोडा आणि त्यांना तुमची उत्पादने नेमून द्या. प्रत्येक उत्पादन नेमणूक एक सीट वापरते (१ महिना वैधता).',
      hi: 'अपने नेटवर्क में विक्रेताओं को जोड़ें और उन्हें अपने उत्पाद सौंपें। प्रत्येक उत्पाद असाइनमेंट एक सीट का उपयोग करता है (1 माह वैधता)।',
    },
  },
  dashAddRetailer: {
    title: { en: 'Add retailer', mr: 'विक्रेता जोडा', hi: 'विक्रेता जोड़ें' },
    body: {
      en: 'Pre-create a retailer profile and generate a signup invite link. Use Google Maps to auto-fill the shop address.',
      mr: 'विक्रेत्याची प्रोफाइल आधीच तयार करा आणि साइनअप आमंत्रण लिंक तयार करा. दुकानाचा पत्ता आपोआप भरण्यासाठी Google Maps वापरा.',
      hi: 'विक्रेता की प्रोफ़ाइल पहले से बनाएँ और साइनअप आमंत्रण लिंक उत्पन्न करें। दुकान का पता स्वतः भरने के लिए Google Maps का उपयोग करें।',
    },
  },
  dashAssignProduct: {
    title: { en: 'Assign product', mr: 'उत्पादन नेमून द्या', hi: 'उत्पाद असाइन करें' },
    body: {
      en: 'Push one of your manufactured products into a retailer’s inventory so it appears in their listings.',
      mr: 'तुमचे उत्पादित उत्पादन विक्रेत्याच्या साठ्यात पाठवा जेणेकरून ते त्यांच्या लिस्टिंगमध्ये दिसेल.',
      hi: 'अपना निर्मित उत्पाद किसी विक्रेता की इन्वेंट्री में भेजें ताकि वह उनकी लिस्टिंग में दिखे।',
    },
  },

  // --- Dashboard tour steps ---
  tourDashWelcome: {
    title: {
      en: 'Welcome to your dashboard',
      mr: 'तुमच्या डॅशबोर्डमध्ये स्वागत आहे',
      hi: 'आपके डैशबोर्ड में स्वागत है',
    },
    body: {
      en: 'Your control centre for the shop. Let’s walk through the key sections — it only takes a moment.',
      mr: 'दुकानासाठी तुमचे नियंत्रण केंद्र. चला महत्त्वाच्या विभागांचा फेरफटका मारू — फक्त एक क्षण लागेल.',
      hi: 'आपकी दुकान का कंट्रोल सेंटर। चलिए मुख्य अनुभागों का दौरा करते हैं — बस एक क्षण लगेगा।',
    },
  },
  tourDashOverview: {
    title: { en: 'Overview', mr: 'सारांश', hi: 'अवलोकन' },
    body: {
      en: 'Daily snapshot of views, interactions, directions, and listed products.',
      mr: 'दृश्ये, संवाद, दिशा आणि सूचीबद्ध उत्पादांचा रोजचा झलक.',
      hi: 'व्यूज़, इंटरैक्शन, दिशा और सूचीबद्ध उत्पादों का दैनिक स्नैपशॉट।',
    },
  },
  tourDashAnalytics: {
    title: { en: 'Analytics', mr: 'विश्लेषण', hi: 'विश्लेषण' },
    body: {
      en: 'Track impressions, CTR, calls, and direction requests over time.',
      mr: 'काळानुसार इंप्रेशन, CTR, कॉल आणि दिशा विनंत्या ट्रॅक करा.',
      hi: 'समय के साथ इंप्रेशन, CTR, कॉल और दिशा अनुरोध ट्रैक करें।',
    },
  },
  tourDashInventory: {
    title: { en: 'Inventory', mr: 'साठा', hi: 'इन्वेंट्री' },
    body: {
      en: 'Manage your products, stock levels, and seat usage from a single page.',
      mr: 'एकाच पानावरून तुमची उत्पादने, साठा पातळी आणि सीट वापर व्यवस्थापित करा.',
      hi: 'अपने उत्पाद, स्टॉक स्तर और सीट उपयोग एक ही पेज से प्रबंधित करें।',
    },
  },
  tourDashSubscription: {
    title: { en: 'Subscription', mr: 'सबस्क्रिप्शन', hi: 'सब्सक्रिप्शन' },
    body: {
      en: '1 seat = 1 active product. Check seat balance and buy more when you scale.',
      mr: '१ सीट = १ सक्रिय उत्पादन. सीट शिल्लक तपासा आणि वाढ करताना अधिक घ्या.',
      hi: '1 सीट = 1 सक्रिय उत्पाद. सीट बैलेंस देखें और बढ़ाते समय और खरीदें।',
    },
  },
  tourDashOrders: {
    title: { en: 'Orders', mr: 'ऑर्डर्स', hi: 'ऑर्डर' },
    body: {
      en: 'Incoming farmer orders for your online-delivery products land here.',
      mr: 'तुमच्या ऑनलाइन-डिलिव्हरी उत्पादांसाठी शेतकऱ्यांच्या ऑर्डर्स इथे येतात.',
      hi: 'आपके ऑनलाइन-डिलीवरी उत्पादों के लिए किसानों के ऑर्डर यहाँ आते हैं।',
    },
  },
  tourDashReviews: {
    title: { en: 'Reviews', mr: 'पुनरावलोकने', hi: 'समीक्षाएँ' },
    body: {
      en: 'Read shopper feedback and follow up to keep your rating strong.',
      mr: 'खरेदीदार अभिप्राय वाचा आणि तुमची रेटिंग टिकवण्यासाठी पाठपुरावा करा.',
      hi: 'खरीदारों की प्रतिक्रिया पढ़ें और रेटिंग मज़बूत रखने के लिए फ़ॉलो-अप करें।',
    },
  },
  tourDashProfile: {
    title: { en: 'Profile', mr: 'प्रोफाइल', hi: 'प्रोफ़ाइल' },
    body: {
      en: 'Complete your shop profile — name, contact, and Google Maps location — so farmers can find you.',
      mr: 'तुमची दुकान प्रोफाइल पूर्ण करा — नाव, संपर्क आणि Google Maps स्थान — जेणेकरून शेतकरी तुम्हाला शोधू शकतील.',
      hi: 'अपनी दुकान प्रोफ़ाइल पूरी करें — नाम, संपर्क और Google Maps स्थान — ताकि किसान आपको ढूँढ सकें।',
    },
  },
  tourDashSettings: {
    title: { en: 'Settings', mr: 'सेटिंग्ज', hi: 'सेटिंग्स' },
    body: {
      en: 'Update contact channels, address, and business preferences anytime.',
      mr: 'संपर्क चॅनेल, पत्ता आणि व्यवसाय प्राधान्ये कधीही अद्ययावत करा.',
      hi: 'संपर्क चैनल, पता और व्यवसाय प्राथमिकताएँ कभी भी अपडेट करें।',
    },
  },
  tourDashRetailerNetwork: {
    title: { en: 'Retailer network', mr: 'विक्रेता नेटवर्क', hi: 'विक्रेता नेटवर्क' },
    body: {
      en: 'Add retailers, send signup invites, and assign your products to expand your distribution.',
      mr: 'विक्रेते जोडा, साइनअप आमंत्रणे पाठवा आणि वितरण वाढवण्यासाठी तुमची उत्पादने नेमून द्या.',
      hi: 'विक्रेताओं को जोड़ें, साइनअप आमंत्रण भेजें और वितरण बढ़ाने के लिए अपने उत्पाद असाइन करें।',
    },
  },

  // --- Dashboard: feature-level micro helpers ---
  dashMetricViews: {
    title: { en: 'Total Views', mr: 'एकूण दृश्ये', hi: 'कुल व्यूज़' },
    body: {
      en: 'Times your store or products were shown to nearby farmers.',
      mr: 'जवळील शेतकऱ्यांना तुमचे दुकान किंवा उत्पादने किती वेळा दाखवली गेली.',
      hi: 'नज़दीकी किसानों को आपकी दुकान या उत्पाद कितनी बार दिखाए गए।',
    },
  },
  dashMetricInteractions: {
    title: { en: 'Interactions', mr: 'इंटरॅक्शन', hi: 'इंटरैक्शन' },
    body: {
      en: 'Clicks, calls, and product opens from farmers — your real engagement.',
      mr: 'शेतकऱ्यांकडून क्लिक, कॉल आणि उत्पादन उघडणे — तुमचा खरा सहभाग.',
      hi: 'किसानों के क्लिक, कॉल और प्रोडक्ट ओपन — आपकी वास्तविक एंगेजमेंट।',
    },
  },
  dashMetricDirections: {
    title: { en: 'Directions', mr: 'दिशा', hi: 'दिशा-निर्देश' },
    body: {
      en: 'Turn-by-turn route requests to your shop from Google Maps.',
      mr: 'Google Maps वरून तुमच्या दुकानापर्यंतच्या वळण-वळण मार्ग विनंत्या.',
      hi: 'Google Maps से आपकी दुकान तक मोड़-दर-मोड़ रूट अनुरोध।',
    },
  },
  dashMetricProductsListed: {
    title: { en: 'Products Listed', mr: 'सूचीबद्ध उत्पादने', hi: 'सूचीबद्ध उत्पाद' },
    body: {
      en: 'Active product listings in your catalogue — each consumes one seat.',
      mr: 'तुमच्या कॅटलॉगमधील सक्रिय उत्पादन लिस्टिंग — प्रत्येक एक सीट वापरते.',
      hi: 'आपके कैटलॉग में सक्रिय उत्पाद लिस्टिंग — प्रत्येक एक सीट उपयोग करती है।',
    },
  },
  dashChartViews: {
    title: { en: 'Views over time', mr: 'काळानुसार दृश्ये', hi: 'समय के अनुसार व्यूज़' },
    body: {
      en: 'Daily impressions for the last week — spot trends and busy days.',
      mr: 'मागील आठवड्यासाठी रोजचे इंप्रेशन — ट्रेंड आणि व्यस्त दिवस ओळखा.',
      hi: 'पिछले सप्ताह के दैनिक इंप्रेशन — ट्रेंड और व्यस्त दिनों को पहचानें।',
    },
  },
  dashChartCalls: {
    title: { en: 'Calls made', mr: 'केलेले कॉल्स', hi: 'किए गए कॉल' },
    body: {
      en: 'Tap-to-call clicks straight from your listing.',
      mr: 'तुमच्या लिस्टिंगवरून थेट टॅप-टू-कॉल क्लिक.',
      hi: 'आपकी लिस्टिंग से सीधे टैप-टू-कॉल क्लिक।',
    },
  },
  dashChartDirections: {
    title: { en: 'Direction requests', mr: 'दिशा विनंत्या', hi: 'दिशा अनुरोध' },
    body: {
      en: 'How often farmers opened directions to your shop.',
      mr: 'शेतकऱ्यांनी तुमच्या दुकानाच्या दिशा किती वेळा उघडल्या.',
      hi: 'किसानों ने आपकी दुकान की दिशा कितनी बार खोली।',
    },
  },
  dashInsights: {
    title: { en: 'Insights', mr: 'अंतर्दृष्टी', hi: 'इनसाइट्स' },
    body: {
      en: 'Personalized takeaways from your live metrics — what to do next.',
      mr: 'तुमच्या थेट मेट्रिक्समधून वैयक्तिकृत निष्कर्ष — पुढे काय करायचे.',
      hi: 'आपके लाइव मेट्रिक्स से वैयक्तिकृत निष्कर्ष — आगे क्या करना है।',
    },
  },

  // --- Inventory tiles ---
  dashInvInStock: {
    title: { en: 'In stock', mr: 'साठ्यात', hi: 'स्टॉक में' },
    body: {
      en: 'Products currently available for farmers to discover and buy.',
      mr: 'शेतकऱ्यांना शोधण्यासाठी आणि खरेदी करण्यासाठी सध्या उपलब्ध उत्पादने.',
      hi: 'किसानों को खोजने और खरीदने के लिए अभी उपलब्ध उत्पाद।',
    },
  },
  dashInvLowStock: {
    title: { en: 'Low stock', mr: 'कमी साठा', hi: 'कम स्टॉक' },
    body: {
      en: 'Items running low — restock soon to avoid losing customers.',
      mr: 'कमी होत असलेल्या वस्तू — ग्राहक गमावू नये म्हणून लवकरच पुन्हा साठा करा.',
      hi: 'कम होती वस्तुएँ — ग्राहक खोने से बचने के लिए जल्द ही पुनः स्टॉक करें।',
    },
  },
  dashInvOutOfStock: {
    title: { en: 'Out of stock', mr: 'साठा संपला', hi: 'स्टॉक खत्म' },
    body: {
      en: 'Listed but currently unavailable — mark as in-stock once restocked.',
      mr: 'सूचीबद्ध पण सध्या अनुपलब्ध — साठा भरल्यावर साठ्यात असल्याचे चिन्हांकित करा.',
      hi: 'सूचीबद्ध लेकिन अभी अनुपलब्ध — स्टॉक भरने पर इन-स्टॉक के रूप में चिह्नित करें।',
    },
  },
  dashInvHealthScore: {
    title: { en: 'Health score', mr: 'आरोग्य स्कोअर', hi: 'हेल्थ स्कोर' },
    body: {
      en: 'Share of in-stock products. Aim for 80%+ to stay visible in search.',
      mr: 'साठ्यातील उत्पादांचे प्रमाण. शोधात दिसण्यासाठी ८०%+ लक्ष्य ठेवा.',
      hi: 'स्टॉक में मौजूद उत्पादों का अनुपात. खोज में दिखने के लिए 80%+ का लक्ष्य रखें।',
    },
  },
  dashSeatInfo: {
    title: { en: 'Listing seats', mr: 'लिस्टिंग सीट्स', hi: 'लिस्टिंग सीट्स' },
    body: {
      en: 'Available product slots from your subscription. Each new listing uses one seat.',
      mr: 'तुमच्या सबस्क्रिप्शनमधून उपलब्ध उत्पादन स्लॉट. प्रत्येक नवीन लिस्टिंग एक सीट वापरते.',
      hi: 'आपके सब्सक्रिप्शन से उपलब्ध उत्पाद स्लॉट. हर नई लिस्टिंग एक सीट उपयोग करती है।',
    },
  },
  dashSeatBuyMore: {
    title: { en: 'Buy more seats', mr: 'अधिक सीट्स घ्या', hi: 'और सीट्स खरीदें' },
    body: {
      en: 'Top up your plan to publish more products without removing existing ones.',
      mr: 'अस्तित्वातील उत्पादने काढून न टाकता अधिक उत्पादने प्रकाशित करण्यासाठी तुमचा प्लॅन वाढवा.',
      hi: 'मौजूदा उत्पाद हटाए बिना अधिक उत्पाद प्रकाशित करने के लिए अपने प्लान को टॉप-अप करें।',
    },
  },

  // --- Subscription tiles ---
  dashSeatsPurchased: {
    title: { en: 'Seats purchased', mr: 'खरेदी केलेल्या सीट्स', hi: 'खरीदी गई सीट्स' },
    body: {
      en: 'Total seats across all your active subscriptions.',
      mr: 'तुमच्या सर्व सक्रिय सबस्क्रिप्शनमधील एकूण सीट्स.',
      hi: 'आपके सभी सक्रिय सब्सक्रिप्शन में कुल सीट्स।',
    },
  },
  dashSeatsUsed: {
    title: { en: 'Seats used', mr: 'वापरलेल्या सीट्स', hi: 'उपयोग की गई सीट्स' },
    body: {
      en: 'Seats currently held by active product listings or retailer assignments.',
      mr: 'सक्रिय उत्पादन लिस्टिंग किंवा विक्रेता नेमणूकींद्वारे सध्या वापरल्या जाणाऱ्या सीट्स.',
      hi: 'सक्रिय उत्पाद लिस्टिंग या विक्रेता असाइनमेंट द्वारा अभी उपयोग में सीट्स।',
    },
  },
  dashSeatsAvailable: {
    title: { en: 'Available seats', mr: 'उपलब्ध सीट्स', hi: 'उपलब्ध सीट्स' },
    body: {
      en: 'Ready-to-use seats for new listings or retailer assignments.',
      mr: 'नवीन लिस्टिंग किंवा विक्रेता नेमणूकीसाठी वापरण्यास तयार सीट्स.',
      hi: 'नई लिस्टिंग या विक्रेता असाइनमेंट के लिए तैयार सीट्स।',
    },
  },
  dashSeatsExpiring: {
    title: { en: 'Expiring soon', mr: 'लवकरच संपणाऱ्या', hi: 'जल्द समाप्त होने वाली' },
    body: {
      en: 'Seats on subscriptions that expire within the next 30 days. Renew to keep listings live.',
      mr: 'पुढील ३० दिवसांत संपणाऱ्या सबस्क्रिप्शनवरील सीट्स. लिस्टिंग चालू ठेवण्यासाठी नूतनीकरण करा.',
      hi: 'अगले 30 दिनों में समाप्त होने वाले सब्सक्रिप्शन की सीट्स. लिस्टिंग सक्रिय रखने के लिए रिन्यू करें।',
    },
  },
  dashSubHistory: {
    title: { en: 'Subscription history', mr: 'सबस्क्रिप्शन इतिहास', hi: 'सब्सक्रिप्शन इतिहास' },
    body: {
      en: 'All your past and current plans, payment IDs, and expiry dates.',
      mr: 'तुमचे सर्व मागील आणि सध्याचे प्लॅन्स, पेमेंट ID आणि कालबाह्य तारखा.',
      hi: 'आपके सभी पिछले और मौजूदा प्लान, पेमेंट ID और समाप्ति तारीखें।',
    },
  },
  dashActiveListings: {
    title: { en: 'Active listings', mr: 'सक्रिय लिस्टिंग', hi: 'सक्रिय लिस्टिंग' },
    body: {
      en: 'Products currently consuming your seats. Each row = one seat.',
      mr: 'सध्या तुमच्या सीट्स वापरणारी उत्पादने. प्रत्येक पंक्ती = एक सीट.',
      hi: 'अभी आपकी सीट्स का उपयोग कर रहे उत्पाद. प्रत्येक पंक्ति = एक सीट।',
    },
  },

  // --- Manufacturer-specific ---
  dashRetailerInvite: {
    title: { en: 'Invite link', mr: 'आमंत्रण लिंक', hi: 'इनवाइट लिंक' },
    body: {
      en: 'Share this signup link so the retailer can claim their pre-created profile.',
      mr: 'विक्रेता त्यांची आधीच तयार केलेली प्रोफाइल हक्काने मिळवू शकेल यासाठी ही साइनअप लिंक शेअर करा.',
      hi: 'इस साइनअप लिंक को साझा करें ताकि विक्रेता अपनी पहले से बनाई गई प्रोफ़ाइल का दावा कर सके।',
    },
  },
  dashRetailerSeats: {
    title: { en: 'Seats remaining', mr: 'शिल्लक सीट्स', hi: 'बची हुई सीट्स' },
    body: {
      en: 'Each retailer product assignment consumes one seat for one month.',
      mr: 'प्रत्येक विक्रेता उत्पादन नेमणूक एक महिन्यासाठी एक सीट वापरते.',
      hi: 'प्रत्येक विक्रेता उत्पाद असाइनमेंट एक माह के लिए एक सीट उपयोग करता है।',
    },
  },
} as const;

export type HelperTextKey = keyof typeof HELPER_TEXTS;

/**
 * Format a HelperTextEntry for the given language.
 * - en  → English only
 * - mr  → English + Marathi (two lines)
 * - hi  → English + Hindi (two lines)
 * Falls back to English if the localized variant is missing.
 */
export function formatHelperEntry(
  entry: HelperTextEntry | undefined,
  language: HelperLang
): string {
  if (!entry) return '';
  const en = entry.en;
  if (language === 'en') return en;
  const localized = entry[language];
  if (!localized || localized === en) return en;
  return `${en}\n${localized}`;
}
