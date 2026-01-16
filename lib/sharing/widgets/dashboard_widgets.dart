import 'package:flutter/material.dart';

// ---------------- Public Helper Widgets ----------------

class PartnerRingSummary extends StatelessWidget {
  final double credit;
  final double debit;
  final double ringSize;
  final double? totalAmount;

  const PartnerRingSummary({
    required this.credit,
    required this.debit,
    this.ringSize = 110,
    this.totalAmount,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final total = totalAmount ?? credit + debit;

    final incomePercent = (total > 0) ? (credit / total) : 0.0;
    final expensePercent = (total > 0) ? (debit / total) : 0.0;

    return SizedBox(
      width: ringSize,
      height: ringSize,
      child: CustomPaint(
        painter: SplitRingPainter(
          incomePercent: incomePercent,
          expensePercent: expensePercent,
        ),
        child: Center(
          child: Text(
            '₹${total.toStringAsFixed(0)}',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 23,
              color: Colors.black87,
            ),
          ),
        ),
      ),
    );
  }
}

class SplitRingPainter extends CustomPainter {
  final double incomePercent;
  final double expensePercent;

  SplitRingPainter({
    required this.incomePercent,
    required this.expensePercent,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const strokeWidth = 15.0;
    final radius = (size.width - strokeWidth) / 2;
    final center = Offset(size.width / 2, size.height / 2);

    final bgPaint = Paint()
      ..color = Colors.grey[300]!
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // background ring
    canvas.drawCircle(center, radius, bgPaint);

    // income arc (green)
    if (incomePercent > 0) {
      final paint = Paint()
        ..color = Colors.green
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      final sweepAngle = 2 * 3.14159265359 * incomePercent;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -3.14159265359 / 2,
        sweepAngle,
        false,
        paint,
      );
    }

    // expense arc (red)
    if (expensePercent > 0) {
      final paint = Paint()
        ..color = Colors.red
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      final sweepAngle = 2 * 3.14159265359 * expensePercent;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -3.14159265359 / 2 + 2 * 3.14159265359 * incomePercent,
        sweepAngle,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

class StatMini extends StatelessWidget {
  final String label;
  final double value;
  final Color? color;
  const StatMini(
      {super.key, required this.label, required this.value, this.color});
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 11, color: color ?? Colors.teal),
        ),
        Text(
          "₹${value.toStringAsFixed(0)}",
          style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
              color: color ?? Colors.teal[900]),
        ),
      ],
    );
  }
}

class TxIconBubble extends StatelessWidget {
  final bool isIncome;
  const TxIconBubble({super.key, required this.isIncome});
  @override
  Widget build(BuildContext context) {
    final color = isIncome ? const Color(0xFF1DB954) : const Color(0xFFE53935);
    final bg = isIncome ? const Color(0x221DB954) : const Color(0x22E53935);
    final icon =
        isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded;
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Icon(icon, color: color),
    );
  }
}
