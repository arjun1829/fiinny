// lib/ui/fab/gradient_fab.dart
import 'package:flutter/material.dart';
import '../tokens.dart';

class GradientFab extends StatelessWidget {
  final VoidCallback onPressed;
  final IconData icon;
  final String? label;

  const GradientFab({
    super.key,
    required this.onPressed,
    this.icon = Icons.add,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    final fabCore = Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        gradient: const LinearGradient(
          colors: [AppColors.mintGlow, AppColors.mint],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.mint.withOpacity(.35),
            blurRadius: 18,
            spreadRadius: 1,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white),
          if (label != null) ...[
            const SizedBox(width: 8),
            Text(
              label!,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ],
      ),
    );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () {
          Feedback.forTap(context);
          onPressed();
        },
        child: fabCore,
      ),
    );
  }
}
