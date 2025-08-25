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

  final _google = GoogleSignIn(); // safe to reuse

  String? _fullPhoneNumber; // E.164 (+91...)
  String? _verificationId;
  String? _error;

  AuthStage _stage = AuthStage.phoneInput;
  bool _loading = false;
  User? _googleUser;

  // ---------- GOOGLE SIGN-IN ----------
  Future<void> _signInWithGoogle() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final googleUser = await _google.signIn();
      if (googleUser == null) {
        if (!mounted) return;
        setState(() => _loading = false);
        return; // user cancelled
      }

      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      final userCred =
      await FirebaseAuth.instance.signInWithCredential(credential);
      _googleUser = userCred.user;

      // If phone missing after Google sign-in, ask for it
      final phone = (_googleUser?.phoneNumber ?? '').trim();
      if (phone.isEmpty) {
        if (!mounted) return;
        setState(() {
          _stage = AuthStage.phoneAfterGoogle;
          _loading = false;
        });
        return;
      }

      await _saveUserToFirestore(_googleUser!, phone);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = "Google sign-in failed. Please try again.";
        _loading = false;
      });
    }
  }

  // ---------- PHONE AUTH (OTP) ----------
  Future<void> _sendOTP() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final phone = _fullPhoneNumber?.trim();
      if (phone == null || phone.isEmpty || !phone.startsWith('+')) {
        if (!mounted) return;
        setState(() {
          _error = "Please enter a valid phone number (include country code).";
          _loading = false;
        });
        return;
      }

      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: phone,
        verificationCompleted: (PhoneAuthCredential credential) async {
          // Auto-retrieval or instant verification
          final userCred =
          await FirebaseAuth.instance.signInWithCredential(credential);
          await _saveUserToFirestore(userCred.user!, phone);
        },
        verificationFailed: (e) {
          if (!mounted) return;
          setState(() {
            _error = e.message ?? "Verification failed.";
            _loading = false;
          });
        },
        codeSent: (String verificationId, int? resendToken) {
          if (!mounted) return;
          setState(() {
            _verificationId = verificationId;
            _stage = AuthStage.otpInput;
            _loading = false;
          });
        },
        codeAutoRetrievalTimeout: (String verificationId) {
          // keep verificationId to still allow manual entry later
          _verificationId = verificationId;
        },
        timeout: const Duration(seconds: 60),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = "Failed to send OTP. Please try again.";
        _loading = false;
      });
    }
  }

  Future<void> _verifyOTP() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final smsCode = _otpController.text.trim();
      if ((_verificationId ?? '').isEmpty || smsCode.length < 4) {
        if (!mounted) return;
        setState(() {
          _error = "Invalid OTP. Please check and try again.";
          _loading = false;
        });
        return;
      }

      final credential = PhoneAuthProvider.credential(
        verificationId: _verificationId!,
        smsCode: smsCode,
      );

      final userCred =
      await FirebaseAuth.instance.signInWithCredential(credential);

      final phone = _fullPhoneNumber?.trim() ?? userCred.user?.phoneNumber ?? "";
      if (phone.isEmpty) {
        // If somehow phone missing, fallback to onboarding to collect it
        if (!mounted) return;
        setState(() {
          _loading = false;
        });
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const OnboardingScreen()),
        );
        return;
      }

      await _saveUserToFirestore(userCred.user!, phone);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = "Invalid OTP. Please try again.";
        _loading = false;
      });
    }
  }

  // ---------- FIRESTORE PERSIST & ROUTING ----------
  Future<void> _saveUserToFirestore(User user, String phone) async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final e164 = phone.trim();
      if (e164.isEmpty || !e164.startsWith('+')) {
        // No phone? Go collect it in onboarding.
        if (!mounted) return;
        setState(() => _loading = false);
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const OnboardingScreen()),
        );
        return;
      }

      final users = FirebaseFirestore.instance.collection('users');
      final docRef = users.doc(e164);
      final snap = await docRef.get();

      if (!snap.exists) {
        await docRef.set({
          'onboarded': false,
          'email': user.email ?? '',
          'phone': e164,
          'avatar': user.photoURL ?? '',
          'createdAt': FieldValue.serverTimestamp(),
        });
      }

      final latest = await docRef.get();
      final onboarded = (latest.data()?['onboarded'] == true);

      if (!mounted) return;
      setState(() => _loading = false);

      if (onboarded) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: e164)),
        );
      } else {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const OnboardingScreen()),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = "Could not save your account. Please retry.";
        _loading = false;
      });
    }
  }

  // After Google sign-in, user enters phone → save
  Future<void> _savePhoneAfterGoogle() async {
    final phone = _fullPhoneNumber?.trim() ?? '';
    if (phone.isEmpty || !phone.startsWith('+')) {
      if (!mounted) return;
      setState(() => _error = "Please enter a valid phone number.");
      return;
    }
    if (_googleUser == null) {
      if (!mounted) return;
      setState(() => _error = "Google session expired. Please try again.");
      return;
    }
    await _saveUserToFirestore(_googleUser!, phone);
  }

  // When already signed-in: decide where to go (fast, safe)
  Widget _handleSignedIn(User user) {
    final phone = (user.phoneNumber ?? '').trim();

    if (phone.isEmpty) {
      // Google-only user without phone → onboarding collects phone & basics
      return const OnboardingScreen();
    }

    return FutureBuilder<DocumentSnapshot>(
      future: FirebaseFirestore.instance.collection('users').doc(phone).get(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snap.hasError) {
          return Scaffold(
            body: Center(child: Text('Error: ${snap.error}')),
          );
        }

        final exists = snap.data?.exists == true;
        final data = (snap.data?.data() as Map<String, dynamic>?) ?? {};
        final onboarded = data['onboarded'] == true;

        if (!exists || !onboarded) {
          return const OnboardingScreen();
        }
        return MainNavScreen(userPhone: phone);
      },
    );
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snap) {
        final user = snap.data;

        if (snap.connectionState == ConnectionState.waiting || _loading) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (user != null) {
          // User signed-in → route based on profile state
          return _handleSignedIn(user);
        }

        // Not signed-in → Auth UI
        return Scaffold(
          body: Center(
            child: SingleChildScrollView(
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
                          backgroundColor:
                          Theme.of(context).colorScheme.primary,
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
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: _verifyOTP,
                            style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 15),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                              backgroundColor:
                              Theme.of(context).colorScheme.primary,
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
                        const SizedBox(width: 12),
                        TextButton(
                          onPressed: _sendOTP,
                          child: const Text("Resend"),
                        ),
                      ],
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
                          backgroundColor:
                          Theme.of(context).colorScheme.primary,
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
                      icon: Image.asset(
                        'assets/icons/google_icon.png',
                        height: 24,
                        width: 24,
                      ),
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
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.red, fontSize: 15),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }
}
