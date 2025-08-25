import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:lifemap/themes/theme_provider.dart';
import 'package:timezone/data/latest.dart' as tz;

import 'services/notification_service.dart';
import 'routes.dart';
import 'screens/auth_gate.dart'; // <- our new entry screen

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  tz.initializeTimeZones();
  await Firebase.initializeApp();
  await NotificationService.initialize();

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
      // 🚫 No LauncherScreen. Go straight to the auth gate.
      home: const AuthGate(),
      routes: appRoutes,
      onGenerateRoute: appOnGenerateRoute,
    );
  }
}
