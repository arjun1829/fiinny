import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/router/app_router.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../../day_session/providers/day_session_providers.dart';
import '../data/dealer.dart';
import '../data/dealer_visit.dart';
import '../data/dealer_visit_repository.dart';
import '../providers/dealer_providers.dart';
import '../widgets/dealer_card.dart';
import '../widgets/dealer_form_sheet.dart';
import '../widgets/visit_form_sheet.dart';

class DealersScreen extends ConsumerWidget {
  const DealersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentSalesUserProvider);
    final dealersAsync = ref.watch(dealersProvider);
    final filtered = ref.watch(filteredDealersProvider);
    final lastVisits = ref.watch(lastVisitByDealerProvider).value ?? const {};
    final todayVisits = ref.watch(todayVisitsProvider).value ?? const [];
    final typeFilter = ref.watch(dealerTypeFilterProvider);
    final search = ref.watch(dealerSearchProvider);

    // Most recent visit today per dealer — drives the "visited today" strip.
    final todayByDealer = <String, DealerVisit>{};
    for (final v in todayVisits.reversed) {
      todayByDealer.putIfAbsent(v.dealerId, () => v);
    }

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Dealers'),
            Text(
              dealersAsync.hasValue
                  ? '${FormatUtils.plural(filtered.length, 'dealer')}'
                        ' · ${FormatUtils.plural(todayVisits.length, 'visit')} today'
                  : 'Loading…',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addDealer(context, ref),
        backgroundColor: AppColors.harvest,
        foregroundColor: Colors.black87,
        icon: const Icon(Icons.add_rounded),
        label: const Text(
          'Add Dealer',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        children: [
          // ── Search + type filter ──────────────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Column(
              children: [
                TextField(
                  onChanged: (v) =>
                      ref.read(dealerSearchProvider.notifier).set(v),
                  decoration: InputDecoration(
                    hintText: 'Search shop, owner, phone or area',
                    prefixIcon: const Icon(Icons.search_rounded, size: 20),
                    isDense: true,
                    suffixIcon: search.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.close_rounded, size: 18),
                            onPressed: () =>
                                ref.read(dealerSearchProvider.notifier).clear(),
                          ),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 32,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _FilterChip(
                        label: 'All',
                        selected: typeFilter == null,
                        onTap: () => ref
                            .read(dealerTypeFilterProvider.notifier)
                            .toggle(null),
                      ),
                      for (final t in DealerType.values)
                        _FilterChip(
                          label: t.label,
                          selected: typeFilter == t,
                          onTap: () => ref
                              .read(dealerTypeFilterProvider.notifier)
                              .toggle(t),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // ── List ──────────────────────────────────────────────────────────
          Expanded(
            child: dealersAsync.when(
              loading: () => const LoadingView(message: 'Loading dealers…'),
              error: (e, _) => ErrorView(
                message:
                    'Could not load the dealer list. '
                    'Check your connection and try again.',
                onRetry: () => ref.invalidate(dealersProvider),
              ),
              data: (all) {
                if (all.isEmpty) {
                  return EmptyView(
                    icon: Icons.storefront_outlined,
                    title: 'No dealers yet',
                    message:
                        'Add the retailers, distributors and manufacturers in '
                        'your territory to start logging visits.',
                    action: FilledButton.icon(
                      onPressed: () => _addDealer(context, ref),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(200, 48),
                      ),
                      icon: const Icon(Icons.add_rounded, size: 18),
                      label: const Text('Add your first dealer'),
                    ),
                  );
                }
                if (filtered.isEmpty) {
                  return const EmptyView(
                    icon: Icons.search_off_rounded,
                    title: 'No matches',
                    message: 'Try a different name, phone number or filter.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(dealersProvider);
                    ref.invalidate(lastVisitByDealerProvider);
                    ref.invalidate(todayVisitsProvider);
                    await ref.read(dealersProvider.future);
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, i) {
                      final dealer = filtered[i];
                      return DealerCard(
                        dealer: dealer,
                        canManage:
                            dealer.createdBy == user?.uid ||
                            (user?.isAdmin ?? false),
                        lastVisit: lastVisits[dealer.id],
                        todayVisit: todayByDealer[dealer.id],
                        onMarkVisited: () => _markVisited(context, ref, dealer),
                        onEdit: () => _editDealer(context, ref, dealer),
                        onDeactivate: () => _deactivate(context, ref, dealer),
                        onDetail: () =>
                            context.go('${Routes.dealers}/${dealer.id}'),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<void> _addDealer(BuildContext context, WidgetRef ref) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    // Grabbed before the first await: the sheet and the write both suspend, and
    // the context may be gone by the time we want to confirm the result.
    final messenger = ScaffoldMessenger.of(context);
    final draft = await DealerFormSheet.show(context);
    if (draft == null) return;
    try {
      await ref
          .read(dealerRepositoryProvider)
          .create(uid, draft.input, image: draft.image);
      ref.invalidate(dealersProvider);
      _toast(messenger, '${draft.input.shopName} added');
    } catch (_) {
      _toast(messenger, 'Could not save the dealer. Please try again.');
    }
  }

  Future<void> _editDealer(
    BuildContext context,
    WidgetRef ref,
    Dealer dealer,
  ) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final draft = await DealerFormSheet.show(context, initial: dealer);
    if (draft == null) return;
    try {
      final repo = ref.read(dealerRepositoryProvider);
      await repo.update(dealer.id, draft.input);
      if (draft.image != null) {
        await repo.attachImage(
          uid: uid,
          dealerId: dealer.id,
          image: draft.image!,
        );
      }
      ref.invalidate(dealersProvider);
      _toast(messenger, 'Dealer updated');
    } catch (_) {
      _toast(messenger, 'Could not update the dealer. Please try again.');
    }
  }

  Future<void> _deactivate(
    BuildContext context,
    WidgetRef ref,
    Dealer dealer,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(dealerRepositoryProvider).deactivate(dealer.id);
      ref.invalidate(dealersProvider);
      _toast(messenger, '${dealer.shopName} removed');
    } catch (_) {
      _toast(messenger, 'Could not remove the dealer. Please try again.');
    }
  }

  Future<void> _markVisited(
    BuildContext context,
    WidgetRef ref,
    Dealer dealer,
  ) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;

    final messenger = ScaffoldMessenger.of(context);
    final draft = await VisitFormSheet.show(context, dealer);
    if (draft == null) return;

    // Tie the visit to the open session and give it the next position in the
    // day's route, so the map and timeline can order stops without relying on
    // server timestamps that are not readable until the write comes back.
    final session = ref.read(currentSessionProvider).value;
    final repo = ref.read(dealerVisitRepositoryProvider);

    try {
      // Counted from a fresh read rather than the cached provider: two visits
      // logged in quick succession would otherwise both read the pre-refresh
      // count and land on the same sequence number, scrambling the route order.
      final todayCount = (await repo.today(uid)).length;

      await repo.markVisited(
        uid,
        MarkVisitInput(
          dealerId: dealer.id,
          dealerName: dealer.shopName,
          purpose: draft.purpose,
          purposeOther: draft.purposeOther,
          notes: draft.notes,
          geo: draft.geo,
          daySessionId: session?.isActive == true ? session!.id : null,
          visitSequence: todayCount + 1,
        ),
      );
      ref.invalidate(todayVisitsProvider);
      ref.invalidate(lastVisitByDealerProvider);
      ref.invalidate(visitsForDateProvider(IstDate.today()));
      _toast(messenger, 'Visit to ${dealer.shopName} recorded');
    } catch (_) {
      _toast(messenger, 'Could not record the visit. Please try again.');
    }
  }

  void _toast(ScaffoldMessengerState messenger, String message) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: selected ? AppColors.primary : AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: selected ? AppColors.primary : AppColors.divider,
              ),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : AppColors.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
