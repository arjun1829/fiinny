import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/theme.dart';
import 'features/settings/theme_provider.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
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
