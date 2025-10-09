import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart';

/// Soft mint radial background.
/// - In **lowGpuMode** it renders as a static gradient (no rebuilds).
/// - Otherwise, it animates the outer stop once on mount.
class AnimatedMintBackground extends StatelessWidget {
  final bool? animate;   // override; null -> respect AppPerf.lowGpuMode
  final double intensity; // 0..1, affects center opacity

  const AnimatedMintBackground({
    Key? key,
    this.animate,
    this.intensity = 1.0,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final shouldAnimate = (animate ?? !AppPerf.lowGpuMode);

    final c0 = Colors.tealAccent.withOpacity(0.18 * intensity);
    final c1 = AppColors.mint.withOpacity(0.10 * intensity);
    final c2 = Colors.white.withOpacity(0.65);

    final decorated = (double stop) => DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          colors: [c0, c1, c2],
          radius: 1.2,
          center: Alignment.topLeft,
          stops: const [0.0, 0.55, 1.0],
        ),
      ),
    );

    if (!shouldAnimate) {
      // Static (one paint) for cheap first frame
      return IgnorePointer(child: decorated(1.0));
    }

    // Gentle one-shot entrance; wrapper avoids hit-testing & repaint churn.
    return IgnorePointer(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.85, end: 1.0),
        duration: AppAnim.slow,
        curve: Curves.easeOutQuad,
        builder: (_, value, __) => DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              colors: [c0, c1, c2],
              radius: 1.2,
              center: Alignment.topLeft,
              // move the middle stop slightly for a subtle “breath”
              stops: [0.0, 0.52 + (value - 0.85) * 0.4, 1.0],
            ),
          ),
        ),
      ),
    );
  }
}
