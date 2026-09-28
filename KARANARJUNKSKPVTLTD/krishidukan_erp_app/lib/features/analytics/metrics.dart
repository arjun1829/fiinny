import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/time_range.dart';
import 'analytics_repository.dart';
import 'models.dart';

final timeRangeProvider = StateProvider<TimeRange>((_) => TimeRange.month);

/// Set only when [timeRangeProvider] is [TimeRange.custom]; null otherwise.
final customDateWindowProvider =
    StateProvider<(DateTime, DateTime)?>((_) => null);

final dateWindowProvider = Provider<DateWindow>((ref) {
  final range = ref.watch(timeRangeProvider);
  final custom = ref.watch(customDateWindowProvider);
  return DateWindow.forRange(range,
      customFrom: custom?.$1, customTo: custom?.$2);
});

class SalesMetrics {
  const SalesMetrics({
    required this.total,
    required this.byChannel,
    required this.countByChannel,
    required this.billCount,
    required this.collected,
    required this.outstanding,
    required this.paidCount,
    required this.partialCount,
    required this.pendingCount,
    required this.trend,
    required this.topCustomers,
  });

  final double total;
  final Map<Channel, double> byChannel;
  final Map<Channel, int> countByChannel;
  final int billCount;
  final double collected;
  final double outstanding;
  final int paidCount;
  final int partialCount;
  final int pendingCount;
  final List<DailyPoint> trend;
  final List<NamedAmount> topCustomers;

  double get average => billCount == 0 ? 0 : total / billCount;

  /// The leading channel, restricted to [visible] — a channel this tenant's
  /// business tier doesn't deal in (e.g. B2B for a retailer, with no tile of
  /// its own) should never surface as "top" just because one stray bill
  /// landed in it.
  Channel? topChannelAmong(Set<Channel> visible) {
    final candidates = byChannel.entries
        .where((e) => visible.contains(e.key))
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    if (candidates.isEmpty || candidates.first.value <= 0) return null;
    return candidates.first.key;
  }
}

SalesMetrics computeMetrics(List<Bill> bills) {
  final byChannel = {for (final c in Channel.values) c: 0.0};
  final countByChannel = {for (final c in Channel.values) c: 0};
  final daily = <DateTime, List<double>>{};
  final customers = <String, double>{};

  var total = 0.0, collected = 0.0, outstanding = 0.0;
  var paid = 0, partial = 0, pending = 0;

  for (final b in bills) {
    total += b.amount;
    byChannel[b.channel] = byChannel[b.channel]! + b.amount;
    countByChannel[b.channel] = countByChannel[b.channel]! + 1;
    collected += b.amountPaid;
    outstanding += b.outstanding;

    switch (b.paymentState) {
      case PaymentState.paid:
        paid++;
      case PaymentState.partial:
        partial++;
      case PaymentState.pending:
        pending++;
    }

    final day = DateTime(b.date.year, b.date.month, b.date.day);
    final slot = daily.putIfAbsent(day, () => [0, 0, 0]);
    slot[b.channel.index] += b.amount;

    customers[b.customerName] = (customers[b.customerName] ?? 0) + b.amount;
  }

  final trend = daily.entries
      .map((e) => DailyPoint(e.key, e.value[0], e.value[1], e.value[2]))
      .toList()
    ..sort((a, b) => a.date.compareTo(b.date));

  final topCustomers = customers.entries
      .map((e) => NamedAmount(e.key, e.value))
      .toList()
    ..sort((a, b) => b.amount.compareTo(a.amount));

  return SalesMetrics(
    total: total,
    byChannel: byChannel,
    countByChannel: countByChannel,
    billCount: bills.length,
    collected: collected,
    outstanding: outstanding,
    paidCount: paid,
    partialCount: partial,
    pendingCount: pending,
    trend: trend,
    topCustomers: topCustomers.take(5).toList(),
  );
}

final filteredBillsProvider = Provider<List<Bill>>((ref) {
  final bills = ref.watch(billsProvider).valueOrNull ?? const [];
  final window = ref.watch(dateWindowProvider);
  return bills.where((b) => window.contains(b.date)).toList();
});

final metricsProvider = Provider<SalesMetrics>(
  (ref) => computeMetrics(ref.watch(filteredBillsProvider)),
);

/// Supplier purchases/payments totalled for the selected time window — the
/// balance-sheet fields on PositionSnapshot itself stay all-time, matching the
/// web's "Position metrics — always all-time" split.
class SupplierFlowTotals {
  const SupplierFlowTotals(this.purchases, this.payments);
  final double purchases;
  final double payments;
}

final supplierFlowProvider = Provider<SupplierFlowTotals>((ref) {
  final position = ref.watch(positionProvider).valueOrNull;
  if (position == null) return const SupplierFlowTotals(0, 0);
  final window = ref.watch(dateWindowProvider);
  final purchases = position.purchaseFlow
      .where((d) => window.contains(d.date))
      .fold<double>(0, (s, d) => s + d.amount);
  final payments = position.paymentFlow
      .where((d) => window.contains(d.date))
      .fold<double>(0, (s, d) => s + d.amount);
  return SupplierFlowTotals(purchases, payments);
});
