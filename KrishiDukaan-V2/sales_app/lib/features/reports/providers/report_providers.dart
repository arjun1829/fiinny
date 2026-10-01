import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/date_range.dart';
import '../../../core/utils/ist_date.dart';
import '../../attendance/providers/attendance_providers.dart';
import '../../day_session/providers/day_session_providers.dart';
import '../../dealers/data/dealer_visit.dart';
import '../../dealers/providers/dealer_providers.dart';
import '../../expenses/providers/expense_providers.dart';

final reportRangeProvider = NotifierProvider<ReportRangeNotifier, RangePreset>(
  ReportRangeNotifier.new,
);

class ReportRangeNotifier extends Notifier<RangePreset> {
  @override
  RangePreset build() => RangePreset.thisMonth;
  void set(RangePreset preset) => state = preset;
}

/// Everything the Reports tab shows, computed from the rep's own records.
///
/// Deliberately derived on the device rather than from a precomputed summary
/// document: a rep only ever sees their own data, the ranges are at most 31
/// days, and the alternative is a Cloud Function whose output would go stale
/// the moment a visit is logged.
class SalesReport {
  final RangePreset range;
  final int visitCount;
  final int dealersCovered;
  final int daysWorked;
  final int totalMinutes;
  final double totalDistanceKm;
  final double expenseTotal;
  final double expensePending;

  /// Visits keyed by IST date — drives the per-day bars.
  final Map<String, int> visitsByDate;

  /// Visit counts per purpose, largest first.
  final List<MapEntry<String, int>> visitsByPurpose;

  const SalesReport({
    required this.range,
    required this.visitCount,
    required this.dealersCovered,
    required this.daysWorked,
    required this.totalMinutes,
    required this.totalDistanceKm,
    required this.expenseTotal,
    required this.expensePending,
    required this.visitsByDate,
    required this.visitsByPurpose,
  });

  /// Average visits on days the rep actually worked — dividing by calendar days
  /// instead would punish them for weekends and make the number meaningless.
  double get visitsPerWorkingDay =>
      daysWorked == 0 ? 0 : visitCount / daysWorked;

  bool get isEmpty => visitCount == 0 && daysWorked == 0 && expenseTotal == 0;
}

final salesReportProvider = FutureProvider<SalesReport>((ref) async {
  final range = ref.watch(reportRangeProvider);
  final (_, to) = range.resolve();

  final sessions = await ref.watch(sessionsInRangeProvider(range).future);
  final allVisits = await ref.watch(visitsInRangeProvider(range).future);
  final attendance = await ref.watch(attendanceInRangeProvider(range).future);
  final expenses = await ref.watch(expensesInRangeProvider(range).future);

  // visitsInRange fetches from the range start with no upper bound (one index,
  // one query), so clip the tail here rather than adding a second query.
  final visits = <DealerVisit>[
    for (final v in allVisits)
      if (v.visitedAt != null && _dateKeyOf(v).compareTo(to) <= 0) v,
  ];

  final byDate = <String, int>{};
  final byPurpose = <String, int>{};
  final dealers = <String>{};
  for (final v in visits) {
    final key = _dateKeyOf(v);
    byDate[key] = (byDate[key] ?? 0) + 1;
    byPurpose[v.purposeLabel] = (byPurpose[v.purposeLabel] ?? 0) + 1;
    if (v.dealerId.isNotEmpty) dealers.add(v.dealerId);
  }

  final purposes = byPurpose.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));

  // A day counts as worked if it was marked present/half-day OR a session was
  // opened for it — a rep who forgot to touch attendance still worked.
  final workedDays = <String>{
    for (final a in attendance)
      if (a.status.isWorking) a.date,
    for (final s in sessions)
      if (s.date.isNotEmpty) s.date,
  };

  final totals = ExpenseTotals.of(expenses);

  return SalesReport(
    range: range,
    visitCount: visits.length,
    dealersCovered: dealers.length,
    daysWorked: workedDays.length,
    totalMinutes: sessions.fold<int>(
      0,
      (sum, s) => sum + (s.totalWorkingMinutes ?? 0),
    ),
    totalDistanceKm: sessions.fold<double>(
      0,
      (sum, s) => sum + (s.totalDistanceKm ?? 0),
    ),
    expenseTotal: totals.total,
    expensePending: totals.pending,
    visitsByDate: byDate,
    visitsByPurpose: purposes,
  );
});

String _dateKeyOf(DealerVisit v) =>
    v.visitedAt == null ? '' : IstDate.key(v.visitedAt!);
