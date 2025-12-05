import 'package:flutter/material.dart';
import 'dart:math';

class DashboardHeroCard extends StatelessWidget {
  final String userName;
  final double credit;
  final double debit;
  final String period;
  final VoidCallback onFilterTap;

  const DashboardHeroCard({
    Key? key,
    required this.userName,
    required this.credit,
    required this.debit,
    required this.period,
    required this.onFilterTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    double maxValue = credit > debit ? credit : debit;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 0, vertical: 10),
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 0),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: theme.shadowColor.withOpacity(0.08),
            blurRadius: 28,
            offset: const Offset(0, 9),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Hello userName
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 26),
            child: Text(
              "Hello $userName",
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                letterSpacing: 0.2,
              ),
            ),
          ),
          const SizedBox(height: 4),
          // Rings
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _RingStat(
                label: "Credit",
                value: credit,
                maxValue: maxValue,
                color: Colors.greenAccent.shade400,
                icon: Icons.arrow_downward_rounded,
                textColor: theme.textTheme.bodyMedium?.color,
              ),
              const SizedBox(width: 26),
              _RingStat(
                label: "Debit",
                value: debit,
                maxValue: maxValue,
                color: Colors.redAccent.shade200,
                icon: Icons.arrow_upward_rounded,
                textColor: theme.textTheme.bodyMedium?.color,
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Filter Period
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Row(
              children: [
                Text(
                  "$period Summary",
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: theme.textTheme.bodyMedium?.color?.withOpacity(0.7),
                  ),
                ),
                const Spacer(),
                InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: onFilterTap,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.onSurface.withOpacity(0.07),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Text(
                          period,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.tealAccent,
                          ),
                        ),
                        const SizedBox(width: 3),
                        const Icon(Icons.expand_more_rounded, size: 19, color: Colors.tealAccent),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RingStat extends StatelessWidget {
  final String label;
  final double value;
  final double maxValue;
  final Color color;
  final IconData icon;

  const _RingStat({
    required this.label,
    required this.value,
    required this.maxValue,
    required this.color,
    required this.icon,
    this.textColor,
  });

  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    double percent = maxValue == 0 ? 0 : (value / maxValue).clamp(0.0, 1.0);

    return Column(
      children: [
        SizedBox(
          width: 80,
          height: 80,
          child: Stack(
            alignment: Alignment.center,
            children: [
              TweenAnimationBuilder<double>(
                tween: Tween<double>(begin: 0, end: percent),
                duration: const Duration(milliseconds: 900),
                curve: Curves.easeOutCubic,
                builder: (context, val, _) {
                  return CustomPaint(
                    painter: _RingPainter(
                      color: color,
                      percent: val,
                      strokeWidth: 10,
                    ),
                    size: const Size(80, 80),
                  );
                },
              ),
              Icon(icon, color: color, size: 30),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: textColor ?? color),
        ),
        Text(
          "₹${value.toStringAsFixed(0)}",
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: textColor ?? color,
            fontSize: 18,
          ),
        ),
      ],
    );
  }
}

class _RingPainter extends CustomPainter {
  final Color color;
  final double percent;
  final double strokeWidth;

  _RingPainter({
    required this.color,
    required this.percent,
    this.strokeWidth = 10,
  });

  @override
  void paint(Canvas canvas, Size size) {
    Rect rect = Offset.zero & size;

    Paint bg = Paint()
      ..color = color.withOpacity(0.13)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    Paint fg = Paint()
      ..shader = SweepGradient(
        colors: [color, color.withOpacity(0.13)],
        startAngle: -pi / 2,
        endAngle: pi * 2,
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // Background circle
    canvas.drawArc(
      Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2),
      0, 2 * pi, false, bg,
    );
    // Foreground arc
    canvas.drawArc(
      Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2),
      -pi / 2, 2 * pi * percent, false, fg,
    );
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) =>
      oldDelegate.percent != percent ||
          oldDelegate.color != color ||
          oldDelegate.strokeWidth != strokeWidth;
}
