import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/theme.dart';
import '../core/format.dart';

/// Decimal input that never accepts more than one dot or a minus sign —
/// quantities, rates and amounts in this ERP are never negative.
final decimalInput = <TextInputFormatter>[
  FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,3}')),
];

double parseAmount(String s) => double.tryParse(s.trim()) ?? 0;

/// Formats a number for an editable field: "12" not "12.0".
String editNum(double v) {
  if (v == 0) return '';
  return v == v.roundToDouble() ? v.toInt().toString() : v.toString();
}

/// Quantity display: whole numbers without decimals.
String fmtQty(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

/// Rupees with paise — invoices and totals, where rounding to the rupee
/// (fmtInr) would hide real money.
String fmtInr2(num n) {
  final sign = n < 0 ? '-' : '';
  final v = n.abs();
  final whole = fmtInr(v.floor()).replaceFirst('₹', '');
  final paise = ((v - v.floor()) * 100).round().clamp(0, 99);
  return '$sign₹$whole.${paise.toString().padLeft(2, '0')}';
}

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(text.toUpperCase(), style: kMicro),
      );
}

class AmountField extends StatelessWidget {
  const AmountField({
    super.key,
    required this.controller,
    required this.label,
    this.prefix = '₹ ',
    this.onChanged,
    this.helper,
    this.autofocus = false,
    this.enabled = true,
  });

  final TextEditingController controller;
  final String label;
  final String? prefix;
  final ValueChanged<String>? onChanged;
  final String? helper;
  final bool autofocus;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      autofocus: autofocus,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: decimalInput,
      style: kTabular.copyWith(fontSize: 15),
      decoration: InputDecoration(
        labelText: label,
        prefixText: prefix,
        helperText: helper,
        isDense: true,
      ),
      onChanged: onChanged,
    );
  }
}

/// Wide "save" bar pinned above the keyboard/gesture area on form screens.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child, this.top});

  final Widget child;
  final Widget? top;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (top != null) ...[top!, const SizedBox(height: 10)],
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class BusyButton extends StatelessWidget {
  const BusyButton({
    super.key,
    required this.label,
    required this.busy,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final bool busy;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
      ),
      onPressed: busy ? null : onPressed,
      icon: busy
          ? SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: AppColors.inkMute),
            )
          : Icon(icon ?? Icons.check_rounded, size: 19),
      label: Text(busy ? 'Saving…' : label),
    );
  }
}

/// Label ↔ value row used in summaries and invoice detail.
class KvRow extends StatelessWidget {
  const KvRow(this.label, this.value,
      {super.key, this.color, this.bold = false, this.size = 13});

  final String label;
  final String value;
  final Color? color;
  final bool bold;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label,
                style: TextStyle(
                    color: bold ? AppColors.ink : AppColors.inkDim,
                    fontSize: size - 0.5,
                    fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: kTabular.copyWith(
                fontSize: size,
                fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                color: color ?? AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(text.toUpperCase(),
            style: kMicro.copyWith(color: color, fontSize: 9.5)),
      );
}

/// Choice chips in the app's lime-pill style.
class ChoiceRow extends StatelessWidget {
  const ChoiceRow({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  final List<String> options;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          ChoiceChip(
            label: Text(o),
            selected: o == selected,
            onSelected: (_) => onSelected(o),
            showCheckmark: false,
            labelStyle: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
              color: o == selected ? AppColors.accentInk : AppColors.inkDim,
            ),
            selectedColor: AppColors.accent,
            backgroundColor: AppColors.surface,
            side: BorderSide(
                color: o == selected ? AppColors.accent : AppColors.border),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
      ],
    );
  }
}

/// Shows an error SnackBar with consistent styling.
void showError(BuildContext context, Object message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(message.toString()),
    backgroundColor: AppColors.critical,
  ));
}

void showInfo(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

/// Confirm-before-leaving for forms with unsaved input.
Future<bool> confirmDiscard(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Discard this bill?'),
      content: const Text('Items and details you entered will be lost.'),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep editing')),
        TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Discard', style: TextStyle(color: AppColors.critical))),
      ],
    ),
  );
  return ok ?? false;
}
