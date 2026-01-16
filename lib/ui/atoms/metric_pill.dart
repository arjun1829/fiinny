import 'package:flutter/material.dart';
import '../tokens.dart';

class MetricPill extends StatelessWidget {
  final IconData? icon;
  final String label;   // small label
  final String value;   // bold metric
  final Color? tint;
  final VoidCallback? onTap;

  const MetricPill({
    super.key,
    this.icon,
    required this.label,
    required this.value,
    this.tint,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = tint ?? AppColors.mint;

    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 16, color: c),
          const SizedBox(width: 8),
        ],
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: c.withValues(alpha: .9),
                fontWeight: FontWeight.w600,
                fontSize: 11,
                letterSpacing: .2,
              ),
            ),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: c,
                fontWeight: FontWeight.w900,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ],
    );

    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: ShapeDecoration(
        color: c.withValues(alpha: .08),
        shape: StadiumBorder(side: BorderSide(color: c.withValues(alpha: .25))),
      ),
      child: content,
    );

    if (onTap == null) return pill;

    // Keep tap target comfy without changing visuals
    return Semantics(
      button: true,
      label: '$label $value',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(2.0), // slight hitbox padding
            child: pill,
          ),
        ),
      ),
    );
  }
}
