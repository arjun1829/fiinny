import 'package:flutter/material.dart';

class ProgressBar extends StatelessWidget {
  final double percent; // 0..1
  final Color color;
  final double height;

  const ProgressBar({
    super.key,
    required this.percent,
    required this.color,
    required this.label,
    this.meta,
    this.height = 8,
  });

  final String label;
  final String? meta;

  @override
  Widget build(BuildContext context) {
    final v = percent.clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
          if (meta != null) ...[
            const SizedBox(width: 6),
            Text(meta!,
                style: const TextStyle(
                    color: Colors.black54, fontWeight: FontWeight.w600)),
          ],
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            minHeight: 8,
            value: v,
            backgroundColor: Colors.black12,
            valueColor: const AlwaysStoppedAnimation<Color>(Colors.black87),
          ),
        ),
      ],
    );
  }
}
