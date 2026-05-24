import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppLocale { en, hi, mr }

extension AppLocaleX on AppLocale {
  String get label {
    switch (this) {
      case AppLocale.en:
        return 'English';
      case AppLocale.hi:
        return 'हिन्दी';
      case AppLocale.mr:
        return 'मराठी';
    }
  }

  Locale get locale => Locale(name);
}

final localeProvider = StateProvider<AppLocale>((_) => AppLocale.en);

class Strings {
  static const _data = <String, Map<AppLocale, String>>{
    'welcome_1_title': {
      AppLocale.en: 'Find the right products for your farm',
      AppLocale.hi: 'अपने खेत के लिए सही उत्पाद खोजें',
      AppLocale.mr: 'तुमच्या शेतासाठी योग्य उत्पादने शोधा',
    },
    'welcome_1_sub': {
      AppLocale.en: 'Browse seeds, fertilizers, and tools from trusted brands.',
      AppLocale.hi: 'विश्वसनीय ब्रांडों से बीज, खाद और उपकरण देखें।',
      AppLocale.mr: 'विश्वासू ब्रँडकडून बियाणे, खते आणि साधने पहा.',
    },
    'welcome_2_title': {
      AppLocale.en: 'Discover nearby stores',
      AppLocale.hi: 'पास की दुकानें खोजें',
      AppLocale.mr: 'जवळची दुकाने शोधा',
    },
    'welcome_2_sub': {
      AppLocale.en: 'See which shops have what you need, in stock.',
      AppLocale.hi: 'देखें कौन सी दुकानों में स्टॉक है।',
      AppLocale.mr: 'कोणत्या दुकानात स्टॉक आहे ते पहा.',
    },
    'welcome_3_title': {
      AppLocale.en: 'Grow your agri business',
      AppLocale.hi: 'अपना कृषि व्यवसाय बढ़ाएँ',
      AppLocale.mr: 'तुमचा कृषी व्यवसाय वाढवा',
    },
    'welcome_3_sub': {
      AppLocale.en: 'Retailers and manufacturers — manage inventory and dealers.',
      AppLocale.hi: 'रिटेलर और निर्माता — इन्वेंटरी और डीलर प्रबंधित करें।',
      AppLocale.mr: 'रिटेलर आणि उत्पादक — इन्व्हेंटरी आणि डीलर व्यवस्थापन.',
    },
    'get_started': {
      AppLocale.en: 'Get started',
      AppLocale.hi: 'शुरू करें',
      AppLocale.mr: 'सुरू करा',
    },
    'continue_btn': {
      AppLocale.en: 'Continue',
      AppLocale.hi: 'आगे बढ़ें',
      AppLocale.mr: 'पुढे जा',
    },
    'login_title': {
      AppLocale.en: 'Sign in with your phone',
      AppLocale.hi: 'अपने फ़ोन से साइन इन करें',
      AppLocale.mr: 'तुमच्या फोनने साइन इन करा',
    },
    'phone_label': {
      AppLocale.en: 'Phone number',
      AppLocale.hi: 'फ़ोन नंबर',
      AppLocale.mr: 'फोन नंबर',
    },
    'send_otp': {
      AppLocale.en: 'Send OTP',
      AppLocale.hi: 'OTP भेजें',
      AppLocale.mr: 'OTP पाठवा',
    },
    'verify_otp': {
      AppLocale.en: 'Verify OTP',
      AppLocale.hi: 'OTP सत्यापित करें',
      AppLocale.mr: 'OTP तपासा',
    },
    'choose_language': {
      AppLocale.en: 'Choose your language',
      AppLocale.hi: 'अपनी भाषा चुनें',
      AppLocale.mr: 'तुमची भाषा निवडा',
    },
    'who_are_you': {
      AppLocale.en: 'Who are you?',
      AppLocale.hi: 'आप कौन हैं?',
      AppLocale.mr: 'तुम्ही कोण आहात?',
    },
    'allow_location': {
      AppLocale.en: 'Allow location to find nearby stores',
      AppLocale.hi: 'पास की दुकानें खोजने के लिए स्थान की अनुमति दें',
      AppLocale.mr: 'जवळची दुकाने शोधण्यासाठी स्थानाला परवानगी द्या',
    },
    'allow': {
      AppLocale.en: 'Allow',
      AppLocale.hi: 'अनुमति दें',
      AppLocale.mr: 'परवानगी द्या',
    },
    'skip': {
      AppLocale.en: 'Skip',
      AppLocale.hi: 'छोड़ें',
      AppLocale.mr: 'वगळा',
    },
    'home': {
      AppLocale.en: 'Home',
      AppLocale.hi: 'होम',
      AppLocale.mr: 'होम',
    },
    'stores': {
      AppLocale.en: 'Stores',
      AppLocale.hi: 'दुकानें',
      AppLocale.mr: 'दुकाने',
    },
    'cart': {
      AppLocale.en: 'Cart',
      AppLocale.hi: 'कार्ट',
      AppLocale.mr: 'कार्ट',
    },
    'profile': {
      AppLocale.en: 'Profile',
      AppLocale.hi: 'प्रोफ़ाइल',
      AppLocale.mr: 'प्रोफाइल',
    },
    'subscribe': {
      AppLocale.en: 'Subscribe',
      AppLocale.hi: 'सब्सक्राइब करें',
      AppLocale.mr: 'सबस्क्राइब करा',
    },
  };

  static String t(String key, AppLocale loc) {
    return _data[key]?[loc] ?? _data[key]?[AppLocale.en] ?? key;
  }
}
