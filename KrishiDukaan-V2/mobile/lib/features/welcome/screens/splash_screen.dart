import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/widgets/app_brand_icon.dart';

/// Pref key marking that the user has already seen the first-install welcome
/// pages. Shared with WelcomeScreen.
const kWelcomeSeenPref = 'welcome_seen_v1';

/// Animated launch screen shown on every app open. Plays the brand animation
/// for ~2s, then routes to /welcome on first install or home otherwise.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _intro;   // one-shot entrance
  late final AnimationController _ripple;  // looping ripple rings

  @override
  void initState() {
    super.initState();
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
    // Hold the animation ~2s, resolving the first-install flag meanwhile.
    final results = await Future.wait([
      SharedPreferences.getInstance(),
      Future.delayed(const Duration(milliseconds: 2000)),
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

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.primary,
              Color.lerp(AppColors.primary, Colors.black, 0.25)!,
            ],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo with expanding ripple rings behind it
                SizedBox(
                  width: 220,
                  height: 220,
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
                        child: const AppBrandIcon(size: 104, elevated: true),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
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
                          'KrishiDukaan',
                          style: AppTextStyles.heading1.copyWith(
                            color: Colors.white,
                            fontSize: 30,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Everything your farm needs',
                          style: AppTextStyles.body.copyWith(
                            color: Colors.white.withValues(alpha: 0.85),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            // Subtle loading indicator pinned near the bottom
            Positioned(
              bottom: 48,
              child: FadeTransition(
                opacity: textFade,
                child: const SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    valueColor: AlwaysStoppedAnimation(Colors.white70),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// One expanding, fading ring. [t] runs 0→1.
  Widget _rippleRing(double t) {
    final size = 110 + t * 110;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: Colors.white.withValues(alpha: (1 - t) * 0.35),
          width: 2,
        ),
      ),
    );
  }
}
