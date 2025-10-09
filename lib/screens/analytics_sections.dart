// lib/screens/analytics_sections.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// App tokens (kept tiny & neutral)
const kAccent = Color(0xFF159E8A); // agreed accent
const kIncome = Colors.green;
const kExpense = Colors.red;

/// KPI: simple count/value box (e.g., "Transactions: 120")
class KpiBox extends StatelessWidget {
  final String title;
  final String value;
  const KpiBox({super.key, required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.15),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            "$title: ",
            style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600),
          ),
          Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

/// KPI: currency value with arrow/icon (e.g., "Income: ₹10,000")
class KpiMoney extends StatelessWidget {
  final String title;
  final double value;
  final Color? colorOverride;

  const KpiMoney({
    super.key,
    required this.title,
    required this.value,
    this.colorOverride,
  });

  @override
  Widget build(BuildContext context) {
    final inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
    final txt = inr0.format(value);
    final color = colorOverride ?? (title == "Expense" ? kExpense : kIncome);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.15),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(title == "Expense" ? Icons.arrow_upward : Icons.arrow_downward, color: color, size: 18),
          const SizedBox(width: 6),
          Text(
            "$title: ",
            style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600),
          ),
          Text(txt, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

/// KPI: small currency value (e.g., "Avg Expense: ₹532")
class KpiSmall extends StatelessWidget {
  final String title;
  final double value;

  const KpiSmall({super.key, required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    final inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Colors.white.withOpacity(0.10),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text("$title: ",
              style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
          Text(inr0.format(value),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Tappable badge/chip with icon & label
class TapBadge extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  const TapBadge({
    super.key,
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(100),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(100),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white.withOpacity(0.28), Colors.white.withOpacity(0.10)],
          ),
          border: Border.all(color: Colors.white.withOpacity(0.25)),
          boxShadow: [BoxShadow(color: color.withOpacity(0.12), blurRadius: 14, offset: const Offset(0, 6))],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 280),
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: color, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
