// lib/ui/atoms/progress_tiny.dart
import 'package:flutter/material.dart';

/// A tiny, smooth, themeable progress bar.
/// - Backwards-compatible: `value`, `color`, `animate` still work.
/// - Extras (all optional):
///   • `height`, `radius`, `trackColor`
///   • `duration`, `curve`
///   • `label`, `labelStyle` (drawn on top, centered)
///   • `indeterminate` for looping shimmer when exact progress is unknown
class ProgressTiny extends StatelessWidget {
  /// 0..1; clamped internally. Ignored when [indeterminate] is true.
  final double value;

  /// Foreground (fill) color.
  final Color color;

  /// Animate width changes.
  final bool animate;

  /// Show a looping shimmer instead of a fixed width when true.
  final bool indeterminate;

  /// Track height.
  final double height;

  /// Corner radius for both track and thumb.
  final BorderRadiusGeometry radius;

  /// Optional custom track color (defaults to `color.withValues(alpha: .12)`).
  final Color? trackColor;

  /// Animation duration (when [animate] is true).
  final Duration duration;

  /// Animation curve (when [animate] is true).
  final Curve curve;

  /// Optional centered label (e.g., "62%").
  final String? label;

  /// Style for [label].
  final TextStyle? labelStyle;

  const ProgressTiny({
    super.key,
    required this.value,
    required this.color,
    this.animate = false,
    this.indeterminate = false,
    this.height = 8,
    this.radius = const BorderRadius.all(Radius.circular(999)),
    this.trackColor,
    this.duration = const Duration(milliseconds: 550),
    this.curve = Curves.easeOutCubic,
    this.label,
    this.labelStyle,
  });

  @override
  Widget build(BuildContext context) {
    final v = indeterminate ? 0.0 : value.clamp(0.0, 1.0);
    final track = trackColor ?? color.withValues(alpha: .12);

    final Widget bar = LayoutBuilder(
      builder: (_, constraints) {
        final maxW = constraints.maxWidth;
        final targetW = maxW * v;

        // Foreground fill (determinate)
        final fill = Container(
          width: targetW,
          height: height,
          decoration: BoxDecoration(
            // subtle light → solid vertical gradient for nicer depth
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                color.withValues(alpha: .90),
                color,
              ],
            ),
            borderRadius: radius,
          ),
        );

        return Stack(
          alignment: Alignment.center,
          children: [
            // Track
            Container(
              height: height,
              decoration: BoxDecoration(
                color: track,
                borderRadius: radius,
              ),
            ),

            // Determinate or indeterminate fill
            if (!indeterminate)
              animate
                  ? AnimatedContainer(
                duration: duration,
                curve: curve,
                width: targetW,
                height: height,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      color.withValues(alpha: .90),
                      color,
                    ],
                  ),
                  borderRadius: radius,
                ),
              )
                  : fill
            else
            // Indeterminate shimmer: a sliding highlight
              _IndeterminateStripe(
                color: color,
                height: height,
                radius: radius,
                duration: duration,
                track: track,
              ),

            // Optional centered label
            if (label != null && label!.isNotEmpty)
              IgnorePointer(
                ignoring: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Text(
                    label!,
                    maxLines: 1,
                    overflow: TextOverflow.fade,
                    softWrap: false,
                    style: labelStyle ??
                        TextStyle(
                          fontSize: height <= 8 ? 10 : 12,
                          fontWeight: FontWeight.w800,
                          color: Colors.black.withValues(alpha: .65),
                        ),
                  ),
                ),
              ),
          ],
        );
      },
    );

    // Accessibility semantics
    final semanticsValue = indeterminate ? 'In progress' : '${(v * 100).round()}%';

    return Semantics(
      label: 'Progress',
      value: semanticsValue,
      child: bar,
    );
  }
}

/// A tiny, cheap indeterminate shimmer used by [ProgressTiny].
class _IndeterminateStripe extends StatefulWidget {
  final Color color;
  final Color track;
  final double height;
  final BorderRadiusGeometry radius;
  final Duration duration;

  const _IndeterminateStripe({
    required this.color,
    required this.track,
    required this.height,
    required this.radius,
    required this.duration,
  });

  @override
  State<_IndeterminateStripe> createState() => _IndeterminateStripeState();
}

class _IndeterminateStripeState extends State<_IndeterminateStripe>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: widget.duration)..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        return ClipRRect(
          borderRadius: widget.radius,
          child: CustomPaint(
            size: Size.infinite,
            painter: _StripePainter(
              progress: _c.value,
              base: widget.track,
              glow: widget.color,
            ),
            child: SizedBox(height: widget.height),
          ),
        );
      },
    );
  }
}

class _StripePainter extends CustomPainter {
  final double progress; // 0..1
  final Color base;
  final Color glow;

  _StripePainter({
    required this.progress,
    required this.base,
    required this.glow,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // draw base (already drawn by track, but ensures full paint on custom paint)
    final trackPaint = Paint()..color = base;
    final rect = Offset.zero & size;
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(999)),
      trackPaint,
    );

    // moving diagonal stripe for shimmer
    final stripeWidth = size.width * 0.28;
    final x = (size.width + stripeWidth) * progress - stripeWidth;
    final stripeRect = Rect.fromLTWH(x, 0, stripeWidth, size.height);

    final stripePaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Colors.transparent,
          glow.withValues(alpha: .35),
          Colors.transparent,
        ],
        stops: const [0.0, 0.5, 1.0],
      ).createShader(stripeRect);

    canvas.save();
    // Rotate slightly for diagonal look
    canvas.translate(stripeRect.center.dx, stripeRect.center.dy);
    canvas.rotate(-0.35);
    canvas.translate(-stripeRect.center.dx, -stripeRect.center.dy);
    canvas.drawRect(stripeRect.inflate(size.height * 0.6), stripePaint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _StripePainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.base != base ||
        oldDelegate.glow != glow;
  }
}
