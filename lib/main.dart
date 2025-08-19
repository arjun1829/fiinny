import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:lifemap/themes/theme_provider.dart';
import './services/notification_service.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'screens/launcher_screen.dart';


import 'screens/auth_gate.dart';  // Move AuthGate to its own file, always import here
import 'routes.dart';

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
      home: const LauncherScreen(),
      routes: appRoutes,
      onGenerateRoute: appOnGenerateRoute,
    );
  }
}
