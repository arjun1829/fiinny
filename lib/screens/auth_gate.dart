import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl_phone_field/intl_phone_field.dart';

import 'main_nav_screen.dart';
import 'onboarding_screen.dart';

enum AuthStage { phoneInput, otpInput, loading }

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

  // ------- Brand colors (MATCH welcome_screen.dart) -------
  static const Color kMintBase = Color(0xFF21B9A3); // lighter
  static const Color kMintDeep = Color(0xFF159E8A); // darker (primary for Auth)
  Color _tint(double amt) => Color.lerp(kMintDeep, Colors.white, amt)!;

  // ------- Responsive spacing helpers -------
  double _scale(BuildContext c) {
    final h = MediaQuery.sizeOf(c).height;
    if (h < 660) return .85;
    if (h < 760) return .92;
    return 1.0;
  }
  SizedBox _gap(BuildContext c, double base) => SizedBox(height: base * _scale(c));

  // --- PHONE AUTH (unchanged) ---
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

  // --- Save user & route (unchanged) ---
  Future<void> _saveUserToFirestore(User user, String phone) async {
    if (phone.isEmpty) {
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

  // --- Logged in handling (unchanged) ---
  Widget _handleUser(User user) {
    final phone = (user.phoneNumber ?? '').trim();
    if (phone.isEmpty) return const OnboardingScreen();

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

        if (!exists || !onboarded) return const OnboardingScreen();
        return MainNavScreen(userPhone: phone);
      },
    );
  }

  // ---------- tiny animation widgets ----------
  Widget _fiinnyHero(BuildContext c) => _FiinnyHero(
    ringColor: kMintDeep,
    glowColor: _tint(.35),
    logoAsset: 'assets/icons/ic_goal.png',
    scale: _scale(c),
  );

  // ---------- UI BUILDERS ----------
  Widget _header(BuildContext context, {required String subtitle, required int step, required int of}) {
    final s = _scale(context);
    return Column(
      children: [
        _gap(context, 6),
        _fiinnyHero(context),
        _gap(context, 6),
        Text(
          "Welcome to Fiinny",
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Montserrat',
            fontSize: 26 * s,
            fontWeight: FontWeight.w800,
            color: kMintDeep, // darker mint title to match welcome screen
            letterSpacing: .5,
          ),
        ),
        _gap(context, 6),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Montserrat',
            fontSize: 14.5 * s,
            color: Colors.black87,
          ),
        ),
        _gap(context, 8),

      ],
    );
  }

  Widget _glassCard({required Widget child}) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(.82),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: Colors.black12.withOpacity(.06)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(.05),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(BuildContext context, String label, {Widget? prefixIcon}) {
    return InputDecoration(
      labelText: label,
      filled: true,
      fillColor: Colors.white,
      prefixIcon: prefixIcon,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.black12.withOpacity(.25)),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
        borderSide: BorderSide(color: kMintDeep, width: 1.6),
      ),
    );
  }

  Widget _primaryButton(BuildContext context, {required String label, required VoidCallback onPressed}) {
    final s = _scale(context);
    double scale = 1;
    return SizedBox(
      width: double.infinity,
      child: StatefulBuilder(
        builder: (context, setSt) {
          return GestureDetector(
            onTapDown: (_) => setSt(() => scale = .98),
            onTapCancel: () => setSt(() => scale = 1),
            onTapUp: (_) => setSt(() => scale = 1),
            child: AnimatedScale(
              scale: scale,
              duration: const Duration(milliseconds: 90),
              child: ElevatedButton(
                onPressed: onPressed,
                style: ElevatedButton.styleFrom(
                  minimumSize: Size.fromHeight(52 * s),
                  backgroundColor: kMintDeep,     // darker mint
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                  textStyle: TextStyle(
                    fontFamily: 'Montserrat',
                    fontSize: 18 * s,
                    fontWeight: FontWeight.w700,
                    letterSpacing: .2,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (label.toLowerCase().contains("verify"))
                      Icon(Icons.verified_rounded, size: 20 * s),
                    if (label.toLowerCase().contains("verify"))
                      SizedBox(width: 8 * s),
                    Text(label),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ----- Stage sections -----
  Widget _phoneSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _header(context, subtitle: "Sign in with your phone number", step: 1, of: 2),
        _gap(context, 16),
        _glassCard(
          child: Column(
            children: [
              IntlPhoneField(
                controller: _phoneController,
                initialCountryCode: 'IN',
                decoration: _inputDecoration(context, 'Phone Number', prefixIcon: const Icon(Icons.phone_outlined)),
                onChanged: (phone) => _fullPhoneNumber = phone.completeNumber,
              ),
              _gap(context, 12),
              _primaryButton(context, label: "Continue", onPressed: _sendOTP),
            ],
          ),
        ),
      ],
    );
  }

  Widget _otpSection(BuildContext context) {
    final s = _scale(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _header(context, subtitle: "Enter the OTP sent to your phone", step: 2, of: 2),
        _gap(context, 16),
        _glassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Shake(
                triggerKey: _error, // shakes when error text changes
                child: TextField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 22 * s, letterSpacing: 3, fontFamily: 'Montserrat'),
                  decoration: _inputDecoration(context, "6-digit OTP"),
                ),
              ),
              _gap(context, 8),
              const Text(
                "We’ll auto-fill if possible on this device.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12.5, color: Colors.black54, fontFamily: 'Montserrat'),
              ),
              _gap(context, 14),
              _primaryButton(context, label: "Verify & Sign In", onPressed: _verifyOTP),
              _gap(context, 8),
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  TextButton(
                    onPressed: () => setState(() => _stage = AuthStage.phoneInput),
                    child: const Text("Change number"),
                  ),
                  const SizedBox(width: 6),
                  const Text("•"),
                  const SizedBox(width: 6),
                  TextButton(
                    onPressed: _sendOTP, // re-use same logic; no timer added
                    child: const Text("Resend OTP"),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ---------- MAIN BUILD ----------
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;

        // live overlay loader (glass blur)
        final overlayLoader = _loading || snapshot.connectionState == ConnectionState.waiting
            ? Positioned.fill(
          child: ClipRRect(
            borderRadius: BorderRadius.zero,
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
              child: Container(
                color: Colors.white.withOpacity(.55),
                child: const Center(child: CircularProgressIndicator()),
              ),
            ),
          ),
        )
            : const SizedBox.shrink();

        if (user != null) {
          return _handleUser(user);
        }

        // --- AUTH UI ---
        return Scaffold(
          backgroundColor: const Color(0xFFF7FAFB),
          resizeToAvoidBottomInset: true,
          body: SafeArea(
            child: Stack(
              children: [
                Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 560),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 250),
                            child: () {
                              switch (_stage) {
                                case AuthStage.phoneInput:
                                  return _phoneSection(context);
                                case AuthStage.otpInput:
                                  return _otpSection(context);
                                case AuthStage.loading:
                                  return const SizedBox.shrink();
                              }
                            }(),
                          ),
                          if (_error != null) ...[
                            _gap(context, 20),
                            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 14)),
                          ],
                          _gap(context, 14),
                          Text(
                            "By continuing you agree to our Terms & Privacy Policy.",
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontFamily: 'Montserrat',
                              fontSize: 12.5 * _scale(context),
                              color: Colors.black.withOpacity(0.55),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                overlayLoader,
              ],
            ),
          ),
        );
      },
    );
  }
}

// -------------------- animated hero with logo inside the ring --------------------
class _FiinnyHero extends StatefulWidget {
  final Color ringColor;
  final Color glowColor;
  final String logoAsset;
  final double scale;
  const _FiinnyHero({
    required this.ringColor,
    required this.glowColor,
    required this.logoAsset,
    required this.scale,
  });

  @override
  State<_FiinnyHero> createState() => _FiinnyHeroState();
}

class _FiinnyHeroState extends State<_FiinnyHero> with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(vsync: this, duration: const Duration(seconds: 8))..repeat();
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.scale;
    final ring = widget.ringColor;
    final glow = widget.glowColor;

    final double ringSize = 120 * s;
    final double glowSize = 160 * s;
    final double logoSize = 56 * s;

    return SizedBox(
      height: (120 * s).clamp(96, 140),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // soft glow
          Container(
            width: glowSize,
            height: glowSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: glow.withOpacity(.45), blurRadius: 70, spreadRadius: 8)],
            ),
          ),
          // rotating sweep ring
          RotationTransition(
            turns: _ctl,
            child: Container(
              width: ringSize, height: ringSize,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: SweepGradient(
                  colors: [ring, ring.withOpacity(0), ring.withOpacity(0), ring],
                  stops: const [0.0, 0.55, 0.85, 1.0],
                ),
              ),
              child: Padding(
                padding: EdgeInsets.all(10 * s),
                child: Container(
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                ),
              ),
            ),
          ),
          // centered logo
          Image.asset(
            widget.logoAsset,
            width: logoSize,
            height: logoSize,
            fit: BoxFit.contain,
          ),
        ],
      ),
    );
  }
}

// -------------------- shake wrapper for OTP errors --------------------
class _Shake extends StatefulWidget {
  final Widget child;
  final String? triggerKey; // pass _error to shake when text changes
  const _Shake({required this.child, required this.triggerKey});

  @override
  State<_Shake> createState() => _ShakeState();
}

class _ShakeState extends State<_Shake> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
  AnimationController(vsync: this, duration: const Duration(milliseconds: 350));
  late final Animation<double> _a = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 0, end: -10), weight: 1),
    TweenSequenceItem(tween: Tween(begin: -10, end: 10), weight: 2),
    TweenSequenceItem(tween: Tween(begin: 10, end: 0), weight: 1),
  ]).animate(CurvedAnimation(parent: _c, curve: Curves.easeOut));

  @override
  void didUpdateWidget(covariant _Shake oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.triggerKey != widget.triggerKey && widget.triggerKey != null) {
      _c.forward(from: 0);
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    builder: (_, child) => Transform.translate(offset: Offset(_a.value, 0), child: child),
    child: widget.child,
  );
}
