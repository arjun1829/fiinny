import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/theme.dart';
import 'features/settings/theme_provider.dart';
import 'firebase_options.dart';

/// `flutter run --dart-define=USE_EMULATOR=true` points the app at the local
/// Auth + Firestore emulators under a demo- project id, so billing can be
/// exercised end to end without any chance of touching production data.
const _useEmulator = bool.fromEnvironment('USE_EMULATOR');
const _emulatorHost =
    String.fromEnvironment('EMULATOR_HOST', defaultValue: 'localhost');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: _useEmulator
        ? DefaultFirebaseOptions.emulator
        : DefaultFirebaseOptions.currentPlatform,
  );

  // Offline cache: bills, customers and products opened once stay readable
  // with no network. Native already persists by default; this pins it on and
  // gives the cache room for a full catalogue. Web keeps its default so a
  // second browser tab can't fight over the IndexedDB lock.
  if (!kIsWeb) {
    FirebaseFirestore.instance.settings = const Settings(
      persistenceEnabled: true,
      cacheSizeBytes: 100 * 1024 * 1024,
    );
  }
  if (_useEmulator) {
    FirebaseFirestore.instance.useFirestoreEmulator(_emulatorHost, 8080);
    await FirebaseAuth.instance.useAuthEmulator(_emulatorHost, 9099);
  }

  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  // Read the saved theme before the first frame so the app opens directly in
  // the user's last choice instead of flashing dark and then swapping.
  final savedVariant = await loadSavedThemeVariant();
  AppColors.variant = savedVariant;

  runApp(
    ProviderScope(
      overrides: [
        themeVariantProvider
            .overrideWith((ref) => ThemeVariantNotifier(savedVariant)),
      ],
      child: const KrishiDukanErpApp(),
    ),
  );
}
