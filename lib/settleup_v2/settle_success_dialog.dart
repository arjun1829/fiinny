import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors, AppSpacing;

class SettleSuccessDialog extends StatefulWidget {
  const SettleSuccessDialog({super.key});

  @override
  State<SettleSuccessDialog> createState() => _SettleSuccessDialogState();
}

class _SettleSuccessDialogState extends State<SettleSuccessDialog> {
  Timer? _timer;
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    HapticFeedback.lightImpact();
    _timer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) Navigator.of(context).maybePop();
    });
    Future.microtask(() {
      if (mounted) {
        setState(() => _visible = true);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(color: Colors.black.withOpacity(.35)),
          ),
        ),
        Center(
          child: AnimatedScale(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutBack,
            scale: _visible ? 1 : .8,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: _visible ? 1 : 0,
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.xl),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface.withOpacity(.92),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(.16),
                      blurRadius: 24,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 84,
                      height: 84,
                      decoration: const BoxDecoration(
                        color: AppColors.mint,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_rounded, color: Colors.white, size: 42),
                    ),
                    const SizedBox(height: AppSpacing.l),
                    Text(
                      'Success!',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: AppSpacing.s),
                    Text(
                      'Marked as settled.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).textTheme.bodyMedium?.color?.withOpacity(.72),
                          ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
