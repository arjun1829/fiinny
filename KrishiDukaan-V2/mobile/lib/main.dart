import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/firebase/firebase_options.dart';
import 'core/services/notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Portrait lock on phones only. Android 16 ignores orientation locks on
  // large screens (tablets, foldables — shortest side >= 600dp) anyway, and
  // Play flags apps that set them there; letting those devices rotate keeps
  // the app's behaviour the same before and after Android 16.
  if (!kIsWeb) {
    final views = PlatformDispatcher.instance.views;
    final view = views.isEmpty ? null : views.first;
    final shortestSide = view == null
        ? 0.0
        : view.physicalSize.shortestSide / view.devicePixelRatio;
    if (shortestSide < 600) {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
      ]);
    }
  }

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  if (!kIsWeb) {
    // FCM background handler must be registered before runApp
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // Route all Flutter errors to Crashlytics in native builds
    FlutterError.onError =
        FirebaseCrashlytics.instance.recordFlutterFatalError;
    PlatformDispatcher.instance.onError = (error, stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      return true;
    };

    if (kDebugMode) {
      await FirebaseCrashlytics.instance
          .setCrashlyticsCollectionEnabled(false);
    }
  }

  runApp(
    const ProviderScope(
      child: KrishiDukaanApp(),
    ),
  );
}
