import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/auth_provider.dart';
import '../../../core/utils/date_range.dart';
import '../data/dealer.dart';
import '../data/dealer_repository.dart';
import '../data/dealer_visit.dart';
import '../data/dealer_visit_repository.dart';

final dealerRepositoryProvider = Provider<DealerRepository>(
  (ref) => DealerRepository(),
);

final dealerVisitRepositoryProvider = Provider<DealerVisitRepository>(
  (ref) => DealerVisitRepository(),
);

/// The shared active dealer master.
final dealersProvider = FutureProvider<List<Dealer>>((ref) async {
  return ref.watch(dealerRepositoryProvider).active();
});

/// A single dealer by id — backs the detail page.
final dealerByIdProvider = FutureProvider.family<Dealer?, String>((
  ref,
  dealerId,
) async {
  return ref.watch(dealerRepositoryProvider).byId(dealerId);
});

/// dealerId -> the rep's most recent visit to it.
final lastVisitByDealerProvider = FutureProvider<Map<String, DealerVisit>>((
  ref,
) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const {};
  return ref.watch(dealerVisitRepositoryProvider).lastVisitByDealer(uid);
});

/// Today's visits, oldest first.
final todayVisitsProvider = FutureProvider<List<DealerVisit>>((ref) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const [];
  return ref.watch(dealerVisitRepositoryProvider).today(uid);
});

final visitsForDateProvider = FutureProvider.family<List<DealerVisit>, String>((
  ref,
  dateKey,
) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const [];
  return ref.watch(dealerVisitRepositoryProvider).forDate(uid, dateKey);
});

final visitsInRangeProvider =
    FutureProvider.family<List<DealerVisit>, RangePreset>((ref, preset) async {
      final uid = ref.watch(currentUidProvider);
      if (uid == null) return const [];
      final (from, _) = preset.resolve();
      return ref.watch(dealerVisitRepositoryProvider).since(uid, from);
    });

/// Free-text filter over the dealer list, held here so it survives the sheet
/// opening and closing over the list.
final dealerSearchProvider = NotifierProvider<DealerSearchNotifier, String>(
  DealerSearchNotifier.new,
);

class DealerSearchNotifier extends Notifier<String> {
  @override
  String build() => '';
  void set(String query) => state = query;
  void clear() => state = '';
}

/// Optional type filter (retailer / distributor / manufacturer); null = all.
final dealerTypeFilterProvider =
    NotifierProvider<DealerTypeFilterNotifier, DealerType?>(
      DealerTypeFilterNotifier.new,
    );

class DealerTypeFilterNotifier extends Notifier<DealerType?> {
  @override
  DealerType? build() => null;

  /// Tapping the active chip clears the filter — the chip row doubles as the
  /// "show all" control, so there is no separate reset to hunt for.
  void toggle(DealerType? type) => state = state == type ? null : type;
}

/// The dealer list after search + type filters, in display order.
final filteredDealersProvider = Provider<List<Dealer>>((ref) {
  final all = ref.watch(dealersProvider).value ?? const <Dealer>[];
  final query = ref.watch(dealerSearchProvider);
  final type = ref.watch(dealerTypeFilterProvider);
  return all
      .where((d) => d.matches(query))
      .where((d) => type == null || d.type == type)
      .toList();
});
