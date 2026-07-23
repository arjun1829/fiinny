import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/constants/app_colors.dart';
import 'core/providers/locale_provider.dart';
import 'core/providers/user_provider.dart';
import 'core/router/app_router.dart';
import 'core/services/notification_service.dart';

class KrishiDukaanApp extends ConsumerStatefulWidget {
  const KrishiDukaanApp({super.key});

  @override
  ConsumerState<KrishiDukaanApp> createState() => _KrishiDukaanAppState();
}

class _KrishiDukaanAppState extends ConsumerState<KrishiDukaanApp> {
  @override
  void initState() {
    super.initState();
    // Initialize FCM when a logged-in user is first available
    ref.listenManual(currentUserProvider, (_, next) {
      final user = next.value;
      if (!kIsWeb && user != null && user.phone.isNotEmpty) {
        NotificationService().initialize(
          user.phone,
          router: ref.read(routerProvider),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);

    return MaterialApp.router(
      title: 'KrishiDukan',
      debugShowCheckedModeBanner: false,
      locale: locale,
      supportedLocales: const [Locale('en'), Locale('hi')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        // Bundled Roboto (see pubspec.yaml) for every Text/TextStyle that
        // doesn't set its own fontFamily — without this, iOS silently
        // substitutes San Francisco for unstyled text while AppTextStyles'
        // explicit 'Roboto' now resolves correctly, so screens mixing both
        // (most of them) would still show two different typefaces side by
        // side with mismatched line-heights.
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          primary: AppColors.primary,
          secondary: AppColors.secondary,
          surface: AppColors.surface,
          error: AppColors.error,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.topBarStart,
          foregroundColor: Colors.white,
          elevation: 0,
          // Soft shadow that only appears once content scrolls beneath the bar,
          // echoing the floating bottom nav's depth.
          scrolledUnderElevation: 4,
          shadowColor: Color(0x33000000),
          // Stop Material 3 from tinting the bar a washed-out colour.
          surfaceTintColor: Colors.transparent,
          centerTitle: false,
          titleTextStyle: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.2,
          ),
          iconTheme: IconThemeData(color: Colors.white),
          // Rounded bottom corners to match the pill-shaped bottom nav.
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(bottom: Radius.circular(22)),
          ),
          // Light status-bar icons over the deep-green bar.
          systemOverlayStyle: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.light,
            statusBarBrightness: Brightness.dark,
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: Colors.white,
          indicatorColor: AppColors.primaryContainer,
          labelTextStyle: WidgetStateProperty.all(
            const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          color: Colors.white,
        ),
        // Floating rounded snackbars app-wide — every confirmation/error toast
        // (add to cart, review posted, OTP errors…) picks this up for free.
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: const Color(0xFF2A2A2A),
          contentTextStyle: const TextStyle(
            color: Colors.white,
            fontSize: 13.5,
            fontWeight: FontWeight.w500,
            fontFamily: 'Roboto',
          ),
          actionTextColor: AppColors.secondary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          elevation: 4,
        ),
      ),
      routerConfig: router,
    );
  }
}
