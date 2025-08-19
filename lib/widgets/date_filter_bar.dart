import 'package:flutter/material.dart';

class DateFilterBar extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onChanged;

  const DateFilterBar({
    Key? key,
    required this.selected,
    required this.onChanged,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    const filters = ['Day', 'Week', 'Month', 'Quarter', 'Year', 'All'];
    return Wrap(
      spacing: 4,
      runSpacing: 2,
      children: filters.map((f) => ChoiceChip(
        label: Text(
          f,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        ),
        selected: selected == f,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
        visualDensity: VisualDensity.compact,
        onSelected: (v) {
          if (v) onChanged(f);
        },
      )).toList(),
    );
  }
}
