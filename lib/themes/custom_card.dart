import 'package:flutter/material.dart';

class CustomDiamondCard extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final List<Color>? glassGradient;
  final bool isDiamondCut;
  final EdgeInsetsGeometry? margin;
  final EdgeInsetsGeometry? padding;

  const CustomDiamondCard({
    Key? key,
    required this.child,
    this.borderRadius = 22,
    this.glassGradient,
    this.isDiamondCut = false,
    this.margin,
    this.padding,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final shape = isDiamondCut
        ? BorderRadius.only(
      topLeft: Radius.circular(borderRadius * 0.4),
      topRight: Radius.circular(borderRadius * 1.2),
      bottomLeft: Radius.circular(borderRadius * 1.2),
      bottomRight: Radius.circular(borderRadius * 0.4),
    )
        : BorderRadius.circular(borderRadius);

    return Container(
      margin: margin ?? const EdgeInsets.symmetric(vertical: 8, horizontal: 0),
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: shape,
        gradient: LinearGradient(
          colors: glassGradient ??
              [
                Colors.white.withValues(alpha: 0.15),
                Colors.white.withValues(alpha: 0.06),
              ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.22),
          width: isDiamondCut ? 2.0 : 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withValues(alpha: 0.14),
            blurRadius: isDiamondCut ? 18 : 9,
            offset: Offset(0, isDiamondCut ? 7 : 4),
          ),
        ],
      ),
      child: child,
    );
  }
}
