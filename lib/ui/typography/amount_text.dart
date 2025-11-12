import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Displays a currency/amount string with tabular numerals and bold styling.
class AmountText extends StatelessWidget {
  const AmountText(
    this.value, {
    super.key,
    this.color,
    this.baseStyle,
    this.prefix = '₹',
    this.decimalDigits = 2,
  });

  final double value;
  final Color? color;
  final TextStyle? baseStyle;
  final String prefix;
  final int decimalDigits;

  @override
  Widget build(BuildContext context) {
    final style = (baseStyle ?? Theme.of(context).textTheme.titleMedium)?.copyWith(
      fontWeight: FontWeight.w800,
      color: color ?? baseStyle?.color ?? Theme.of(context).colorScheme.onSurface,
      fontFeatures: const [ui.FontFeature.tabularFigures()],
    );
    return Text(
      '$prefix${value.toStringAsFixed(decimalDigits)}',
      style: style,
    );
  }
}
