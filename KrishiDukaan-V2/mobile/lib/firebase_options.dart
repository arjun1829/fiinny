// Generated manually from google-services.json (android),
// GoogleService-Info.plist (ios), and the web app firebaseConfig.
// Equivalent to what `flutterfire configure` produces.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not configured for $defaultTargetPlatform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
    appId: '1:650303885415:web:7db7619260aa478b2b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    authDomain: 'krishidukan-e8315.firebaseapp.com',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
    measurementId: 'G-7MEFGCD4EX',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDoD8qbPN5dpW4-ggQbZDjoaqJs0okWakI',
    appId: '1:650303885415:android:794d0055354eb8d62b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyCBXeLPoQA-ajsdsxgvjXD_kRpVtrRDyic',
    appId: '1:650303885415:ios:c0db03e9833fbd7e2b84c2',
    messagingSenderId: '650303885415',
    projectId: 'krishidukan-e8315',
    storageBucket: 'krishidukan-e8315.firebasestorage.app',
    iosBundleId: 'com.karanarjuntechnologies.krishidukan',
  );
}
