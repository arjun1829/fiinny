import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:lifemap/screens/welcome_screen.dart';
import 'package:lifemap/screens/auth_gate.dart';         // your existing AuthGate
import 'package:lifemap/screens/dashboard_screen.dart';  // update path as needed
import 'package:lifemap/screens/onboarding_screen.dart'; // update path as needed
import 'package:lifemap/services/user_service.dart';     // (for checking profile complete)
import 'package:lifemap/screens/main_nav_screen.dart';


class LauncherScreen extends StatefulWidget {
  const LauncherScreen({Key? key}) : super(key: key);

  @override
  State<LauncherScreen> createState() => _LauncherScreenState();
}

class _LauncherScreenState extends State<LauncherScreen> {
  bool _loading = true;
  bool _loggedIn = false;
  bool _onboardingComplete = false;

  @override
  void initState() {
    super.initState();
    _checkAuthAndProfile();
  }

  Future<void> _checkAuthAndProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      setState(() {
        _loading = false;
        _loggedIn = false;
      });
      return;
    }

    // TODO: check if user's onboarding/profile is complete
    bool profileComplete = await UserService().isProfileComplete(user.uid);

    setState(() {
      _loading = false;
      _loggedIn = true;
      _onboardingComplete = profileComplete;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!_loggedIn) {
      // Show welcome
      return const WelcomeScreen();
    } else if (_onboardingComplete) {
      return MainNavScreen(userPhone: FirebaseAuth.instance.currentUser!.uid);
    } else {
      return OnboardingScreen();
    }
  }
}
