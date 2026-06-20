import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/widgets/app_brand_icon.dart';

const kWelcomeSeenPref = 'welcome_seen_v1';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _intro;
  late final AnimationController _ripple;

  @override
  void initState() {
    super.initState();
    // Go fully edge-to-edge so the gradient bleeds under status & nav bars.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));

    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..forward();
    _ripple = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();
    _navigateAfterDelay();
  }

  Future<void> _navigateAfterDelay() async {
    final results = await Future.wait([
      SharedPreferences.getInstance(),
      Future.delayed(const Duration(milliseconds: 2200)),
    ]);
    final prefs = results.first as SharedPreferences;
    if (!mounted) return;
    final seenWelcome = prefs.getBool(kWelcomeSeenPref) ?? false;
    context.go(seenWelcome ? '/' : '/welcome');
  }

  @override
  void dispose() {
    _intro.dispose();
    _ripple.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final logoScale = CurvedAnimation(parent: _intro, curve: Curves.elasticOut);
    final textFade = CurvedAnimation(
      parent: _intro,
      curve: const Interval(0.35, 1, curve: Curves.easeOut),
    );
    final bottomPad = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      extendBody: true,
      extendBodyBehindAppBar: true,
      backgroundColor: AppColors.primary,
      body: Container(
        // Explicit fill — without this the Container shrinks to its child
        // when placed inside a Stack, causing the half-screen bug.
        width: double.infinity,
        height: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.primary,
              Color.lerp(AppColors.primary, const Color(0xFF0D1B0A), 0.55)!,
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          // StackFit.expand forces the Stack to fill the Container instead of
          // shrink-wrapping its non-positioned children.
          fit: StackFit.expand,
          children: [
            // ── Decorative background circles ────────────────────────────
            Positioned(
              top: -80,
              right: -60,
              child: _bgCircle(280, Colors.white.withValues(alpha: 0.04)),
            ),
            Positioned(
              bottom: -60,
              left: -80,
              child: _bgCircle(240, Colors.white.withValues(alpha: 0.04)),
            ),

            // ── Centre: logo + ripple + text ─────────────────────────────
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 240,
                  height: 240,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      AnimatedBuilder(
                        animation: _ripple,
                        builder: (_, _) => Stack(
                          alignment: Alignment.center,
                          children: [
                            _rippleRing(_ripple.value),
                            _rippleRing((_ripple.value + 0.5) % 1.0),
                          ],
                        ),
                      ),
                      ScaleTransition(
                        scale: logoScale,
                        child: const AppBrandIcon(size: 108, elevated: true),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                FadeTransition(
                  opacity: textFade,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.4),
                      end: Offset.zero,
                    ).animate(textFade),
                    child: Column(
                      children: [
                        Text(
                          'KrishiDukan',
                          style: AppTextStyles.heading1.copyWith(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Everything your farm needs',
                          style: AppTextStyles.body.copyWith(
                            color: Colors.white.withValues(alpha: 0.78),
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            // ── Bottom: spinner + brand tag ──────────────────────────────
            Positioned(
              bottom: bottomPad + 44,
              left: 0,
              right: 0,
              child: FadeTransition(
                opacity: textFade,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor:
                            AlwaysStoppedAnimation(Colors.white60),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'from Fiinny',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.38),
                        fontSize: 11,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _rippleRing(double t) {
    final size = 116 + t * 120;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: Colors.white.withValues(alpha: (1 - t) * 0.30),
          width: 1.8,
        ),
      ),
    );
  }

  Widget _bgCircle(double size, Color color) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}
