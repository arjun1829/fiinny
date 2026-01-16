import 'dart:math' as math;

import 'package:flutter/material.dart';

class PieSlice {
  final String key;
  final String label;
  final double value;
  final Color color;

  const PieSlice({
    required this.key,
    required this.label,
    required this.value,
    required this.color,
  });
}

class PieTouchChart extends StatefulWidget {
  final List<PieSlice> slices;
  final String totalLabel;
  final double holeFraction;
  final ValueChanged<PieSlice?> onSelect;
  final PieSlice? selected;
  final Duration animationDuration;

  const PieTouchChart({
    super.key,
    required this.slices,
    required this.onSelect,
    this.totalLabel = 'Total',
    this.holeFraction = 0.65,
    this.selected,
    this.animationDuration = const Duration(milliseconds: 350),
  });

  @override
  State<PieTouchChart> createState() => _PieTouchChartState();
}

class _PieTouchChartState extends State<PieTouchChart>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  PieSlice? _selected;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.animationDuration,
    )..forward();
    _selected = widget.selected;
  }

  @override
  void didUpdateWidget(covariant PieTouchChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.slices != widget.slices) {
      _controller.forward(from: 0);
    }
    if (oldWidget.selected?.key != widget.selected?.key) {
      _selected = widget.selected;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTap(Offset localPosition, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final vector = localPosition - center;
    final radius = size.shortestSide / 2;
    final distance = vector.distance;
    final holeRadius = radius * widget.holeFraction;

    if (distance <= holeRadius) {
      setState(() => _selected = null);
      widget.onSelect(null);
      return;
    }

    if (distance > radius || widget.slices.isEmpty) {
      return;
    }

    double angle = math.atan2(vector.dy, vector.dx);
    if (angle < -math.pi / 2) {
      angle += 2 * math.pi;
    }

    final total = widget.slices.fold<double>(0, (sum, s) => sum + s.value.abs());
    double sweepStart = -math.pi / 2;
    for (final slice in widget.slices) {
      final sweep = total == 0 ? 0 : (slice.value.abs() / total) * 2 * math.pi;
      final sweepEnd = sweepStart + sweep;
      if (angle >= sweepStart && angle <= sweepEnd) {
        setState(() => _selected = slice);
        widget.onSelect(slice);
        return;
      }
      sweepStart = sweepEnd;
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = constraints.biggest.shortestSide;
        return GestureDetector(
          onTapDown: (details) =>
              _handleTap(details.localPosition, Size.square(size)),
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              return CustomPaint(
                painter: _PiePainter(
                  slices: widget.slices,
                  selected: _selected,
                  holeFraction: widget.holeFraction,
                  progress: CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic).value,
                ),
                child: SizedBox(width: size, height: size),
              );
            },
          ),
        );
      },
    );
  }
}

class _PiePainter extends CustomPainter {
  final List<PieSlice> slices;
  final PieSlice? selected;
  final double holeFraction;
  final double progress;

  _PiePainter({
    required this.slices,
    required this.selected,
    required this.holeFraction,
    required this.progress,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final total = slices.fold<double>(0, (sum, s) => sum + s.value.abs());
    final radius = size.shortestSide / 2;
    final center = Offset(size.width / 2, size.height / 2);
    double startAngle = -math.pi / 2;
    for (final slice in slices) {
      final sweep = total == 0
          ? 0
          : (slice.value.abs() / total) * 2 * math.pi * progress;
      final isSelected = selected?.key == slice.key;
      final paint = Paint()
        ..style = PaintingStyle.fill
        ..color = isSelected
            ? slice.color
            : slice.color.withValues(alpha: 0.9);

      final outerRadius = isSelected ? radius + 6 : radius;
      final arcRect = Rect.fromCircle(center: center, radius: outerRadius);
      canvas.drawArc(arcRect, startAngle, sweep.toDouble(), true, paint);
      startAngle += sweep;
    }

    final holePaint = Paint()
      ..style = PaintingStyle.fill
      ..color = Colors.white.withValues(alpha: 0.9);
    canvas.drawCircle(center, radius * holeFraction, holePaint);
  }

  @override
  bool shouldRepaint(covariant _PiePainter oldDelegate) {
    return oldDelegate.slices != slices ||
        oldDelegate.selected?.key != selected?.key ||
        oldDelegate.progress != progress;
  }
}
