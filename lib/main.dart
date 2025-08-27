import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:lifemap/themes/theme_provider.dart';
import 'package:timezone/data/latest.dart' as tz;

import 'services/notification_service.dart';
import 'routes.dart';
import 'screens/welcome_screen.dart';

// If you have firebase_options.dart, keep this import.
// If you don't yet, just leave it commented; the try/catch below will tolerate it.
// import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  tz.initializeTimeZones();

  // Don’t let Firebase init block the app from opening:
  try {
    // If you have firebase_options.dart, prefer this:
    // await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    // Else fall back to default (requires GoogleService-Info.plist in iOS project):
    await Firebase.initializeApp();
  } catch (_) {
    // swallow init errors so UI still opens
  }

  try {
    await NotificationService.initialize();
  } catch (_) {}

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
      // Force open UI first; auth happens *after* user taps “Get Started”
      home: const WelcomeScreen(),
      routes: appRoutes,
      onGenerateRoute: appOnGenerateRoute,
    );
  }
}
