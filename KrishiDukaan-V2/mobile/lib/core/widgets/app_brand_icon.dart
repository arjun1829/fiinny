import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

class AppBrandIcon extends StatelessWidget {
  final double size;
  final bool elevated;

  const AppBrandIcon({super.key, this.size = 40, this.elevated = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(
          color: AppColors.primaryContainer.withValues(alpha: 0.85),
          width: 1.2,
        ),
        boxShadow: elevated
            ? [
                BoxShadow(
                  color: AppColors.cardShadow,
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      padding: EdgeInsets.all(size * 0.14),
      child: ClipOval(
        child: Image.asset('assets/icons/app_icon.png', fit: BoxFit.cover),
      ),
    );
  }
}
