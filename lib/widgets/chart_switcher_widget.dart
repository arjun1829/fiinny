import 'package:flutter/material.dart';

class ChartSwitcherWidget extends StatelessWidget {
  final String chartType; // "Pie" or "Bar"
  final String dataType; // "All", "Income", "Expense"
  final ValueChanged<String> onChartTypeChanged;
  final ValueChanged<String> onDataTypeChanged;

  const ChartSwitcherWidget({
    Key? key,
    required this.chartType,
    required this.dataType,
    required this.onChartTypeChanged,
    required this.onDataTypeChanged,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        ToggleButtons(
          children: [Icon(Icons.pie_chart), Icon(Icons.bar_chart)],
          isSelected: [chartType == "Pie", chartType == "Bar"],
          onPressed: (i) {
            onChartTypeChanged(i == 0 ? "Pie" : "Bar");
          },
        ),
        SizedBox(width: 12),
        ToggleButtons(
          children: [Text("All"), Text("Income"), Text("Expense")],
          isSelected: [
            dataType == "All",
            dataType == "Income",
            dataType == "Expense"
          ],
          onPressed: (i) {
            onDataTypeChanged(
                i == 0 ? "All" : (i == 1 ? "Income" : "Expense"));
          },
        ),
      ],
    );
  }
}
