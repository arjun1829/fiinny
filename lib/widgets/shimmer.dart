// lib/widgets/shimmer.dart
import 'dart:math' as math;
import 'package:flutter/material.dart';

class ShimmerBox extends StatefulWidget {
  final double height;
  final double? width;
  final BorderRadius borderRadius;
  const ShimmerBox({super.key, required this.height, this.width, this.borderRadius = const BorderRadius.all(Radius.circular(16))});

  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final t = (math.sin(_c.value * 2 * math.pi) + 1) / 2; // 0..1
        final base = Colors.grey.shade200;
        final hilite = Colors.grey.shade300;
        return Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            borderRadius: widget.borderRadius,
            gradient: LinearGradient(
              begin: Alignment(-1 + 2 * t, -1),
              end: const Alignment(1, 1),
              colors: [base, hilite, base],
              stops: const [0.1, 0.5, 0.9],
            ),
          ),
        );
      },
    );
  }
}
