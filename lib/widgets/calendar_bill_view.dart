import 'package:flutter/material.dart';
import 'package:table_calendar/table_calendar.dart';
import '../models/bill_model.dart';

class CalendarBillView extends StatelessWidget {
  final List<BillModel> bills;
  final void Function(DateTime, List<BillModel>)? onDaySelected; // Optional callback

  const CalendarBillView({
    Key? key,
    required this.bills,
    this.onDaySelected,
  }) : super(key: key);

  // Groups bills by due date (yyyy-mm-dd)
  Map<DateTime, List<BillModel>> _billsByDay() {
    final map = <DateTime, List<BillModel>>{};
    for (final bill in bills) {
      final date = DateTime(bill.dueDate.year, bill.dueDate.month, bill.dueDate.day);
      map.putIfAbsent(date, () => []).add(bill);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final billEvents = _billsByDay();

    return TableCalendar<BillModel>(
      firstDay: DateTime.now().subtract(const Duration(days: 180)),
      lastDay: DateTime.now().add(const Duration(days: 365)),
      focusedDay: DateTime.now(),
      eventLoader: (day) => billEvents[DateTime(day.year, day.month, day.day)] ?? [],
      calendarStyle: CalendarStyle(
        markerDecoration: BoxDecoration(
          color: Colors.orange,
          shape: BoxShape.circle,
        ),
        todayDecoration: BoxDecoration(
          color: Colors.teal.withValues(alpha: 0.7),
          shape: BoxShape.circle,
        ),
        selectedDecoration: BoxDecoration(
          color: Colors.green[400],
          shape: BoxShape.circle,
        ),
      ),
      calendarBuilders: CalendarBuilders(
        markerBuilder: (context, date, events) {
          if (events.isEmpty) return null;
          return Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(events.length, (idx) {
              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 1.2),
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (events[idx]).isOverdue
                      ? Colors.red
                      : Colors.orange,
                ),
              );
            }),
          );
        },
      ),
      onDaySelected: (selected, focused) {
        if (onDaySelected != null) {
          final key = DateTime(selected.year, selected.month, selected.day);
          onDaySelected!(selected, billEvents[key] ?? []);
        }
      },
    );
  }
}
