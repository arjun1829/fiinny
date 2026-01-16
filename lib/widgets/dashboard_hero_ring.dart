import 'package:flutter/material.dart';

class DashboardHeroRing extends StatelessWidget {
  final double credit;
  final double debit;
  final String period;
  final VoidCallback? onFilterTap;
  final bool tappable;

  // NEW: knobs for compact usage
  final bool showHeader;        // hides the title/amounts/chip when false (used in mini rings)
  final double? ringSize;       // outer ring diameter; inner is computed from this
  final double? strokeWidth;    // base stroke to scale both rings

  const DashboardHeroRing({
    Key? key,
    required this.credit,
    required this.debit,
    required this.period,
    this.onFilterTap,
    this.tappable = false,
    this.showHeader = true,
    this.ringSize,            // default chosen below
    this.strokeWidth,         // default chosen below
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // ---- math for percents
    double maxValue = (credit > debit ? credit : debit);
    if (maxValue == 0) maxValue = 1.0;
    final percentCredit = (credit / maxValue).clamp(0.0, 1.0).toDouble();
    final percentDebit  = (debit  / maxValue).clamp(0.0, 1.0).toDouble();

    // ---- sizing (scales nicely for both big + mini)
    final double outer = ringSize ?? 150;                     // outer ring diameter
    final double inner = outer * 0.80;                        // inner ring diameter
    final double baseStroke =
        strokeWidth ?? (outer * 0.10).clamp(4.0, 18.0);       // thickness for outer
    final double innerStroke = (baseStroke * 0.75).clamp(3.0, 16.0);

    // ---- just the double ring (used in both layouts)
    final Widget ringStack = Stack(
      alignment: Alignment.center,
      children: [
        _AnimatedRing(
          percent: percentDebit,
          color: Colors.red,
          size: outer,
          strokeWidth: baseStroke,
        ),
        _AnimatedRing(
          percent: percentCredit,
          color: Colors.green,
          size: inner,
          strokeWidth: innerStroke,
        ),
      ],
    );

    // ---- COMPACT: ring only (no header = no Row => no overflow)
    if (!showHeader) {
      final core = SizedBox(width: outer, height: outer, child: ringStack);
      if (!tappable) return core;
      return Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onFilterTap,
          child: core,
        ),
      );
    }

    // ---- FULL CARD (big dashboard style)
    final card = Container(
      // card height adapts to content; avoid fixed 200 to reduce overflow chance
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(36),
        boxShadow: [
          BoxShadow(
            color: Colors.teal.withValues(alpha: 0.10),
            blurRadius: 18,
            offset: const Offset(0, 7),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // ring side
          SizedBox(width: outer, height: outer, child: ringStack),
          const SizedBox(width: 20),
          // text side
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  "Transaction Ring",
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Color(0xFF09857a),
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                // Credit row
                Flexible(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          "₹${credit.toStringAsFixed(0)}",
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.green,
                            fontSize: 24,
                            letterSpacing: 0.1,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Text(
                        "Credit",
                        style: TextStyle(
                          color: Colors.green,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 2),
                // Debit row
                Flexible(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          "₹${debit.toStringAsFixed(0)}",
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.red,
                            fontSize: 24,
                            letterSpacing: 0.1,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Text(
                        "Debit",
                        style: TextStyle(
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                // period chip
                Align(
                  alignment: Alignment.centerLeft,
                  child: GestureDetector(
                    onTap: tappable ? onFilterTap : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.teal.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            period,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF09857a),
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.expand_more_rounded,
                              size: 20, color: Color(0xFF09857a)),
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
    );

    if (!tappable) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(36),
        onTap: onFilterTap,
        child: card,
      ),
    );
  }
}

class _AnimatedRing extends StatelessWidget {
  final double percent;
  final Color color;
  final double size;
  final double strokeWidth;

  const _AnimatedRing({
    Key? key,
    required this.percent,
    required this.color,
    this.size = 60,
    this.strokeWidth = 8,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: percent),
      duration: const Duration(milliseconds: 850),
      curve: Curves.easeOutCubic,
      builder: (context, val, child) => CustomPaint(
        painter: _RingPainter(
          color: color,
          percent: val,
          strokeWidth: strokeWidth,
        ),
        size: Size(size, size),
      ),
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
    this.strokeWidth = 8,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width / 2;

    final Paint bg = Paint()
      ..color = color.withValues(alpha: 0.11)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final Paint fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // BG circle
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      0,
      2 * 3.1415926535,
      false,
      bg,
    );

    // FG progress
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -3.1415926535 / 2,                      // start at 12 o'clock
      2 * 3.1415926535 * percent,             // sweep
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.percent != percent || old.color != color || old.strokeWidth != strokeWidth;
}
