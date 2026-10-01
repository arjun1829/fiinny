import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

import '../constants/app_config.dart';

/// Registered under the SAME Firebase projects as the customer app — the sales
/// app reads and writes the same Firestore data as krishidukan.com/sales. Only
/// the per-app client ids differ (package com.karanarjuntechnologies.KrishiDukanSales).
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return AppConfig.isUat ? _webUat : _webProd;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return AppConfig.isUat ? _androidUat : _androidProd;
      case TargetPlatform.iOS:
        return _iosProd;
      default:
        return AppConfig.isUat ? _webUat : _webProd;
    }
  }

  // ─── Production (krishidukan-e8315) ───────────────────────────────────────
  static const _androidProd = FirebaseOptions(
    apiKey: 'AIzaSyDoD8qbPN5dpW4-ggQbZDjoaqJs0okWakI',
    appId: '1:650303885415:android:9aa71a8b016690ee2b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
  );

  static const _iosProd = FirebaseOptions(
    apiKey: 'AIzaSyCBXeLPoQA-ajsdsxgvjXD_kRpVtrRDyic',
    appId: '1:650303885415:ios:cd78322502709a9d2b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
    iosBundleId: 'com.karanarjuntechnologies.KrishiDukanSales',
  );

  static const _webProd = FirebaseOptions(
    apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
    appId: '1:650303885415:web:7db7619260aa478b2b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
    authDomain: 'krishidukan-e8315.firebaseapp.com',
  );

  // ─── UAT (karan-arjun-uat) ────────────────────────────────────────────────
  // No dedicated sales app is registered in the UAT project yet, so these reuse
  // the customer app's UAT client ids. Firestore/Auth do not care which client
  // id signs in, only which project — so UAT builds still talk to UAT data.
  static const _androidUat = FirebaseOptions(
    apiKey: 'AIzaSyDJHplQrjXKVpPOfqr7hBcjU93iPKwVu2g',
    appId: '1:823396858694:android:9d30ebc8c69fb2ea328347',
    messagingSenderId: '823396858694',
    projectId: 'karan-arjun-uat',
    storageBucket: 'karan-arjun-uat.firebasestorage.app',
  );

  static const _webUat = FirebaseOptions(
    apiKey: 'AIzaSyAG7Q5QIhI0awPbyrmK0eGWd7-eatwmpNw',
    appId: '1:823396858694:web:647ee169b50a6f06328347',
    messagingSenderId: '823396858694',
    projectId: 'karan-arjun-uat',
    storageBucket: 'karan-arjun-uat.firebasestorage.app',
    authDomain: 'karan-arjun-uat.firebaseapp.com',
  );
}
