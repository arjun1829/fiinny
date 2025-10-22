// lib/widgets/hero_transaction_ring.dart
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../themes/tokens.dart';

class HeroTransactionRing extends StatelessWidget {
  final double credit;
  final double debit;
  final String period;
  final VoidCallback onFilterTap;

  const HeroTransactionRing({
    super.key,
    required this.credit,
    required this.debit,
    required this.period,
    required this.onFilterTap,
  });

  @override
  Widget build(BuildContext context) {
    final maxValue = (credit > debit ? credit : debit);
    final safeMax = maxValue <= 0 ? 1.0 : maxValue;
    final pCredit = (credit / safeMax).clamp(0.0, 1.0);
    final pDebit  = (debit  / safeMax).clamp(0.0, 1.0);

    return Container(
      height: 200,
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      padding: const EdgeInsets.symmetric(vertical: Fx.s14, horizontal: Fx.s10),
      decoration: BoxDecoration(
        color: Fx.card,
        borderRadius: BorderRadius.circular(Fx.r36),
        boxShadow: Fx.soft,
      ),
      child: Row(
        children: [
          _Rings(credit: pCredit, debit: pDebit),
          const SizedBox(width: Fx.s32),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Today Summary", style: Fx.title),
                const SizedBox(height: Fx.s6),
                _rowAmount(label: "Credit", amount: credit, color: Fx.good),
                _rowAmount(label: "Debit",  amount: debit,  color: Fx.bad),
                const SizedBox(height: Fx.s8),
                GestureDetector(
                  onTap: onFilterTap,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: Fx.s14, vertical: Fx.s8),
                    decoration: BoxDecoration(
                      color: Fx.mintDark.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(Fx.r12),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(period, style: Fx.label.copyWith(fontWeight: FontWeight.w800, color: Fx.mintDark)),
                      const Icon(Icons.expand_more_rounded, size: 20, color: Fx.mintDark),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _rowAmount({required String label, required double amount, required Color color}) {
    return Row(children: [
      Text("₹${amount.toStringAsFixed(0)}",
          style: Fx.number.copyWith(color: color, fontSize: 24)),
      const SizedBox(width: Fx.s6),
      Text(label, style: Fx.label.copyWith(color: color, fontWeight: FontWeight.w700)),
    ]);
  }
}

class _Rings extends StatelessWidget {
  final double credit;
  final double debit;
  const _Rings({required this.credit, required this.debit});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150, height: 150,
      child: Stack(
        alignment: Alignment.center,
        children: [
          _AnimatedArc(percent: debit,  size: 150, stroke: 14, colors: [Fx.bad.withOpacity(.15), Fx.bad]),
          _AnimatedArc(percent: credit, size: 118, stroke: 10, colors: [Fx.good.withOpacity(.15), Fx.good]),
          // soft pulse dot at top
          Positioned(
            top: 2, child: _PulseDot(color: Fx.mintDark.withOpacity(.85)),
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

class _PulseDot extends StatefulWidget {
  final Color color;
  const _PulseDot({required this.color});

  @override
  State<_PulseDot> createState() => _PulseDotState();
}
class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
  @override void dispose() { _c.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final t = (math.sin(_c.value * 2 * math.pi) + 1) / 2; // 0..1
        final s = 8 + 2 * t;
        return Container(
          width: s, height: s,
          decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
        );
      },
    );
  }
}
