import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:lifemap/screens/welcome_screen.dart';
import 'package:lifemap/screens/onboarding_screen.dart';
import 'package:lifemap/screens/main_nav_screen.dart';
import 'package:lifemap/services/user_service.dart';

class LauncherScreen extends StatefulWidget {
  const LauncherScreen({Key? key}) : super(key: key);

  @override
  State<LauncherScreen> createState() => _LauncherScreenState();
}

class _LauncherScreenState extends State<LauncherScreen> {
  /// We keep a small state so we can render something immediately while we wait.
  bool _booted = false; // true after first frame callback runs
  StreamSubscription<User?>? _authSub;

  @override
  void initState() {
    super.initState();

    // Ensure first frame paints (avoid doing heavy work in initState)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _booted = true);

      // Listen to auth changes (handles first-launch + rehydrate)
      _authSub = FirebaseAuth.instance.authStateChanges().listen((user) async {
        // Tiny delay so splash transition feels smooth and Firebase warms up
        await Future.delayed(const Duration(milliseconds: 200));

        if (!mounted) return;

        if (user == null) {
          // Not logged in → go to welcome
          _go(const WelcomeScreen());
          return;
        }

        // Logged in → check onboarding/profile completion, but don't block forever
        final bool profileComplete = await _safeIsProfileComplete(user.uid);

        if (!mounted) return;

        if (profileComplete) {
          // NOTE: if MainNavScreen expects a *phone*, pass phone; if UID is fine, keep as is.
          _go(MainNavScreen(userPhone: user.uid));
        } else {
          _go(const OnboardingScreen());
        }
      });
    });
  }

  Future<bool> _safeIsProfileComplete(String uid) async {
    try {
      // Timeout prevents "stuck on first launch" if network/rules misbehave
      return await UserService().isProfileComplete(uid).timeout(
        const Duration(seconds: 6),
        onTimeout: () => false,
      );
    } catch (_) {
      // Fail-soft → let user finish onboarding instead of blocking
      return false;
    }
  }

  void _go(Widget page) {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => page,
        transitionDuration: const Duration(milliseconds: 200),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // First frame: show a neutral loader (keeps splash->app smooth)
    if (!_booted) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    // While we wait for the first auth event, keep a simple loading UI.
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
