// lib/widgets/animate_when_visible.dart
import 'package:flutter/material.dart';
class AnimateWhenVisible extends StatelessWidget {
  final Widget child;
  final int delayMs;
  const AnimateWhenVisible({super.key, required this.child, this.delayMs = 120});

  @override
  Widget build(BuildContext context) {
    final vs = MediaQuery.of(context).viewInsets; // cheap anchor; replace with VisibilityDetector if you use that pkg
    // heuristic: if keyboard shown or lots of content, skip
    final skip = vs.bottom > 0;
    if (skip) return child;
    return AnimatedSlide(
      offset: const Offset(0, .06),
      duration: Duration(milliseconds: 260 + delayMs),
      curve: Curves.easeOutCubic,
      child: AnimatedOpacity(
        opacity: 1, duration: Duration(milliseconds: 260 + delayMs),
        child: child,
      ),
    );
  }
}
