// lib/main.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_bootstrap.dart';
import 'themes/theme_provider.dart';

import 'screens/launcher_screen.dart';
import 'routes.dart';

// ✅ Portfolio module routes
import 'fiinny_assets/modules/portfolio/screens/portfolio_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/asset_type_picker_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/add_asset_entry_screen.dart';

// ✅ TxDayDetailsScreen import
import 'screens/tx_day_details_screen.dart';

// Global navigator key (for deeplinks / notif taps)
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  AppBootstrap.configureErrorHandling();

  final themeProvider = await AppBootstrap.initializeFoundation();

  AppBootstrap.runGuarded(() {
    runApp(
      ChangeNotifierProvider<ThemeProvider>.value(
        value: themeProvider,
        child: const FiinnyApp(),
      ),
    );
  });
}

class FiinnyApp extends StatelessWidget {
  const FiinnyApp({Key? key}) : super(key: key);

  // Merge-in portfolio routes
  Map<String, WidgetBuilder> get _portfolioRoutes => {
        '/portfolio': (_) => const PortfolioScreen(),
        '/asset-type-picker': (_) => const AssetTypePickerScreen(),
        '/add-asset-entry': (_) => const AddAssetEntryScreen(),
      };

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);

    return MaterialApp(
      title: 'Fiinny',
      debugShowCheckedModeBanner: false,
      theme: themeProvider.themeData,

      // Navigator key for deeplink navigation from notif taps
      navigatorKey: rootNavigatorKey,

      // Entry point: ✅ this remains the first screen
      home: const LauncherScreen(),

      // Static route table
      routes: {
        ...appRoutes, // from routes.dart
        ..._portfolioRoutes,
      },

      // Dynamic / typed routes
      onGenerateRoute: (settings) {
        // Keep existing generated routes first
        final generated = appOnGenerateRoute(settings);
        if (generated != null) return generated;

        // ✅ tx-day-details expects a String phone argument
        if (settings.name == '/tx-day-details') {
          final phone = settings.arguments as String;
          return MaterialPageRoute(
            builder: (_) => TxDayDetailsScreen(userPhone: phone),
            settings: settings,
          );
        }

        // Fallback for unknown routes
        return MaterialPageRoute(
          builder: (_) => _RouteNotFoundScreen(
            unknownRoute: settings.name ?? 'unknown',
          ),
        );
      },
    );
  }
}

class _RouteNotFoundScreen extends StatelessWidget {
  final String unknownRoute;
  const _RouteNotFoundScreen({required this.unknownRoute});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Route not found')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.link_off, size: 48),
              const SizedBox(height: 12),
              Text('Screen "${unknownRoute}" is not registered.'),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () =>
                    Navigator.pushReplacementNamed(context, '/portfolio'),
                child: const Text('Go to Portfolio'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
