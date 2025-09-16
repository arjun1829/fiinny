// lib/screens/launcher_screen.dart
import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:lifemap/screens/welcome_screen.dart';
import 'package:lifemap/screens/onboarding_screen.dart';
import 'package:lifemap/screens/main_nav_screen.dart';

// Push bootstrap + prefs + push service
import 'package:lifemap/services/push/push_service.dart';
import 'package:lifemap/services/push/push_bootstrap.dart';
import 'package:lifemap/services/push/notif_prefs_service.dart';

class LauncherScreen extends StatefulWidget {
  const LauncherScreen({Key? key}) : super(key: key);

  @override
  State<LauncherScreen> createState() => _LauncherScreenState();
}

class _LauncherScreenState extends State<LauncherScreen> {
  bool _booted = false;
  bool _navigated = false;
  StreamSubscription<User?>? _authSub;
  Timer? _watchdog;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _booted = true);

      _startWatchdog();

      // Decide quickly; navigate first; bootstrap AFTER navigation.
      _authSub = FirebaseAuth.instance.authStateChanges().listen((user) async {
        if (!mounted || _navigated) return;

        // small delay for smoother splash
        await Future.delayed(const Duration(milliseconds: 150));

        if (user == null) {
          debugPrint('[Launcher] No user → WelcomeScreen');
          _go(const WelcomeScreen());
          return;
        }

        // ---- onboarding decision (fast) ----
        final phone = (user.phoneNumber ?? '').trim();
        final String docIdPrimary = phone.isNotEmpty ? phone : user.uid;
        final String docIdFallback = phone.isNotEmpty ? user.uid : '';

        final onboarded =
        await _isOnboardedSafe(docIdPrimary, fallbackId: docIdFallback);
        if (!mounted || _navigated) return;

        if (onboarded) {
          final who = phone.isNotEmpty ? phone : user.uid;
          debugPrint('[Launcher] Onboarded → MainNavScreen($who)');
          _go(MainNavScreen(userPhone: who));
        } else {
          debugPrint('[Launcher] Not onboarded → OnboardingScreen');
          _go(const OnboardingScreen());
        }

        // 🔽 Kick off bootstrap in the background (non-blocking)
        _kickoffBootstrap(user);
      });
    });
  }

  // Run push + prefs wiring AFTER navigation; never block the UI.
  void _kickoffBootstrap(User user) {
    Future<void>(() async {
      try {
        final uid = user.uid;
        final phone = (user.phoneNumber ?? '').trim();

        // Ensure canonical users/{uid} exists (for FCM token + prefs)
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .set({
          'uid': uid,
          'phone': phone.isNotEmpty ? phone : null,
          'updatedAt': DateTime.now().millisecondsSinceEpoch,
        }, SetOptions(merge: true))
            .timeout(const Duration(seconds: 3));

        // Lightweight mirror at users/{phone} for legacy lookups (optional)
        if (phone.isNotEmpty) {
          await FirebaseFirestore.instance
              .collection('users')
              .doc(phone)
              .set({
            'uid': uid,
            'phone': phone,
            'updatedAt': DateTime.now().millisecondsSinceEpoch,
            // don't force 'onboarded' here
          }, SetOptions(merge: true))
              .timeout(const Duration(seconds: 3));
        }

        // Ensure default notification prefs (idempotent)
        await PushBootstrap.ensureUserRoot().timeout(const Duration(seconds: 3));
        await NotifPrefsService.ensureDefaultPrefs()
            .timeout(const Duration(seconds: 3));

        // iOS can be finicky: slight delay; never block forever
        if (Platform.isIOS) {
          await Future.delayed(const Duration(milliseconds: 400));
        }
        await PushService.init().timeout(const Duration(seconds: 6));
      } catch (e) {
        debugPrint('[Launcher] bootstrap (background) error: $e'); // never fatal
      }
    });
  }

  void _startWatchdog() {
    _watchdog = Timer(const Duration(seconds: 3), () {
      if (!_navigated && mounted) {
        debugPrint('[Launcher] Watchdog fired → WelcomeScreen');
        _go(const WelcomeScreen());
      }
    });
  }

  Future<bool> _isOnboardedSafe(String primaryId, {String fallbackId = ''}) async {
    try {
      final ok = await _fetchOnboarded(primaryId)
          .timeout(const Duration(seconds: 5), onTimeout: () => null);
      if (ok != null) return ok;

      if (fallbackId.isNotEmpty) {
        final ok2 = await _fetchOnboarded(fallbackId)
            .timeout(const Duration(seconds: 3), onTimeout: () => null);
        if (ok2 != null) return ok2;
      }
    } catch (e) {
      debugPrint('[Launcher] _isOnboardedSafe error: $e');
    }
    return false;
  }

  Future<bool?> _fetchOnboarded(String docId) async {
    try {
      final snap =
      await FirebaseFirestore.instance.collection('users').doc(docId).get();
      if (!snap.exists) return false;
      final data = snap.data() ?? {};
      return data['onboarded'] == true;
    } catch (e) {
      debugPrint('[Launcher] _fetchOnboarded("$docId") failed: $e');
      return null;
    }
  }

  void _go(Widget page) {
    if (!mounted || _navigated) return;
    _navigated = true;
    _watchdog?.cancel();
    _authSub?.cancel(); // stop listening once we leave

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => page,
        transitionDuration: const Duration(milliseconds: 250),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  void dispose() {
    _watchdog?.cancel();
    _authSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.black, // consistent with Fiinny dark splash
      body: Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
      ),
    );
  }
}
