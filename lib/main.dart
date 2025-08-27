import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:timezone/data/latest.dart' as tz;

import 'firebase_options.dart';                 // <- from flutterfire configure
import 'services/notification_service.dart';
import 'routes.dart';
import 'screens/auth_gate.dart';
import 'themes/theme_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Init platform stuff up-front
  tz.initializeTimeZones();

  // ✅ Initialize Firebase with per-platform options (iOS needs this)
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Local notifications (safe to run after Firebase)
  await NotificationService.initialize();

  // Theme
  final themeProvider = ThemeProvider();
  await themeProvider.loadTheme();

  runApp(
    ChangeNotifierProvider.value(
      value: themeProvider,
      child: const FiinnyApp(),
    ),
  );
}

class FiinnyApp extends StatelessWidget {
  const FiinnyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    return MaterialApp(
      title: 'Fiinny',
      debugShowCheckedModeBanner: false,
      theme: themeProvider.themeData,
      home: const AuthGate(),        // straight into auth gate
      routes: appRoutes,
      onGenerateRoute: appOnGenerateRoute,
    );
  }
}
