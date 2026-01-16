import 'dart:ui';
import 'package:flutter/material.dart';

class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double borderRadius;
  final Color? color; // <-- New line!

  const GlassCard({
    required this.child,
    this.padding,
    this.margin,
    this.borderRadius = 18,
    this.color, // <-- New
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? (isDark ? Colors.white.withValues(alpha: 0.13) : Colors.black.withValues(alpha: 0.05)),
        borderRadius: BorderRadius.circular(borderRadius),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.09),
            blurRadius: 18,
            offset: Offset(0, 8),
          )
        ],
        border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 1),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Padding(
            padding: padding ?? EdgeInsets.all(14),
            child: child,
          ),
        ),
      ),
    );
  }
}
