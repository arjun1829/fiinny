import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

/// Android reads its config from android/app/google-services.json, so options
/// are only needed for the web build used to preview the app in a browser.
class DefaultFirebaseOptions {
  static FirebaseOptions? get currentPlatform => kIsWeb ? web : null;

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyAaQ8tB11OBJyqGXEl55oeyQnVrOLrBrxE',
    appId: '1:832154675525:web:aadc29d24e4c962f85362c',
    messagingSenderId: '832154675525',
    projectId: 'karanarjun-pvt-ltd',
    authDomain: 'karanarjun-pvt-ltd.firebaseapp.com',
    storageBucket: 'karanarjun-pvt-ltd.firebasestorage.app',
    measurementId: 'G-70B3CNJVQM',
  );
}
