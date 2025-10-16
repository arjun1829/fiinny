// lib/screens/launcher_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:lifemap/screens/welcome_screen.dart';
import 'package:lifemap/screens/onboarding_screen.dart';
import 'package:lifemap/screens/main_nav_screen.dart';

import '../shims/shared_prefs_shim.dart';

// Push bootstrap + prefs (push init is orchestrated centrally in main.dart)
import 'package:lifemap/services/push/push_bootstrap.dart';
import 'package:lifemap/services/push/notif_prefs_service.dart';
import 'package:lifemap/services/push/first_surface_gate.dart';

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
  Timer? _firstSurfaceFallback;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;

      // Start a gentle fallback timer in case navigation takes unusually long.
      // This ensures we don't block push permission prompts forever on slower
      // devices while still preferring to mark the first surface ready only
      // after we've transitioned away from the launcher splash.
      _firstSurfaceFallback?.cancel();
      _firstSurfaceFallback = Timer(const Duration(seconds: 2), () {
        if (!mounted || FirstSurfaceGate.isReady) return;
        debugPrint('[Launcher] First surface fallback → markReady()');
        FirstSurfaceGate.markReady();
      });

      setState(() => _booted = true);

      final prefs = await SharedPreferences.getInstance();
      if (!mounted) return;

      final seenOnboarding = prefs.getBool('seen_onboarding') ?? false;
      if (!seenOnboarding) {
        debugPrint('[Launcher] First launch → WelcomeScreen');
        _go(const WelcomeScreen());
        return;
      }

      _startWatchdog();

      await _handleAuthState(FirebaseAuth.instance.currentUser);
      if (!mounted || _navigated) return;

      _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
        unawaited(_handleAuthState(user));
      });
    });
  }

  Future<void> _handleAuthState(User? user) async {
    if (!mounted || _navigated) return;

    if (user == null) {
      debugPrint('[Launcher] No user → WelcomeScreen');
      _go(const WelcomeScreen());
      return;
    }

    // small delay for smoother splash when we already have a session
    await Future.delayed(const Duration(milliseconds: 150));

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

    if (mounted && !FirstSurfaceGate.isReady) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          FirstSurfaceGate.markReady();
        }
      });
    } else {
      FirstSurfaceGate.markReady();
    }

    _firstSurfaceFallback?.cancel();
    _firstSurfaceFallback = null;
  }

  @override
  void dispose() {
    _watchdog?.cancel();
    _authSub?.cancel();
    _firstSurfaceFallback?.cancel();
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
