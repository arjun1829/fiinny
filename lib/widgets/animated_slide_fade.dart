import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart';

/// Lightweight slide+fade that **does not cause layout jumps**.
/// - Child is laid out immediately (opacity 0, slight offset) and then animated.
/// - Honors reduced-motion via [AppPerf.lowGpuMode].
/// - Backward compatible with older usage (beginDy only), but also supports X offset.
class AnimatedSlideFade extends StatefulWidget {
  final Widget child;

  /// Delay before starting the animation.
  final int delayMilliseconds;

  /// Total animation duration.
  final Duration duration;

  /// Vertical offset to start from (fraction of the child's size in SlideTransition space).
  /// Positive = comes from below. Default: .15
  final double beginDy;

  /// Horizontal offset to start from (fraction). Positive = comes from right.
  /// Default 0 to keep older usages working.
  final double beginDx;

  /// Override fade / slide curves if needed.
  final Curve fadeCurve;
  final Curve slideCurve;

  const AnimatedSlideFade({
    super.key,
    required this.child,
    this.delayMilliseconds = 0,
    this.duration = AppAnim.med,
    this.beginDy = .15,
    this.beginDx = 0.0,
    this.fadeCurve = AppAnim.fade,
    this.slideCurve = AppAnim.slide,
  });

  @override
  State<AnimatedSlideFade> createState() => _AnimatedSlideFadeState();
}

class _AnimatedSlideFadeState extends State<AnimatedSlideFade>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
  );

  late Animation<Offset> _offset;
  late Animation<double> _opacity;

  bool _started = false;

  @override
  void initState() {
    super.initState();

    _buildTweens();

    if (AppPerf.lowGpuMode) {
      // Show instantly in low-GPU / reduced motion mode.
      _controller.value = 1;
      _started = true;
      return;
    }

    // Start after the requested delay.
    Future.delayed(Duration(milliseconds: widget.delayMilliseconds), () {
      if (!mounted) return;
      _started = true;
      _controller.forward();
    });
  }

  void _buildTweens() {
    _offset = Tween<Offset>(
      begin: Offset(widget.beginDx, widget.beginDy),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: widget.slideCurve));

    _opacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: widget.fadeCurve),
    );
  }

  @override
  void didUpdateWidget(covariant AnimatedSlideFade oldWidget) {
    super.didUpdateWidget(oldWidget);
    final needsRebuild = oldWidget.beginDx != widget.beginDx ||
        oldWidget.beginDy != widget.beginDy ||
        oldWidget.duration != widget.duration ||
        oldWidget.fadeCurve != widget.fadeCurve ||
        oldWidget.slideCurve != widget.slideCurve;

    if (needsRebuild) {
      // Recreate controller duration if changed
      if (oldWidget.duration != widget.duration) {
        final v = _controller.value;
        _controller.duration = widget.duration;
        _controller.value = v.clamp(0, 1);
      }
      _buildTweens();
    }

    // If not started yet (e.g., the widget rebuilt quickly) and we're at zero, start.
    if (!_started &&
        !_controller.isAnimating &&
        _controller.value == 0 &&
        !AppPerf.lowGpuMode) {
      _started = true;
      _controller.forward();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Always build the child to keep layout stable.
    if (AppPerf.lowGpuMode) return widget.child;

    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(
        position: _offset,
        child: widget.child,
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
