import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/widgets/app_brand_icon.dart';
import 'splash_screen.dart' show kWelcomeSeenPref;

/// Items orbiting the brand logo: colourful produce emoji plus the two agri
/// inputs this app is really about — seeds (बीज) and a fertilizer / input
/// product (खाद) — shown as real product photos. They're interleaved with the
/// fruit so the two product badges sit apart on the ring.
final _ringItems = <Widget>[
  const Text('🌾', style: TextStyle(fontSize: 24)),
  _ringImage('assets/images/welcome_seeds.png', Icons.grain,
      AppColors.secondary), // seeds (बीज)
  const Text('🍅', style: TextStyle(fontSize: 24)),
  const Text('🌽', style: TextStyle(fontSize: 24)),
  _ringImage('assets/images/welcome_fertilizer.png', Icons.science,
      AppColors.primary), // fertilizer / input product (खाद)
  const Text('🍇', style: TextStyle(fontSize: 24)),
  const Text('🍎', style: TextStyle(fontSize: 24)),
  const Text('🌱', style: TextStyle(fontSize: 24)),
];

/// A round product photo for the orbit ring, clipped to a circle. Falls back to
/// a Material icon if the asset can't be loaded, so a missing image never
/// blanks out the welcome screen. [cacheWidth] keeps decode memory tiny (the
/// chip is only 46px) even when the source PNG is large.
Widget _ringImage(String asset, IconData fallback, Color fallbackColor) {
  return ClipOval(
    child: Image.asset(
      asset,
      width: 40,
      height: 40,
      fit: BoxFit.cover,
      cacheWidth: 120,
      errorBuilder: (_, _, _) =>
          Icon(fallback, size: 24, color: fallbackColor),
    ),
  );
}

/// Emoji drifting up the background of the brand hero.
const _fruitDrift = ['🍃', '🌶️', '🥦', '💧', '🍊', '🌻'];

/// First-install welcome screen. A single animated KrishiDukan brand hero with
/// an orbiting ring of fruit icons — warm and lively for our farmer / village
/// audience — followed by a "Get Started" CTA into the login / onboarding flow.
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  @override
  void initState() {
    super.initState();
    // Edge-to-edge so the art bleeds under the status & nav bars; light icons
    // because the background is always dark.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));
  }

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kWelcomeSeenPref, true);
    if (!mounted) return;
    context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: AppColors.primaryDark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Animated KrishiDukan brand hero (single welcome page) ─────
          const _BrandHero(active: true),

          // ── Readability scrim so the bottom CTA stays legible ─────────
          IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [0.0, 0.45, 1.0],
                  colors: [
                    Colors.transparent,
                    AppColors.primaryDark.withValues(alpha: 0.35),
                    AppColors.primaryDark.withValues(alpha: 0.96),
                  ],
                ),
              ),
            ),
          ),

          // ── Bottom CTA → continue to login / onboarding ───────────────
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Padding(
              padding: EdgeInsets.fromLTRB(28, 0, 28, bottomPad + 26),
              child: SizedBox(
                width: double.infinity,
                height: 58,
                child: FilledButton(
                  onPressed: _finish,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.secondary,
                    foregroundColor: AppColors.onSecondary,
                    elevation: 6,
                    shadowColor: Colors.black54,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Get Started',
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.onSecondary,
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Icon(Icons.arrow_forward_rounded, size: 20),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Page 1: animated KrishiDukan brand hero ────────────────────────────────

class _BrandHero extends StatefulWidget {
  final bool active;
  const _BrandHero({required this.active});

  @override
  State<_BrandHero> createState() => _BrandHeroState();
}

class _BrandHeroState extends State<_BrandHero> with TickerProviderStateMixin {
  late final AnimationController _intro; // logo + text reveal
  late final AnimationController _ripple; // expanding rings
  late final AnimationController _orbit; // fruit ring rotation
  late final AnimationController _drift; // background fruit drift
  late final AnimationController _scene; // farm scene: crops, birds, motes

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..forward();
    _ripple = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    _orbit = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 22),
    )..repeat();
    _drift = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 9),
    )..repeat();
    _scene = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 18),
    )..repeat();
  }

  @override
  void dispose() {
    _intro.dispose();
    _ripple.dispose();
    _orbit.dispose();
    _drift.dispose();
    _scene.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final logoScale = CurvedAnimation(parent: _intro, curve: Curves.elasticOut);
    final textReveal = CurvedAnimation(
      parent: _intro,
      curve: const Interval(0.4, 1, curve: Curves.easeOut),
    );
    final size = MediaQuery.sizeOf(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primary,
            Color.lerp(AppColors.primary, const Color(0xFF0D1B0A), 0.6)!,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // ── Animated farm scene: a rising sun, rolling fields, swaying
          //    crops (wheat + young sprouts), gliding birds and drifting
          //    pollen — all painted, no image assets. Sits behind the logo
          //    so the sun reads as a warm halo around the brand. ──────────
          Positioned.fill(
            child: AnimatedBuilder(
              animation: Listenable.merge([_scene, _orbit]),
              builder: (context, _) => CustomPaint(
                size: Size.infinite,
                painter: _FarmScenePainter(t: _scene.value, spin: _orbit.value),
              ),
            ),
          ),

          // Soft decorative blobs
          Positioned(
            top: -80,
            right: -70,
            child: _blob(280, Colors.white.withValues(alpha: 0.05)),
          ),
          Positioned(
            bottom: 40,
            left: -90,
            child: _blob(240, AppColors.secondary.withValues(alpha: 0.06)),
          ),

          // Drifting background fruit
          AnimatedBuilder(
            animation: _drift,
            builder: (context, _) => Stack(
              children: [
                for (var i = 0; i < _fruitDrift.length; i++)
                  _driftFruit(i, size),
              ],
            ),
          ),

          // Centre cluster, lifted above the bottom CTA
          Padding(
            padding: EdgeInsets.only(bottom: size.height * 0.16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 290,
                  height: 290,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Ripple rings
                      AnimatedBuilder(
                        animation: _ripple,
                        builder: (_, _) => Stack(
                          alignment: Alignment.center,
                          children: [
                            _ring(_ripple.value),
                            _ring((_ripple.value + 0.5) % 1.0),
                          ],
                        ),
                      ),
                      // Orbiting fruit ring
                      AnimatedBuilder(
                        animation: _orbit,
                        builder: (_, _) => _orbitRing(_orbit.value),
                      ),
                      // Logo
                      ScaleTransition(
                        scale: logoScale,
                        child: const AppBrandIcon(size: 116, elevated: true),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 26),
                // Wordmark + bilingual tagline
                FadeTransition(
                  opacity: textReveal,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.4),
                      end: Offset.zero,
                    ).animate(textReveal),
                    child: Column(
                      children: [
                        Text(
                          'KrishiDukan',
                          style: AppTextStyles.displayLarge.copyWith(
                            color: Colors.white,
                            fontSize: 34,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                            shadows: const [
                              Shadow(color: Colors.black38, blurRadius: 10),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'आपके खेत की हर ज़रूरत, एक ऐप में',
                          textAlign: TextAlign.center,
                          style: AppTextStyles.heading3.copyWith(
                            color: AppColors.secondaryContainer,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Everything your farm needs',
                          style: AppTextStyles.body.copyWith(
                            color: Colors.white.withValues(alpha: 0.78),
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Eight items (produce + seeds + fertilizer) evenly spaced on a circle, the
  /// whole ring rotating, each chip bobbing gently to stay lively.
  Widget _orbitRing(double t) {
    const radius = 120.0;
    final rot = t * 2 * math.pi;
    return Stack(
      alignment: Alignment.center,
      children: [
        for (var i = 0; i < _ringItems.length; i++)
          Builder(builder: (_) {
            final angle = rot + (i / _ringItems.length) * 2 * math.pi;
            final bob = math.sin(rot * 2 + i) * 5;
            return Transform.translate(
              offset: Offset(
                radius * math.cos(angle),
                radius * math.sin(angle) + bob,
              ),
              child: _ringChip(_ringItems[i]),
            );
          }),
      ],
    );
  }

  Widget _ringChip(Widget child) {
    return Container(
      width: 46,
      height: 46,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _driftFruit(int i, Size size) {
    // Each fruit rises from below to above, looping, with a per-item phase.
    final phase = (_drift.value + i / _fruitDrift.length) % 1.0;
    final x = (i + 1) / (_fruitDrift.length + 1) * size.width;
    final y = size.height * (1.05 - phase * 1.15);
    final wobble = math.sin(phase * 2 * math.pi + i) * 14;
    return Positioned(
      left: x + wobble - 16,
      top: y,
      child: Opacity(
        opacity: (math.sin(phase * math.pi)).clamp(0.0, 1.0) * 0.16,
        child: Text(
          _fruitDrift[i],
          style: TextStyle(fontSize: 26 + (i % 3) * 8),
        ),
      ),
    );
  }

  Widget _ring(double t) {
    final s = 130 + t * 140;
    return Container(
      width: s,
      height: s,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: Colors.white.withValues(alpha: (1 - t) * 0.28),
          width: 1.6,
        ),
      ),
    );
  }

  Widget _blob(double s, Color c) => Container(
        width: s,
        height: s,
        decoration: BoxDecoration(shape: BoxShape.circle, color: c),
      );
}

// ─── Painted "sunrise over the fields" scene for the brand hero ──────────────
//
// Everything here is drawn with the canvas (cheap vector ops, no assets) so it
// stays smooth on the budget Android phones our farmers use. Two animation
// values drive it:
//   • [t]    — ambient phase (0..1) for crop sway, bird glide, mote twinkle and
//              the sun's gentle breathing pulse.
//   • [spin] — slow rotation phase (0..1) for the sun rays, reused from the
//              orbiting-fruit controller.
class _FarmScenePainter extends CustomPainter {
  final double t;
  final double spin;

  const _FarmScenePainter({required this.t, required this.spin});

  static const _tau = 2 * math.pi;

  @override
  void paint(Canvas canvas, Size size) {
    _paintSun(canvas, size);
    _paintHill(canvas, size, _farHillY, // distant ridge
        Color.lerp(AppColors.primary, Colors.black, 0.30)!.withValues(alpha: 0.7));
    _paintHill(canvas, size, _nearHillY, // foreground field
        Color.lerp(AppColors.primaryDark, Colors.black, 0.42)!.withValues(alpha: 0.95));
    _paintCrops(canvas, size);
    _paintBirds(canvas, size);
    _paintMotes(canvas, size);
  }

  // ── Sun: a soft radial glow, a bright core and slowly rotating rays ───────
  void _paintSun(Canvas canvas, Size size) {
    final center = Offset(size.width * 0.5, size.height * 0.30);
    final pulse = 0.5 + 0.5 * math.sin(t * _tau); // 0..1 breathe
    final glowR = size.width * (0.34 + 0.03 * pulse);

    canvas.drawCircle(
      center,
      glowR,
      Paint()
        ..shader = RadialGradient(
          colors: [
            AppColors.secondary.withValues(alpha: 0.22),
            AppColors.secondary.withValues(alpha: 0.06),
            AppColors.secondary.withValues(alpha: 0.0),
          ],
          stops: const [0.0, 0.5, 1.0],
        ).createShader(Rect.fromCircle(center: center, radius: glowR)),
    );

    // Rotating rays — faint warm spokes that shimmer in length.
    final rayPaint = Paint()
      ..color = AppColors.secondaryContainer.withValues(alpha: 0.12)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    const rays = 12;
    final base = spin * _tau;
    final inner = size.width * 0.105;
    for (var i = 0; i < rays; i++) {
      final a = base + i / rays * _tau;
      final outer = size.width * (0.18 + 0.05 * math.sin(t * _tau * 2 + i));
      final dir = Offset(math.cos(a), math.sin(a));
      canvas.drawLine(center + dir * inner, center + dir * outer, rayPaint);
    }

    // Bright sun core.
    final coreR = size.width * 0.085;
    canvas.drawCircle(
      center,
      coreR,
      Paint()
        ..shader = RadialGradient(
          colors: [
            Colors.white.withValues(alpha: 0.55),
            AppColors.secondary.withValues(alpha: 0.35),
            AppColors.secondary.withValues(alpha: 0.0),
          ],
          stops: const [0.0, 0.55, 1.0],
        ).createShader(Rect.fromCircle(center: center, radius: coreR)),
    );
  }

  // ── Rolling hills ─────────────────────────────────────────────────────────
  double _farHillY(double x, Size size) =>
      size.height * 0.60 -
      math.sin(x / size.width * math.pi * 0.8 + 0.6) * size.height * 0.03;

  double _nearHillY(double x, Size size) =>
      size.height * 0.66 -
      math.sin(x / size.width * math.pi) * size.height * 0.015 -
      math.cos(x / size.width * math.pi * 2.3) * size.height * 0.012;

  void _paintHill(
      Canvas canvas, Size size, double Function(double, Size) yAt, Color color) {
    final path = Path()..moveTo(0, size.height);
    final step = size.width / 24;
    path.lineTo(0, yAt(0, size));
    for (var x = 0.0; x <= size.width; x += step) {
      path.lineTo(x, yAt(x, size));
    }
    path
      ..lineTo(size.width, yAt(size.width, size))
      ..lineTo(size.width, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  // ── Swaying crops along the foreground field: wheat + young sprouts ───────
  void _paintCrops(Canvas canvas, Size size) {
    const n = 22;
    final stalkPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = Color.lerp(AppColors.primaryDark, Colors.black, 0.55)!;
    final wheatHead = Paint()..color = AppColors.secondary.withValues(alpha: 0.7);
    final leafPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..color = AppColors.primaryLight.withValues(alpha: 0.85);

    for (var i = 0; i < n; i++) {
      final x = (i + 0.5) / n * size.width;
      final baseY = _nearHillY(x, size) + 2;
      final h = size.height * (0.045 + (i % 3) * 0.013);
      final sway = math.sin(t * _tau * 7 + i * 0.9) * h * 0.22;
      final tip = Offset(x + sway, baseY - h);
      final ctrl = Offset(x + sway * 0.5, baseY - h * 0.5);

      canvas.drawPath(
        Path()
          ..moveTo(x, baseY)
          ..quadraticBezierTo(ctrl.dx, ctrl.dy, tip.dx, tip.dy),
        stalkPaint,
      );

      if (i.isEven) {
        // Wheat: amber grain head with a couple of bristles catching the sun.
        canvas.drawCircle(tip, 2.6, wheatHead);
        canvas.drawLine(tip, tip + Offset(sway * 0.2 - 3, -5), wheatHead);
        canvas.drawLine(tip, tip + Offset(sway * 0.2 + 3, -5), wheatHead);
      } else {
        // Young sprout: two small green leaves opening from the tip.
        canvas.drawPath(
          Path()
            ..moveTo(tip.dx, tip.dy)
            ..quadraticBezierTo(tip.dx - 6, tip.dy - 2, tip.dx - 4, tip.dy - 7),
          leafPaint,
        );
        canvas.drawPath(
          Path()
            ..moveTo(tip.dx, tip.dy)
            ..quadraticBezierTo(tip.dx + 6, tip.dy - 2, tip.dx + 4, tip.dy - 7),
          leafPaint,
        );
      }
    }
  }

  // ── A few birds gliding across the upper sky ─────────────────────────────
  void _paintBirds(Canvas canvas, Size size) {
    const n = 3;
    for (var k = 0; k < n; k++) {
      final phase = (t * 0.8 + k * 0.33) % 1.0;
      final op = (math.sin(phase * math.pi)).clamp(0.0, 1.0) * 0.45;
      if (op <= 0.01) continue;
      final x = phase * (size.width + 140) - 70;
      final y = size.height * (0.19 + 0.05 * k) +
          math.sin(phase * _tau * (2 + k)) * size.height * 0.01;
      final s = 7.0 + k * 1.5;
      final flap = 0.4 + 0.6 * (0.5 + 0.5 * math.sin(t * _tau * 9 + k));
      final wing = -s * 0.5 * flap;
      canvas.drawPath(
        Path()
          ..moveTo(x - s, y)
          ..quadraticBezierTo(x - s * 0.4, y + wing, x, y)
          ..quadraticBezierTo(x + s * 0.4, y + wing, x + s, y),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round
          ..color = Colors.white.withValues(alpha: op),
      );
    }
  }

  // ── Pollen / light motes drifting in the warm air near the sun ───────────
  void _paintMotes(Canvas canvas, Size size) {
    const n = 8;
    for (var i = 0; i < n; i++) {
      final phase = (t + i * 0.13) % 1.0;
      final x = size.width * ((i + 0.5) / n) +
          math.sin(phase * _tau + i) * size.width * 0.04;
      final y = size.height * 0.42 +
          math.cos(phase * _tau * 1.3 + i) * size.height * 0.10;
      final r = 1.4 + (i % 3) * 0.9;
      final op =
          (0.22 + 0.22 * math.sin(phase * _tau * 2 + i)).clamp(0.0, 0.5);
      final c = AppColors.secondaryContainer;
      canvas.drawCircle(Offset(x, y), r * 2.4, Paint()..color = c.withValues(alpha: op * 0.25));
      canvas.drawCircle(Offset(x, y), r, Paint()..color = c.withValues(alpha: op));
    }
  }

  @override
  bool shouldRepaint(_FarmScenePainter old) => old.t != t || old.spin != spin;
}
