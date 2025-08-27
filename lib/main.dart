import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:lifemap/themes/theme_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tz;

import 'services/notification_service.dart';
import 'routes.dart';
import 'screens/welcome_screen.dart';
import 'screens/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  tz.initializeTimeZones();

  try {
    await Firebase.initializeApp();
  } catch (_) {}

  try {
    await NotificationService.initialize();
  } catch (_) {}

  final prefs = await SharedPreferences.getInstance();
  final themeProvider = ThemeProvider();
  await themeProvider.loadTheme();

  final seenOnboarding = prefs.getBool('seen_onboarding') ?? false;
  final userPhone = prefs.getString('userPhone');

  runApp(
    ChangeNotifierProvider.value(
      value: themeProvider,
      child: FiinnyApp(
        seenOnboarding: seenOnboarding,
        userPhone: userPhone,
      ),
    ),
  );
}

class FiinnyApp extends StatelessWidget {
  final bool seenOnboarding;
  final String? userPhone;

  const FiinnyApp({
    super.key,
    required this.seenOnboarding,
    this.userPhone,
  });

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    return MaterialApp(
      title: 'Fiinny',
      debugShowCheckedModeBanner: false,
      theme: themeProvider.themeData,
      home: seenOnboarding && userPhone != null
          ? DashboardScreen(userPhone: userPhone!) // ✅ fixed
          : const WelcomeScreen(),
      routes: appRoutes,
      onGenerateRoute: appOnGenerateRoute,
    );
  }
}
