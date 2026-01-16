import 'package:flutter/material.dart';

const _periods = [
  "Today",
  "Yesterday",
  "Last 2 Days",
  "Last 5 Days",
  "This Week",
  "This Month",
  "All Time",
];

class TxFilterBar extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onSelect;

  const TxFilterBar(
      {super.key, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text(
              "Choose Period",
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ),
          ..._periods.map((period) => ListTile(
                leading: selected == period
                    ? Icon(Icons.check_circle, color: Colors.teal)
                    : Icon(Icons.circle_outlined, color: Colors.grey[400]),
                title: Text(period,
                    style: TextStyle(
                        fontWeight: selected == period
                            ? FontWeight.bold
                            : FontWeight.normal)),
                onTap: () => onSelect(period),
              )),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
