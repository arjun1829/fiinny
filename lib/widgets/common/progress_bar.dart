import 'package:flutter/material.dart';

class ProgressBar extends StatelessWidget {
  final String label;
  final double value; // 0..1
  final String? meta;

  const ProgressBar({
    Key? key,
    required this.label,
    required this.value,
    this.meta,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
          if (meta != null) ...[
            const SizedBox(width: 6),
            Text(meta!, style: const TextStyle(color: Colors.black54, fontWeight: FontWeight.w600)),
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
