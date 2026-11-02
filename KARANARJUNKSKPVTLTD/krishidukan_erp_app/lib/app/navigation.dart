import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/analytics/models.dart';
import '../features/auth/auth_repository.dart';

/// Re-created whenever the signed-in user changes, so the next person to log
/// in starts on Home with no leftover filters.
String? _uid(Ref ref) =>
    ref.watch(authStateProvider.select((a) => a.valueOrNull?.uid));

/// Bottom-bar tabs, in order.
enum AppTab { home, bills, dues, business, account }

/// Lives in a provider (not widget state) so any screen — e.g. a Home tile —
/// can switch tabs directly instead of making the user hunt for the section.
final currentTabProvider = StateProvider<AppTab>((ref) {
  _uid(ref);
  return AppTab.home;
});

/// Payment-status filter on the Bills tab. "Unpaid" spans both pending and
/// partly-paid bills — that's what an owner means by "who still owes me".
enum BillStatusFilter { all, unpaid, paid }

extension BillStatusFilterX on BillStatusFilter {
  String get label => switch (this) {
        BillStatusFilter.all => 'All',
        BillStatusFilter.unpaid => 'Unpaid',
        BillStatusFilter.paid => 'Paid',
      };

  bool matches(Bill b) => switch (this) {
        BillStatusFilter.all => true,
        BillStatusFilter.unpaid => b.paymentState != PaymentState.paid,
        BillStatusFilter.paid => b.paymentState == PaymentState.paid,
      };
}

final billStatusFilterProvider = StateProvider<BillStatusFilter>((ref) {
  _uid(ref);
  return BillStatusFilter.all;
});

/// Channel filter on the Bills tab. `null` = every channel.
final billChannelFilterProvider = StateProvider<Channel?>((ref) {
  _uid(ref);
  return null;
});

/// Jump to the Bills tab with a status filter already applied.
void openBills(WidgetRef ref,
    {BillStatusFilter status = BillStatusFilter.all, Channel? channel}) {
  ref.read(billStatusFilterProvider.notifier).state = status;
  ref.read(billChannelFilterProvider.notifier).state = channel;
  ref.read(currentTabProvider.notifier).state = AppTab.bills;
}
