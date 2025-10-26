// lib/widgets/hero_transaction_ring.dart
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../themes/tokens.dart';

class HeroTransactionRing extends StatelessWidget {
  final double credit;
  final double debit;
  final String period;
  final String title;
  final String? subtitle;
  final VoidCallback onFilterTap;
  final VoidCallback? onTap;

  const HeroTransactionRing({
    super.key,
    required this.credit,
    required this.debit,
    required this.period,
    required this.title,
    this.subtitle,
    required this.onFilterTap,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final maxValue = (credit > debit ? credit : debit);
    final safeMax = maxValue <= 0 ? 1.0 : maxValue;
    final pCredit = (credit / safeMax).clamp(0.0, 1.0);
    final pDebit = (debit / safeMax).clamp(0.0, 1.0);
    final isCompact = MediaQuery.of(context).size.width < 360;
    final radius = BorderRadius.circular(Fx.r28);

    return Material(
      color: Colors.transparent,
      borderRadius: radius,
      child: Ink(
        decoration: BoxDecoration(
          color: Fx.card,
          borderRadius: radius,
          boxShadow: Fx.soft,
        ),
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: isCompact ? Fx.s16 : Fx.s20,
              vertical: isCompact ? Fx.s16 : Fx.s20,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _Rings(
                  credit: pCredit,
                  debit: pDebit,
                  isCompact: isCompact,
                ),
                SizedBox(width: isCompact ? Fx.s16 : Fx.s24),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Fx.title.copyWith(
                          fontSize: isCompact ? 16.5 : 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (subtitle != null && subtitle!.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          subtitle!,
                          style: Fx.label.copyWith(
                            fontSize: 12.5,
                            color: Colors.black.withOpacity(0.55),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                      SizedBox(height: subtitle == null || subtitle!.isEmpty ? Fx.s10 : Fx.s14),
                      _rowAmount(label: 'Credit', amount: credit, color: Fx.good, compact: isCompact),
                      const SizedBox(height: 8),
                      _rowAmount(label: 'Debit', amount: debit, color: Fx.bad, compact: isCompact),
                      const SizedBox(height: 14),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: GestureDetector(
                          onTap: onFilterTap,
                          child: Container(
                            padding: EdgeInsets.symmetric(
                              horizontal: isCompact ? Fx.s12 : Fx.s16,
                              vertical: Fx.s8,
                            ),
                            decoration: BoxDecoration(
                              color: Fx.mintDark.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(Fx.r12),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  period,
                                  style: Fx.label.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: Fx.mintDark,
                                    fontSize: isCompact ? 12 : 13.5,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Icon(Icons.expand_more_rounded, size: 18, color: Fx.mintDark),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _rowAmount({
    required String label,
    required double amount,
    required Color color,
    required bool compact,
  }) {
    return Row(
      children: [
        Text(
          '₹${amount.toStringAsFixed(0)}',
          style: Fx.number.copyWith(
            color: color,
            fontSize: compact ? 22 : 24,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: Fx.s6),
        Text(
          label,
          style: Fx.label.copyWith(
            color: color,
            fontWeight: FontWeight.w700,
            fontSize: compact ? 12.5 : 13.5,
          ),
        ),
      ],
    );
  }
}

class _Rings extends StatelessWidget {
  final double credit;
  final double debit;
  final bool isCompact;

  const _Rings({
    required this.credit,
    required this.debit,
    required this.isCompact,
  });

  @override
  Widget build(BuildContext context) {
    final outerSize = isCompact ? 140.0 : 156.0;
    final innerSize = isCompact ? 110.0 : 124.0;

    return SizedBox(
      width: outerSize,
      height: outerSize,
      child: Stack(
        alignment: Alignment.center,
        children: [
          _AnimatedArc(
            percent: debit,
            size: outerSize,
            stroke: isCompact ? 12 : 14,
            colors: [Fx.bad.withOpacity(.15), Fx.bad],
          ),
          _AnimatedArc(
            percent: credit,
            size: innerSize,
            stroke: isCompact ? 9 : 10,
            colors: [Fx.good.withOpacity(.15), Fx.good],
          ),
        ],
      ),
    );
  }
}

class _AnimatedArc extends StatelessWidget {
  final double percent;
  final double size;
  final double stroke;
  final List<Color> colors;

  const _AnimatedArc({
    required this.percent,
    required this.size,
    required this.stroke,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: percent),
      duration: const Duration(milliseconds: 850),
      curve: Curves.easeOutCubic,
      builder: (context, val, _) => CustomPaint(
        painter: _ArcPainter(value: val, stroke: stroke, colors: colors),
        size: Size(size, size),
      ),
    );
  }
}

class _ArcPainter extends CustomPainter {
  final double value;
  final double stroke;
  final List<Color> colors;

  _ArcPainter({required this.value, required this.stroke, required this.colors});

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final r = size.width / 2;

    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = colors.last.withOpacity(0.12);
    canvas.drawArc(Rect.fromCircle(center: center, radius: r), 0, 2*math.pi, false, bg);

    final sweep = 2 * math.pi * value;
    final rect = Rect.fromCircle(center: center, radius: r);
    final gradient = SweepGradient(
      startAngle: -math.pi/2,
      endAngle: -math.pi/2 + sweep,
      colors: [colors.first, colors.last],
    );
    final fg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..shader = gradient.createShader(rect);

    canvas.drawArc(rect, -math.pi/2, sweep, false, fg);
  }

  @override
  bool shouldRepaint(_ArcPainter old) => old.value != value || old.stroke != stroke || old.colors != colors;
}
