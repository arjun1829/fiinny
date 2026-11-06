import 'package:flutter/material.dart';

import '../constants/app_colors.dart';

/// The Buy Now pill on a product card (see ProductCard.onBuyNow).
class BuyNowPill extends StatelessWidget {
  const BuyNowPill({
    super.key,
    required this.label,
    required this.compact,
    required this.busy,
    required this.onTap,
  });

  final String label;
  final bool compact;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.secondary,
      borderRadius: BorderRadius.circular(compact ? 8 : 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(compact ? 8 : 10),
        onTap: busy ? null : onTap,
        child: SizedBox(
          height: compact ? 26 : 30,
          child: Center(
            child: busy
                ? SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.onSecondary,
                    ),
                  )
                : FittedBox(
                    // Shrinks the label to fit a narrow card instead of
                    // overflowing ("Choose size" is longer than "Buy Now").
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.flash_on,
                          size: compact ? 13 : 15,
                          color: AppColors.onSecondary,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          label,
                          style: TextStyle(
                            color: AppColors.onSecondary,
                            fontSize: compact ? 11 : 12.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
