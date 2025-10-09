// lib/ui/glass/gloss_painter.dart
import 'package:flutter/material.dart';

/// Simple top gloss painter that uses the provided canvas size.
/// No child, no expand → safe in slivers and cheap to draw.
/// Tip: Prefer using `foregroundDecoration` in GlassCard for even cheaper gloss;
/// keep this painter if you need custom effects.
class GlossPainter extends CustomPainter {
  const GlossPainter();

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;

    final rect = Offset.zero & size;

    // Subtle top highlight
    final paintTop = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color(0x29FFFFFF), // ~16% white
          Color(0x00FFFFFF), // transparent
        ],
        stops: [0.0, 0.3],
      ).createShader(rect);

    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height * 0.38),
      paintTop,
    );

    // Tiny diagonal sparkle (no Matrix4; use rotate to avoid type issues)
    final sparklePaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0x1AFFFFFF), // ~10% white
          Color(0x00FFFFFF),
        ],
      ).createShader(rect);

    final sparkleRect = Rect.fromLTWH(
      size.width * 0.15,
      size.height * 0.05,
      size.width * 0.45,
      size.height * 0.20,
    );

    canvas.save();
    final cx = sparkleRect.center.dx;
    final cy = sparkleRect.center.dy;
    canvas.translate(cx, cy);
    canvas.rotate(-0.12); // ~ -7 degrees
    canvas.translate(-cx, -cy);

    canvas.drawRRect(
      RRect.fromRectAndRadius(sparkleRect, const Radius.circular(28)),
      sparklePaint,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant GlossPainter oldDelegate) => false;
}
