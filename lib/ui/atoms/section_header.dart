import 'package:flutter/material.dart';
import '../tokens.dart';

class SectionHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget? trailing;
  final Color color;
  final EdgeInsetsGeometry padding;

  const SectionHeader({
    super.key,
    required this.icon,
    required this.label,
    this.trailing,
    this.color = AppColors.mint,
    this.padding = const EdgeInsets.fromLTRB(6, 8, 6, 6),
  });

  @override
  Widget build(BuildContext context) {
    final title = Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontSize: 13,
        letterSpacing: .2,
        fontWeight: FontWeight.w800,
        color: color, // use provided color
      ),
    );

    final row = Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 6),
        Expanded(child: title),
        if (trailing != null) trailing!,
      ],
    );

    return Semantics(
      header: true,
      child: Padding(
        padding: padding,
        child: row,
      ),
    );
  }
}
