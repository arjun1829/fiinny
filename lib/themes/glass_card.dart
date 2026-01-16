import 'package:flutter/material.dart';
import 'tokens.dart';

class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final double radius;
  final Color? overrideColor;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(Fx.s16),
    this.radius = Fx.r24,
    this.overrideColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: (overrideColor ?? Fx.card).withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(radius),
        boxShadow: Fx.soft,
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}
