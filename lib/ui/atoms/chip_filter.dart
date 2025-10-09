import 'package:flutter/material.dart';
import '../tokens.dart';

class ChipFilter extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color tint;
  final EdgeInsetsGeometry padding;

  const ChipFilter({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.tint = AppColors.mint,
    this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
  });

  @override
  Widget build(BuildContext context) {
    final bg = selected ? tint.withOpacity(.16) : Colors.white.withOpacity(.75);
    final fg = selected ? tint.withOpacity(.95) : Colors.black87;
    final side = selected ? tint.withOpacity(.35) : Colors.black12;

    final chip = Container(
      padding: padding,
      decoration: ShapeDecoration(
        color: bg,
        shape: StadiumBorder(side: BorderSide(color: side)),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.fade,
        softWrap: false,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );

    final child = AppPerf.lowGpuMode
        ? chip
        : AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      padding: EdgeInsets.zero,
      decoration: const BoxDecoration(), // no extra decoration; just animate layout cheaply
      child: chip,
    );

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () {
            Feedback.forTap(context);
            onTap();
          },
          child: child,
        ),
      ),
    );
  }
}
