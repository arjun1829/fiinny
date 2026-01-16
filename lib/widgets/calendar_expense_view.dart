import 'package:flutter/material.dart';
import 'package:table_calendar/table_calendar.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';

class CalendarExpenseView extends StatefulWidget {
  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final DateTime focusedDay;
  final Function(DateTime selectedDay, DateTime focusedDay) onDaySelected;

  const CalendarExpenseView({
    Key? key,
    required this.expenses,
    this.incomes = const [],
    required this.focusedDay,
    required this.onDaySelected,
  }) : super(key: key);

  @override
  State<CalendarExpenseView> createState() => _CalendarExpenseViewState();
}

class _CalendarExpenseViewState extends State<CalendarExpenseView> {
  late DateTime _selectedDay;
  Map<DateTime, double> _dailyExpenseTotals = {};
  Map<DateTime, double> _dailyIncomeTotals = {};

  @override
  void initState() {
    super.initState();
    _selectedDay = widget.focusedDay;
    _generateDailyTotals();
  }

  @override
  void didUpdateWidget(covariant CalendarExpenseView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.expenses != widget.expenses ||
        oldWidget.incomes != widget.incomes) {
      _generateDailyTotals();
    }
    if (oldWidget.focusedDay != widget.focusedDay) {
      _selectedDay = widget.focusedDay;
    }
  }

  DateTime _d(DateTime x) => DateTime(x.year, x.month, x.day);

  void _generateDailyTotals() {
    _dailyExpenseTotals.clear();
    _dailyIncomeTotals.clear();
    for (var e in widget.expenses) {
      final date = _d(e.date);
      _dailyExpenseTotals[date] = (_dailyExpenseTotals[date] ?? 0) + e.amount;
    }
    for (var i in widget.incomes) {
      final date = _d(i.date);
      _dailyIncomeTotals[date] = (_dailyIncomeTotals[date] ?? 0) + i.amount;
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          // Row(
          //   mainAxisAlignment: MainAxisAlignment.end,
          //   children: [
          //     IconButton(
          //       icon: const Icon(
          //         Icons.today_rounded,
          //         color: Colors.teal,
          //         size: 24,
          //       ),
          //       tooltip: "Pick Date",
          //       onPressed: () async {
          //         final picked = await showDatePicker(
          //           context: context,
          //           initialDate: widget.focusedDay,
          //           firstDate: DateTime(2000),
          //           lastDate: DateTime(2100),
          //         );
          //         if (picked != null) {
          //           widget.onDaySelected(picked, picked);
          //         }
          //       },
          //     ),
          //   ],
          // ),
          TableCalendar(
            focusedDay: widget.focusedDay,
            firstDay: DateTime(2000),
            lastDay: DateTime(2100),
            calendarFormat: CalendarFormat.month,
            availableCalendarFormats: const {
              CalendarFormat.month: 'Month',
            },
            selectedDayPredicate: (day) {
              return isSameDay(_selectedDay, day);
            },
            onDaySelected: (selectedDay, focusedDay) {
              setState(() {
                _selectedDay = selectedDay;
              });
              widget.onDaySelected(selectedDay, focusedDay);
            },
            calendarBuilders: CalendarBuilders(
              defaultBuilder: (context, date, focusedDay) {
                final key = _d(date);
                final expTotal = _dailyExpenseTotals[key] ?? 0;
                final incTotal = _dailyIncomeTotals[key] ?? 0;
                return Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${date.day}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        if (expTotal > 0)
                          Text(
                            '-₹${expTotal.toStringAsFixed(0)}',
                            style: TextStyle(
                              fontSize: 9.5,
                              color: Colors.red[400],
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        if (incTotal > 0)
                          Text(
                            '+₹${incTotal.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontSize: 9.5,
                              color: Colors.green,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
              todayBuilder: (context, date, focusedDay) {
                final key = _d(date);
                final expTotal = _dailyExpenseTotals[key] ?? 0;
                final incTotal = _dailyIncomeTotals[key] ?? 0;
                return Container(
                  decoration: BoxDecoration(
                    color: Colors.teal[100],
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '${date.day}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.black,
                              fontSize: 13,
                            ),
                          ),
                          if (expTotal > 0)
                            Text(
                              '-₹${expTotal.toStringAsFixed(0)}',
                              style: TextStyle(
                                fontSize: 9.5,
                                color: Colors.red[800],
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          if (incTotal > 0)
                            Text(
                              '+₹${incTotal.toStringAsFixed(0)}',
                              style: TextStyle(
                                fontSize: 9.5,
                                color: Colors.green[800],
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
              selectedBuilder: (context, date, focusedDay) {
                final key = _d(date);
                final expTotal = _dailyExpenseTotals[key] ?? 0;
                final incTotal = _dailyIncomeTotals[key] ?? 0;
                return Container(
                  decoration: const BoxDecoration(
                    color: Colors.black87,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '${date.day}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                              fontSize: 13,
                            ),
                          ),
                          if (expTotal > 0)
                            Text(
                              '-₹${expTotal.toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontSize: 9.5,
                                color: Colors.redAccent,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          if (incTotal > 0)
                            Text(
                              '+₹${incTotal.toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontSize: 9.5,
                                color: Colors.greenAccent,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
