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

  User? _googleUser; // temporarily hold google signed-in user

  // --- GOOGLE SIGN IN ---
  Future<void> _signInWithGoogle() async {
    setState(() => _loading = true);
    try {
      final googleUser = await GoogleSignIn().signIn();
      if (googleUser == null) throw Exception('Cancelled');
      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      final userCredential = await FirebaseAuth.instance.signInWithCredential(credential);
      _googleUser = userCredential.user;

      // If phone is missing, ask for it
      if ((_googleUser?.phoneNumber ?? '').isEmpty) {
        setState(() {
          _stage = AuthStage.phoneAfterGoogle;
          _loading = false;
        });
      } else {
        await _saveUserToFirestore(_googleUser!, _googleUser!.phoneNumber!);
      }
    } catch (e) {
      setState(() => _error = "Google sign in failed. Try again.");
    }
    setState(() => _loading = false);
  }

  // --- PHONE AUTH ---
  Future<void> _sendOTP() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final phone = _fullPhoneNumber;
      if (phone == null || phone.length < 10 || !phone.startsWith("+")) {
        setState(() {
          _error = "Please enter a valid phone number.";
          _loading = false;
        });
        return;
      }
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: phone,
        verificationCompleted: (PhoneAuthCredential credential) async {
          final userCredential = await FirebaseAuth.instance.signInWithCredential(credential);
          await _saveUserToFirestore(userCredential.user!, phone);
        },
        verificationFailed: (e) {
          setState(() {
            _error = e.message ?? "Verification failed";
            _loading = false;
          });
        },
        codeSent: (String verificationId, int? resendToken) {
          setState(() {
            _verificationId = verificationId;
            _stage = AuthStage.otpInput;
            _loading = false;
          });
        },
        codeAutoRetrievalTimeout: (String verificationId) {},
        timeout: const Duration(seconds: 60),
      );
    } catch (e) {
      setState(() {
        _error = "Failed to send OTP. Try again.";
        _loading = false;
      });
    }
  }

  Future<void> _verifyOTP() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final smsCode = _otpController.text.trim();
      final credential = PhoneAuthProvider.credential(
        verificationId: _verificationId!,
        smsCode: smsCode,
      );
      final userCredential = await FirebaseAuth.instance.signInWithCredential(credential);
      await _saveUserToFirestore(userCredential.user!, _fullPhoneNumber!);
    } catch (e) {
      setState(() {
        _error = "Invalid OTP. Please try again.";
        _loading = false;
      });
    }
  }

  // --- Save user in Firestore using phone as docId & route correctly ---
  Future<void> _saveUserToFirestore(User user, String phone) async {
    if (phone.isEmpty) {
      // No phone? Send to onboarding to collect it.
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      );
      return;
    }

    final docRef = FirebaseFirestore.instance.collection('users').doc(phone);
    final existing = await docRef.get();

    if (!existing.exists) {
      await docRef.set({
        'onboarded': false,
        'email': user.email ?? '',
        'phone': phone,
        'avatar': user.photoURL ?? '',
        'createdAt': FieldValue.serverTimestamp(),
      });
    }

    final latest = await docRef.get();
    final isOnboarded = (latest.data()?['onboarded'] == true);

    if (!mounted) return;
    if (isOnboarded) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: phone)),
      );
    } else {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      );
    }
  }

  // --- After Google sign in, save phone ---
  void _savePhoneAfterGoogle() async {
    final phone = _fullPhoneNumber ?? '';
    if (phone.isEmpty || !phone.startsWith("+")) {
      setState(() => _error = "Please enter a valid phone number.");
      return;
    }
    if (_googleUser == null) {
      setState(() => _error = "Google session expired. Please try again.");
      return;
    }
    await _saveUserToFirestore(_googleUser!, phone);
  }

  // --- LOGGED IN LOGIC ---
  Widget _handleUser(User user) {
    final phone = (user.phoneNumber ?? '').trim();

    // If no phone yet (e.g., Google-only), go straight to onboarding.
    if (phone.isEmpty) {
      return const OnboardingScreen();
    }

    // If phone exists, check Firestore doc(phone)
    return FutureBuilder<DocumentSnapshot>(
      future: FirebaseFirestore.instance.collection('users').doc(phone).get(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (snap.hasError) {
          return Scaffold(body: Center(child: Text('Error: ${snap.error}')));
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

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;

        if (snapshot.connectionState == ConnectionState.waiting || _loading) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (user != null) {
          return _handleUser(user);
        }

        // --- AUTH UI ---
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
                        onChanged: (phone) {
                          _fullPhoneNumber = phone.completeNumber;
                        },
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
                        onChanged: (phone) {
                          _fullPhoneNumber = phone.completeNumber;
                        },
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
                          side: BorderSide(color: Theme.of(context).colorScheme.primary, width: 1.2),
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
                        style: const TextStyle(color: Colors.red, fontSize: 15),
                      ),
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
}
