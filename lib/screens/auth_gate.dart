import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl_phone_field/intl_phone_field.dart';

import 'main_nav_screen.dart';
import 'onboarding_screen.dart';

enum AuthStage { phoneInput, otpInput, loading, phoneAfterGoogle }

class AuthGate extends StatefulWidget {
  const AuthGate({Key? key}) : super(key: key);

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();

  String? _fullPhoneNumber;
  String? _verificationId;
  String? _error;
  AuthStage _stage = AuthStage.phoneInput;
  bool _loading = false;

  User? _googleUser; // holds Google user until we attach a phone

  StreamSubscription<User?>? _authSub;

  @override
  void initState() {
    super.initState();

    // Keep UI responsive while auth warms up
    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) async {
      if (!mounted) return;

      // If logged in, decide where to go
      if (user != null) {
        // If Google account without phone → onboarding to capture phone
        final phone = (user.phoneNumber ?? '').trim();
        if (phone.isEmpty) {
          _go(const OnboardingScreen());
          return;
        }

        // Phone exists → check Firestore(users/<phone>)
        final ok = await _isOnboardedOrCreateSkeleton(phone, user);
        if (!mounted) return;
        if (ok) {
          _go(MainNavScreen(userPhone: phone));
        } else {
          _go(const OnboardingScreen());
        }
      }
      // else: user == null → we simply show the auth UI below
    });
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  // ---------- GOOGLE SIGN-IN ----------
  Future<void> _signInWithGoogle() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final googleUser = await GoogleSignIn(scopes: const ['email']).signIn();
      if (googleUser == null) throw Exception('cancelled');

      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      final userCred = await FirebaseAuth.instance.signInWithCredential(credential);
      _googleUser = userCred.user;

      // If phone missing, ask for it (phoneAfterGoogle stage)
      if ((_googleUser?.phoneNumber ?? '').isEmpty) {
        setState(() {
          _stage = AuthStage.phoneAfterGoogle;
        });
      } else {
        // Rare: Google already had a phone
        await _saveUserToFirestore(_googleUser!, _googleUser!.phoneNumber!);
      }
    } catch (e) {
      setState(() => _error = "Google sign-in failed. Please try again.");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------- PHONE AUTH (STEP 1: SEND OTP) ----------
  Future<void> _sendOTP() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final phone = _normalizePhone(_fullPhoneNumber);
      if (phone == null) {
        setState(() {
          _error = "Please enter a valid phone number (with country code).";
        });
        return;
      }

      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: phone,
        timeout: const Duration(seconds: 60),
        verificationCompleted: (PhoneAuthCredential credential) async {
          // On some devices it may auto-verify
          final userCred = await FirebaseAuth.instance.signInWithCredential(credential);
          await _saveUserToFirestore(userCred.user!, phone);
        },
        verificationFailed: (e) {
          setState(() => _error = e.message ?? "Verification failed");
        },
        codeSent: (String verificationId, int? resendToken) {
          setState(() {
            _verificationId = verificationId;
            _stage = AuthStage.otpInput;
          });
        },
        codeAutoRetrievalTimeout: (String verificationId) {
          // Keep the verificationId so manual entry can still work
          _verificationId ??= verificationId;
        },
      );
    } catch (e) {
      setState(() => _error = "Failed to send OTP. Please try again.");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------- PHONE AUTH (STEP 2: VERIFY OTP) ----------
  Future<void> _verifyOTP() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final smsCode = _otpController.text.trim();
      final vid = _verificationId;
      final phone = _normalizePhone(_fullPhoneNumber);

      if (vid == null || smsCode.length < 4 || phone == null) {
        setState(() => _error = "Please enter the 6-digit OTP.");
        return;
      }

      final credential = PhoneAuthProvider.credential(
        verificationId: vid,
        smsCode: smsCode,
      );
      final userCred = await FirebaseAuth.instance.signInWithCredential(credential);
      await _saveUserToFirestore(userCred.user!, phone);
    } catch (e) {
      setState(() => _error = "Invalid OTP. Please try again.");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------- After Google sign-in, attach phone ----------
  Future<void> _savePhoneAfterGoogle() async {
    final phone = _normalizePhone(_fullPhoneNumber);
    if (phone == null) {
      setState(() => _error = "Please enter a valid phone number.");
      return;
    }
    final gu = _googleUser;
    if (gu == null) {
      setState(() => _error = "Google session expired. Please sign in again.");
      return;
    }
    await _saveUserToFirestore(gu, phone);
  }

  // ---------- Firestore helpers ----------
  Future<bool> _isOnboardedOrCreateSkeleton(String phone, User user) async {
    try {
      final ref = FirebaseFirestore.instance.collection('users').doc(phone);
      final snap = await ref.get();
      if (!snap.exists) {
        await ref.set({
          'onboarded': false,
          'email': user.email ?? '',
          'phone': phone,
          'avatar': user.photoURL ?? '',
          'createdAt': FieldValue.serverTimestamp(),
        });
        return false;
      }
      final data = (snap.data() ?? {});
      return data['onboarded'] == true;
    } catch (_) {
      // Fail-soft → treat as not onboarded so user can complete profile
      return false;
    }
  }

  Future<void> _saveUserToFirestore(User user, String phone) async {
    final ok = await _isOnboardedOrCreateSkeleton(phone, user);
    if (!mounted) return;

    // Replace the whole stack to avoid popping back into auth
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => ok
            ? MainNavScreen(userPhone: phone)
            : const OnboardingScreen(),
      ),
          (_) => false,
    );
  }

  String? _normalizePhone(String? raw) {
    if (raw == null) return null;
    final v = raw.trim();
    if (!v.startsWith('+') || v.length < 8) return null;
    return v;
    // (We keep it simple. Your Firestore uses doc(phone) with '+' prefix.)
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        final waiting = (snapshot.connectionState == ConnectionState.waiting) || _loading;

        if (waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        // If already logged in, the authState listener in initState will navigate.
        if (snapshot.data != null) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        // Auth UI
        return Scaffold(
          body: Center(
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 48),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(height: 10),
                    Text(
                      "Welcome to Fiinny",
                      style: TextStyle(
                        fontFamily: 'Montserrat',
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Theme.of(context).colorScheme.primary,
                        letterSpacing: 0.7,
                      ),
                    ),
                    const SizedBox(height: 28),

                    if (_stage == AuthStage.phoneInput) ...[
                      Text(
                        "Sign in with your phone number",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 17,
                          fontWeight: FontWeight.w500,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 16),
                      IntlPhoneField(
                        controller: _phoneController,
                        decoration: InputDecoration(
                          labelText: 'Phone Number',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        initialCountryCode: 'IN',
                        onChanged: (phone) => _fullPhoneNumber = phone.completeNumber,
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _sendOTP,
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 15),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            backgroundColor: Theme.of(context).colorScheme.primary,
                          ),
                          child: const Text(
                            "Continue",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.4,
                              fontFamily: 'Montserrat',
                            ),
                          ),
                        ),
                      ),
                    ],

                    if (_stage == AuthStage.otpInput) ...[
                      Text(
                        "Enter the OTP sent to your phone",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 17,
                          fontWeight: FontWeight.w500,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _otpController,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: "6-digit OTP",
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _verifyOTP,
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 15),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            backgroundColor: Theme.of(context).colorScheme.primary,
                          ),
                          child: const Text(
                            "Verify & Sign In",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.4,
                              fontFamily: 'Montserrat',
                            ),
                          ),
                        ),
                      ),
                    ],

                    if (_stage == AuthStage.phoneAfterGoogle) ...[
                      Text(
                        "Enter your phone number to complete sign-in",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 17,
                          fontWeight: FontWeight.w500,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 16),
                      IntlPhoneField(
                        controller: _phoneController,
                        decoration: InputDecoration(
                          labelText: 'Phone Number',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        initialCountryCode: 'IN',
                        onChanged: (phone) => _fullPhoneNumber = phone.completeNumber,
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _savePhoneAfterGoogle,
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 15),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            backgroundColor: Theme.of(context).colorScheme.primary,
                          ),
                          child: const Text(
                            "Save & Continue",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.4,
                              fontFamily: 'Montserrat',
                            ),
                          ),
                        ),
                      ),
                    ],

                    const SizedBox(height: 32),
                    const Divider(height: 2, thickness: 1),
                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        icon: Image.asset('assets/icons/google_icon.png', height: 24, width: 24),
                        label: const Text(
                          "Sign in with Google",
                          style: TextStyle(
                            fontFamily: 'Montserrat',
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        onPressed: _signInWithGoogle,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          side: BorderSide(
                            color: Theme.of(context).colorScheme.primary,
                            width: 1.2,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 20),
                      Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 15)),
                    ],
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  void _go(Widget page) {
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => page,
        transitionDuration: const Duration(milliseconds: 200),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
          (_) => false,
    );
  }
}
