// lib/widgets/animated_height_fade.dart
import 'package:flutter/material.dart';

/// A cheap “slide open” composed of AnimatedSize + FadeTransition.
/// Keeps child alive; just animates size & opacity.
class AnimatedHeightFade extends StatefulWidget {
  final bool visible;
  final Widget child;
  final Duration duration;
  final Curve curve;

  const AnimatedHeightFade({
    super.key,
    required this.visible,
    required this.child,
    this.duration = const Duration(milliseconds: 240),
    this.curve = Curves.easeOutCubic,
  });

  @override
  State<AnimatedHeightFade> createState() => _AnimatedHeightFadeState();
}

class _AnimatedHeightFadeState extends State<AnimatedHeightFade>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
  AnimationController(vsync: this, duration: widget.duration);
  late final Animation<double> _opacity =
  CurvedAnimation(parent: _c, curve: Curves.easeInOut);

  @override
  void didUpdateWidget(covariant AnimatedHeightFade oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.visible) {
      _c.forward();
    } else {
      _c.reverse();
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.visible) _c.value = 1;
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: widget.duration,
      curve: widget.curve,
      alignment: Alignment.topCenter,
      child: FadeTransition(
        opacity: _opacity,
        child: widget.visible ? widget.child : const SizedBox.shrink(),
      ),
    );
  }
}
