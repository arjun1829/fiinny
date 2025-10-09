import 'package:flutter/material.dart';

class StaggerIn extends StatelessWidget {
  final AnimationController controller;
  final Interval interval;
  final Offset from;
  final Widget child;
  final Curve curve;
  final double fadeBegin;

  const StaggerIn({
    super.key,
    required this.controller,
    required this.interval,
    required this.from,
    required this.child,
    this.curve = Curves.easeOutCubic,
    this.fadeBegin = 0.0,
  });

  @override
  Widget build(BuildContext context) {
    final a = CurvedAnimation(parent: controller, curve: interval);
    final slide = Tween<Offset>(begin: from, end: Offset.zero)
        .chain(CurveTween(curve: curve))
        .animate(a);
    final fade = Tween<double>(begin: fadeBegin, end: 1).animate(a);
    return FadeTransition(
      opacity: fade,
      child: SlideTransition(position: slide, child: child),
    );
  }
}
