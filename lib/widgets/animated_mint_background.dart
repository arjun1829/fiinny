import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart';

/// Soft mint radial background.
/// - In **lowGpuMode** it renders as a static gradient (no rebuilds).
/// - Otherwise, it animates the outer stop once on mount.
class AnimatedMintBackground extends StatelessWidget {
  final bool? animate; // override; null -> respect AppPerf.lowGpuMode
  final double intensity; // 0..1, affects center opacity
  final Widget? child;

  const AnimatedMintBackground({
    super.key,
    this.animate,
    this.intensity = 1.0,
    this.child,
  });

  @override
  Widget build(BuildContext context) {
    final shouldAnimate = (animate ?? !AppPerf.lowGpuMode);

    final c0 = Colors.tealAccent.withValues(alpha: 0.18 * intensity);
    final c1 = AppColors.mint.withValues(alpha: 0.10 * intensity);
    final c2 = Colors.white.withValues(alpha: 0.65);

    const coverageStop = 0.60; // mint wash should span ~60% of the viewport
    const entryOvershoot = 0.03; // subtle breathing room during the intro tween
    const radius =
        1.35; // larger radius so the radial wash reaches further down

    DecoratedBox decorated(double midStop) {
      final effectiveStop = midStop.clamp(0.0, 1.0).toDouble();

      return DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            colors: [c0, c1, c2],
            radius: radius,
            center: Alignment.topLeft,
            stops: [0.0, effectiveStop, 1.0],
          ),
        ), // Close BoxDecoration
        child: child,
      );
    }

    if (!shouldAnimate) {
      // Static (one paint) for cheap first frame
      return IgnorePointer(child: decorated(coverageStop));
    }

    // Gentle one-shot entrance; wrapper avoids hit-testing & repaint churn.
    return IgnorePointer(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.85, end: 1.0),
        duration: AppAnim.slow,
        curve: Curves.easeOutQuad,
        builder: (_, value, __) {
          final double t = ((value - 0.85) / 0.15).clamp(0.0, 1.0).toDouble();
          // Start slightly under the target coverage so the wash eases in.
          final double midStop =
              (coverageStop - entryOvershoot) + t * entryOvershoot;

          return decorated(midStop);
        },
      ),
    );
  }
}
