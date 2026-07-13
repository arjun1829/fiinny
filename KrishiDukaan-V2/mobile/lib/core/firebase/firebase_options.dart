import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

// Pass --dart-define=APP_FLAVOR=uat to switch Firebase project at build time.
const bool _isUat = String.fromEnvironment('APP_FLAVOR') == 'uat';

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return _isUat ? _webUat : _webProd;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return _isUat ? _androidUat : _androidProd;
      case TargetPlatform.iOS:
        if (_isUat) {
          throw UnsupportedError('iOS UAT flavor is not configured yet.');
        }
        return _iosProd;
      default:
        return _isUat ? _webUat : _webProd;
    }
  }

  // ─── Production (krishidukan-e8315) ───────────────────────────────────────
  static const FirebaseOptions _androidProd = FirebaseOptions(
    apiKey: 'AIzaSyDoD8qbPN5dpW4-ggQbZDjoaqJs0okWakI',
    appId: '1:650303885415:android:794d0055354eb8d62b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
  );

  static const FirebaseOptions _iosProd = FirebaseOptions(
    apiKey: 'AIzaSyCBXeLPoQA-ajsdsxgvjXD_kRpVtrRDyic',
    appId: '1:650303885415:ios:883857d3efb69c8b2b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
    iosBundleId: 'com.karanarjuntechnologies.krishidukaanApp',
  );

  static const FirebaseOptions _webProd = FirebaseOptions(
    apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
    appId: '1:650303885415:web:7db7619260aa478b2b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
    authDomain: 'krishidukan-e8315.firebaseapp.com',
    measurementId: 'G-7MEFGCD4EX',
  );

  // ─── UAT (karan-arjun-uat) ────────────────────────────────────────────────
  static const FirebaseOptions _androidUat = FirebaseOptions(
    apiKey: 'AIzaSyDJHplQrjXKVpPOfqr7hBcjU93iPKwVu2g',
    appId: '1:823396858694:android:9d30ebc8c69fb2ea328347',
    messagingSenderId: '823396858694',
    projectId: 'karan-arjun-uat',
    storageBucket: 'karan-arjun-uat.firebasestorage.app',
  );

  static const FirebaseOptions _webUat = FirebaseOptions(
    apiKey: 'AIzaSyAG7Q5QIhI0awPbyrmK0eGWd7-eatwmpNw',
    appId: '1:823396858694:web:647ee169b50a6f06328347',
    messagingSenderId: '823396858694',
    projectId: 'karan-arjun-uat',
    storageBucket: 'karan-arjun-uat.firebasestorage.app',
    authDomain: 'karan-arjun-uat.firebaseapp.com',
    measurementId: 'G-KPJCC681D5',
  );

  // Keep old names as aliases so any external references don't break.
  static FirebaseOptions get android => _isUat ? _androidUat : _androidProd;
  static FirebaseOptions get web => _isUat ? _webUat : _webProd;
}
