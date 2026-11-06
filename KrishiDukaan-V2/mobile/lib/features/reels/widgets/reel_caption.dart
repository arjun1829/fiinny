import 'package:flutter/material.dart';

/// A reel's description over the video: two lines with "more" when it is
/// longer; tapping opens the full text (scrollable, so a very long one never
/// covers the whole video) and "less" folds it back.
class ReelCaption extends StatefulWidget {
  final String text;
  final TextStyle style;
  final int trimLines;

  const ReelCaption(
    this.text, {
    super.key,
    required this.style,
    this.trimLines = 2,
  });

  @override
  State<ReelCaption> createState() => _ReelCaptionState();
}

class _ReelCaptionState extends State<ReelCaption> {
  bool _expanded = false;

  @override
  void didUpdateWidget(covariant ReelCaption oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A recycled page showing another reel starts folded.
    if (oldWidget.text != widget.text) _expanded = false;
  }

  @override
  Widget build(BuildContext context) {
    final toggleStyle = widget.style.copyWith(
      color: Colors.white,
      fontWeight: FontWeight.w700,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final tp = TextPainter(
          text: TextSpan(text: widget.text, style: widget.style),
          textDirection: Directionality.of(context),
          maxLines: widget.trimLines,
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth);
        if (!tp.didExceedMaxLines) {
          return Text(widget.text, style: widget.style);
        }

        if (!_expanded) {
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => _expanded = true),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.text,
                  style: widget.style,
                  maxLines: widget.trimLines,
                  overflow: TextOverflow.ellipsis,
                ),
                Text('more', style: toggleStyle),
              ],
            ),
          );
        }

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => setState(() => _expanded = false),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.35,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.text, style: widget.style),
                  const SizedBox(height: 2),
                  Text('less', style: toggleStyle),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
