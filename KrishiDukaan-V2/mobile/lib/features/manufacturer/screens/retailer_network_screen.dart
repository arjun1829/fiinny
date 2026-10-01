import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';
import '../../dashboard/providers/dashboard_provider.dart';
import '../../../core/utils/web_links.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/network_retailer_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/services/places_service.dart';
import '../../../core/utils/phone_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../data/manufacturer_repository.dart';
import '../providers/manufacturer_provider.dart';

class RetailerNetworkScreen extends ConsumerWidget {
  const RetailerNetworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) =>
          const Scaffold(body: ErrorView(message: 'Not logged in.')),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: ErrorView(message: 'Not logged in.'));
        }
        return _NetworkBody(
            manufacturerPhone: user.phone, manufacturerName: user.name);
      },
    );
  }
}

class _NetworkBody extends ConsumerStatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  const _NetworkBody(
      {required this.manufacturerPhone, required this.manufacturerName});

  @override
  ConsumerState<_NetworkBody> createState() => _NetworkBodyState();
}

class _NetworkBodyState extends ConsumerState<_NetworkBody> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  // Reveal-more pagination — a manufacturer with a large network (e.g. 280+
  // retailers) only pays the render cost for what's actually shown instead
  // of the whole list mounting at once. Resets whenever the search query
  // changes so "Show more" always starts fresh against the new filter.
  static const _kPageSize = 20;
  int _revealCount = _kPageSize;

  /// Retailer phones picked for a bulk action. Empty means normal browsing —
  /// selection mode only appears once something is selected, so the ordinary
  /// tap-to-open flow is unchanged.
  final Set<String> _selected = {};

  /// Whether the list is in multi-select mode. Kept separate from
  /// [_selected] being non-empty so "Select" can show the checkboxes with
  /// nothing yet chosen — web renders its row checkboxes unconditionally,
  /// and auto-picking a row to enter the mode would be one mis-tap away from
  /// bulk-deactivating the wrong retailer.
  bool _selectionMode = false;
  bool _bulkRunning = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  /// Runs [action] over every selected retailer, then refreshes.
  ///
  /// Failures are counted rather than aborting the run: with 20 retailers
  /// selected, one bad row must not silently leave the rest unprocessed with
  /// no indication of how far it got.
  Future<void> _runBulk(
    List<NetworkRetailerModel> all,
    String label,
    Future<void> Function(NetworkRetailerModel) action,
  ) async {
    final targets =
        all.where((r) => _selected.contains(r.phone)).toList(growable: false);
    if (targets.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('$label ${targets.length} retailer'
            '${targets.length == 1 ? '' : 's'}?'),
        content: Text(
          '$label will be applied to the selected retailer'
          '${targets.length == 1 ? '' : 's'}.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(label),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _bulkRunning = true);
    var ok = 0;
    var failed = 0;
    for (final r in targets) {
      try {
        await action(r);
        ok++;
      } catch (_) {
        failed++;
      }
    }
    if (!mounted) return;
    setState(() {
      _bulkRunning = false;
      _selected.clear();
      _selectionMode = false;
    });
    ref.invalidate(retailerNetworkProvider(widget.manufacturerPhone));
    ref.invalidate(seatStatsProvider(widget.manufacturerPhone));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(failed == 0
            ? '$label applied to $ok retailer${ok == 1 ? '' : 's'}.'
            : '$label applied to $ok, failed for $failed.'),
        backgroundColor: failed == 0 ? AppColors.primary : AppColors.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final networkAsync =
        ref.watch(retailerNetworkProvider(widget.manufacturerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Retailer Network',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add, color: Colors.white),
            onPressed: () => _showAddSheet(context, ref),
          ),
        ],
      ),
      body: networkAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (_, _) =>
            const ErrorView(message: 'Could not load network.'),
        data: (retailers) {
          if (retailers.isEmpty) {
            return EmptyState(
              title: 'No retailers yet',
              subtitle: 'Add retailers to start assigning products',
              icon: Icons.group_outlined,
              actionLabel: 'Add Retailer',
              onAction: () => _showAddSheet(context, ref),
            );
          }
          final q = _query.trim().toLowerCase();
          final filtered = q.isEmpty
              ? retailers
              : retailers
                  .where((r) =>
                      r.shopName.toLowerCase().contains(q) ||
                      r.ownerName.toLowerCase().contains(q) ||
                      r.phone.toLowerCase().contains(q))
                  .toList();
          final visible = filtered.take(_revealCount).toList();
          final hasMore = _revealCount < filtered.length;

          return Column(
            children: [
              // Seat awareness — web's retailers page shows "N of M seats
              // remaining" here because every assignment consumes one, and
              // running out is the most common reason an assign silently
              // fails. The app showed nothing at all.
              Consumer(
                builder: (context, ref, _) {
                  final stats =
                      ref.watch(seatStatsProvider(widget.manufacturerPhone));
                  return stats.maybeWhen(
                    data: (s) {
                      final none = s.available <= 0;
                      return Container(
                        width: double.infinity,
                        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: (none ? Colors.orange : AppColors.primary)
                              .withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: (none ? Colors.orange : AppColors.primary)
                                .withValues(alpha: 0.35),
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              none
                                  ? Icons.error_outline
                                  : Icons.event_seat_outlined,
                              size: 18,
                              color: none
                                  ? Colors.orange.shade800
                                  : AppColors.primary,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                none
                                    ? 'No seats remaining — buy more to assign products.'
                                    : '${s.available} of ${s.totalPurchased} seats remaining',
                                style: AppTextStyles.bodySmall.copyWith(
                                  color: none
                                      ? Colors.orange.shade900
                                      : AppColors.onSurface,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            TextButton(
                              onPressed: () =>
                                  context.push('/dashboard/subscription'),
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8),
                                minimumSize: const Size(0, 30),
                                tapTargetSize:
                                    MaterialTapTargetSize.shrinkWrap,
                              ),
                              child: Text(none ? 'Buy seats' : 'Manage'),
                            ),
                          ],
                        ),
                      );
                    },
                    orElse: () => const SizedBox.shrink(),
                  );
                },
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: (v) => setState(() {
                    _query = v;
                    _revealCount = _kPageSize;
                  }),
                  decoration: InputDecoration(
                    hintText: 'Search retailers by name or phone...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchCtrl.clear();
                              setState(() {
                                _query = '';
                                _revealCount = _kPageSize;
                              });
                            },
                          )
                        : null,
                    isDense: true,
                    filled: true,
                    fillColor: AppColors.surfaceVariant,
                    contentPadding: const EdgeInsets.symmetric(
                        vertical: 10, horizontal: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${filtered.length} retailer${filtered.length != 1 ? 's' : ''}'
                        '${q.isNotEmpty ? ' match "$_query"' : ''}',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.onSurfaceVariant),
                      ),
                    ),
                    // Multi-select needs a visible way in. It used to be
                    // long-press only, with no affordance at all — the feature
                    // was there but undiscoverable. Web shows a checkbox on
                    // every row plus a select-all, so this exposes the same
                    // two things in the space a phone actually has.
                    Builder(builder: (_) {
                      // Revoked retailers aren't selectable, matching web.
                      final selectable = filtered
                          .where((r) => r.status != 'revoked')
                          .toList(growable: false);
                      final allSelected = selectable.isNotEmpty &&
                          selectable.every((r) => _selected.contains(r.phone));
                      if (!_selectionMode) {
                        return TextButton.icon(
                          onPressed: selectable.isEmpty
                              ? null
                              : () => setState(() => _selectionMode = true),
                          icon: const Icon(Icons.checklist_rounded, size: 16),
                          label: const Text('Select'),
                          style: TextButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            foregroundColor: AppColors.primary,
                          ),
                        );
                      }
                      return TextButton.icon(
                        onPressed: () => setState(() {
                          if (allSelected) {
                            // Second tap on "Clear all" leaves the mode too,
                            // so there's always a way back out.
                            _selected.clear();
                            _selectionMode = false;
                          } else {
                            _selected
                              ..clear()
                              ..addAll(selectable.map((r) => r.phone));
                          }
                        }),
                        icon: Icon(
                          allSelected
                              ? Icons.remove_done_rounded
                              : Icons.done_all_rounded,
                          size: 16,
                        ),
                        label: Text(allSelected ? 'Clear all' : 'Select all'),
                        style: TextButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          foregroundColor: AppColors.primary,
                        ),
                      );
                    }),
                  ],
                ),
              ),
              if (_selected.isNotEmpty)
                Container(
                  margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Text(
                        '${_selected.length} selected',
                        style: AppTextStyles.bodySmall
                            .copyWith(fontWeight: FontWeight.w700),
                      ),
                      const Spacer(),
                      if (_bulkRunning)
                        const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else ...[
                        TextButton(
                          onPressed: () => _runBulk(
                            retailers,
                            'Deactivate',
                            (r) => ManufacturerRepository()
                                .deactivateNetworkRetailer(
                              inviteDocId: r.id,
                              retailerDocId: r.retailerDocId.isNotEmpty
                                  ? r.retailerDocId
                                  : r.phone,
                              manufacturerId:
                                  FirebaseAuth.instance.currentUser?.uid ?? '',
                              manufacturerPhone: widget.manufacturerPhone,
                            ),
                          ),
                          child: const Text('Deactivate'),
                        ),
                        TextButton(
                          onPressed: () => _runBulk(
                            retailers,
                            'Reactivate',
                            (r) => ManufacturerRepository()
                                .reactivateNetworkRetailer(
                              inviteDocId: r.id,
                              retailerDocId: r.retailerDocId.isNotEmpty
                                  ? r.retailerDocId
                                  : r.phone,
                              manufacturerPhone: widget.manufacturerPhone,
                            ),
                          ),
                          child: const Text('Reactivate'),
                        ),
                        IconButton(
                          tooltip: 'Clear selection',
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: () => setState(() {
                            _selected.clear();
                            _selectionMode = false;
                          }),
                        ),
                      ],
                    ],
                  ),
                ),
              Expanded(
                child: visible.isEmpty
                    ? Center(
                        child: Text(
                          'No retailers match "$_query"',
                          style: AppTextStyles.bodyMedium
                              .copyWith(color: AppColors.onSurfaceVariant),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: visible.length + (hasMore ? 1 : 0),
                        itemBuilder: (_, i) {
                          if (i == visible.length) {
                            return Padding(
                              padding: const EdgeInsets.only(top: 4, bottom: 12),
                              child: OutlinedButton(
                                onPressed: () => setState(() {
                                  _revealCount += _kPageSize;
                                }),
                                child: Text(
                                  'Show ${(filtered.length - _revealCount).clamp(0, _kPageSize)} more',
                                ),
                              ),
                            );
                          }
                          final r = visible[i];
                          final selected = _selected.contains(r.phone);
                          return _RetailerTile(
                            retailer: r,
                            manufacturerPhone: widget.manufacturerPhone,
                            selected: selected,
                            // Long-press still works as a shortcut; the
                            // Select button above is the discoverable way in.
                            selectionMode: _selectionMode,
                            // Revoked retailers can't be bulk-acted on, so
                            // they can't be selected either — same rule web
                            // applies when it renders its row checkboxes.
                            onToggleSelected: r.status == 'revoked'
                                ? null
                                : () => setState(() {
                                      _selectionMode = true;
                                      if (selected) {
                                        _selected.remove(r.phone);
                                      } else {
                                        _selected.add(r.phone);
                                      }
                                    }),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddSheet(context, ref),
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.person_add, color: Colors.white),
      ),
    );
  }

  void _showAddSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddRetailerSheet(
        manufacturerPhone: widget.manufacturerPhone,
        manufacturerName: widget.manufacturerName,
        onAdded: () =>
            ref.invalidate(retailerNetworkProvider(widget.manufacturerPhone)),
      ),
    );
  }
}

class _RetailerTile extends ConsumerWidget {
  final NetworkRetailerModel retailer;
  final String manufacturerPhone;
  final bool selected;
  final bool selectionMode;
  final VoidCallback? onToggleSelected;
  const _RetailerTile({
    required this.retailer,
    required this.manufacturerPhone,
    this.selected = false,
    this.selectionMode = false,
    this.onToggleSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusColor = switch (retailer.status) {
      'active' => AppColors.success,
      'invited' => AppColors.secondary,
      _ => AppColors.onSurfaceVariant,
    };

    final addedDateStr = retailer.createdAt != null
        ? DateFormat('MMM d, y, h:mm a').format(retailer.createdAt!)
        : '—';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: selected
            ? const BorderSide(color: AppColors.primary, width: 2)
            : BorderSide.none,
      ),
      elevation: 2,
      // Long-press enters selection mode; once in it, a tap toggles. Keeping
      // plain tap free preserves the existing open-details behaviour.
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onLongPress: onToggleSelected,
        onTap: selectionMode ? onToggleSelected : null,
        child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (selectionMode)
                  Padding(
                    padding: const EdgeInsets.only(right: 10),
                    child: Icon(
                      selected
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      color: selected
                          ? AppColors.primary
                          : AppColors.onSurfaceVariant,
                      size: 20,
                    ),
                  ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(retailer.shopName,
                          style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(height: 2),
                      Text('Owner: ${retailer.ownerName}',
                          style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.onSurfaceVariant)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: statusColor.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    retailer.status[0].toUpperCase() +
                        retailer.status.substring(1),
                    style: AppTextStyles.caption.copyWith(
                        color: statusColor,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const Divider(height: 20),
            Row(
              children: [
                const Icon(Icons.phone_outlined, size: 16, color: AppColors.onSurfaceVariant),
                const SizedBox(width: 8),
                Text(retailer.phone, style: AppTextStyles.bodyMedium),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.phone, size: 18, color: AppColors.primary),
                  onPressed: () => launchUrl(Uri.parse('tel:${retailer.phone}')),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            if (retailer.email != null && retailer.email!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.email_outlined, size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Text(retailer.email!, style: AppTextStyles.bodyMedium),
                ],
              ),
            ],
            if (retailer.city != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Text(
                    [retailer.city, retailer.state]
                        .whereType<String>()
                        .join(', '),
                    style: AppTextStyles.bodyMedium,
                  ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.calendar_month_outlined, size: 16, color: AppColors.onSurfaceVariant),
                const SizedBox(width: 8),
                Text('Added: $addedDateStr', style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
              ],
            ),
            if (retailer.isInvited && retailer.inviteCode.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.secondaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.secondary.withValues(alpha: 0.2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.key_outlined, size: 16, color: AppColors.secondary),
                        const SizedBox(width: 6),
                        Text('Invite Code: ${retailer.inviteCode}',
                            style: AppTextStyles.bodyMedium.copyWith(
                                fontFamily: 'monospace', fontWeight: FontWeight.bold)),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.copy, size: 16),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: retailer.inviteCode));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Invite code copied')),
                            );
                          },
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text('Invite Actions:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        ElevatedButton.icon(
                          onPressed: () => _copyInviteLink(context),
                          icon: const Icon(Icons.link, size: 14),
                          label: const Text('Copy link', style: TextStyle(fontSize: 11)),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () => _shareOnWhatsApp(context),
                          icon: const Icon(Icons.share, size: 14),
                          label: const Text('WhatsApp', style: TextStyle(fontSize: 11)),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () => _shareViaEmail(context),
                          icon: const Icon(Icons.email, size: 14),
                          label: const Text('Email', style: TextStyle(fontSize: 11)),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (retailer.status == 'active' && retailer.onboardingStatus == 'active')
                  FilledButton.icon(
                    onPressed: () => context.push(
                      '/dashboard/manufacturer/assign?retailerPhone=${retailer.phone}',
                    ),
                    icon: const Icon(Icons.assignment_outlined, size: 16),
                    label: const Text('Assign Product'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    ),
                  ),
                const SizedBox(width: 8),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert),
                  onSelected: (val) => _handleMenuAction(context, val, ref),
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: 'details',
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, size: 18),
                          SizedBox(width: 8),
                          Text('Details'),
                        ],
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'edit',
                      child: Row(
                        children: [
                          Icon(Icons.edit_outlined, size: 18),
                          SizedBox(width: 8),
                          Text('Edit'),
                        ],
                      ),
                    ),
                    if (retailer.status == 'active' && retailer.onboardingStatus == 'active')
                      const PopupMenuItem(
                        value: 'deactivate',
                        child: Row(
                          children: [
                            Icon(Icons.block, size: 18, color: AppColors.error),
                            SizedBox(width: 8),
                            Text('Deactivate', style: TextStyle(color: AppColors.error)),
                          ],
                        ),
                      )
                    else if (retailer.status == 'active' && retailer.onboardingStatus == 'inactive')
                      const PopupMenuItem(
                        value: 'reactivate',
                        child: Row(
                          children: [
                            Icon(Icons.check_circle_outline, size: 18, color: AppColors.success),
                            SizedBox(width: 8),
                            Text('Reactivate', style: TextStyle(color: AppColors.success)),
                          ],
                        ),
                      ),
                    const PopupMenuItem(
                      value: 'remove',
                      child: Row(
                        children: [
                          Icon(Icons.delete_outline, size: 18, color: AppColors.error),
                          SizedBox(width: 8),
                          Text('Remove', style: TextStyle(color: AppColors.error)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
      ),
    );
  }

  void _handleMenuAction(BuildContext context, String action, WidgetRef ref) {
    final uid = ref.read(currentUserProvider).value?.uid ?? '';
    switch (action) {
      case 'details':
        _showDetailsDialog(context);
        break;
      case 'edit':
        _showEditSheet(context, ref);
        break;
      case 'deactivate':
        _confirm(
          context,
          'Deactivate ${retailer.shopName}?',
          () async {
            await ManufacturerRepository().deactivateNetworkRetailer(
              inviteDocId: retailer.id,
              retailerDocId: retailer.phone,
              manufacturerId: uid,
              manufacturerPhone: manufacturerPhone,
            );
            ref.invalidate(retailerNetworkProvider(manufacturerPhone));
          },
        );
        break;
      case 'reactivate':
        _confirm(
          context,
          'Reactivate ${retailer.shopName}?',
          () async {
            await ManufacturerRepository().reactivateNetworkRetailer(
              inviteDocId: retailer.id,
              retailerDocId: retailer.phone,
              manufacturerPhone: manufacturerPhone,
            );
            ref.invalidate(retailerNetworkProvider(manufacturerPhone));
          },
        );
        break;
      case 'remove':
        _confirm(
          context,
          'Remove ${retailer.shopName} from network?',
          () async {
            await ManufacturerRepository().removeNetworkRetailer(
              inviteDocId: retailer.id,
              retailerDocId: retailer.phone,
              manufacturerId: uid,
              manufacturerPhone: manufacturerPhone,
            );
            ref.invalidate(retailerNetworkProvider(manufacturerPhone));
          },
        );
        break;
    }
  }

  void _showDetailsDialog(BuildContext context) {
    final addedDateStr = retailer.createdAt != null
        ? DateFormat('MMM d, y, h:mm a').format(retailer.createdAt!)
        : '—';
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(retailer.shopName, style: const TextStyle(fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _infoRow(Icons.person_outline, 'Owner Name', retailer.ownerName),
              _infoRow(Icons.phone_outlined, 'Phone', retailer.phone),
              if (retailer.email != null && retailer.email!.isNotEmpty)
                _infoRow(Icons.mail_outline, 'Email', retailer.email!),
              _infoRow(Icons.info_outline, 'Status', retailer.status.toUpperCase()),
              _infoRow(Icons.hourglass_empty, 'Onboarding Status', retailer.onboardingStatus.toUpperCase()),
              if (retailer.inviteCode.isNotEmpty)
                _infoRow(Icons.key_outlined, 'Invite Code', retailer.inviteCode),
              _infoRow(Icons.calendar_today_outlined, 'Added', addedDateStr),
              if (retailer.city != null)
                _infoRow(Icons.location_city_outlined, 'Address', '${retailer.city}, ${retailer.state ?? ""}'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12)),
                Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showEditSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _EditRetailerSheet(
        manufacturerPhone: manufacturerPhone,
        retailer: retailer,
        onUpdated: () => ref.invalidate(retailerNetworkProvider(manufacturerPhone)),
      ),
    );
  }

  Future<void> _shareOnWhatsApp(BuildContext context) async {
    final inviteLink = WebLinks.invite(retailer.inviteCode);
    final msg = 'Hey! I invite you to join my retailer network on Krishi Dukaan. '
        'Use my invite code: ${retailer.inviteCode} or sign up using this link: $inviteLink';
    final url = Uri.parse("https://wa.me/?text=${Uri.encodeComponent(msg)}");
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not launch WhatsApp')),
        );
      }
    }
  }

  Future<void> _shareViaEmail(BuildContext context) async {
    final inviteLink = WebLinks.invite(retailer.inviteCode);
    final subject = 'Invitation to join Krishi Dukaan Retailer Network';
    final body = 'Hey!\n\nI invite you to join my retailer network on Krishi Dukaan.\n\n'
        'Use my invite code: ${retailer.inviteCode} or sign up using this link:\n$inviteLink';
    final url = Uri.parse("mailto:?subject=${Uri.encodeComponent(subject)}&body=${Uri.encodeComponent(body)}");
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not launch Email client')),
        );
      }
    }
  }

  void _copyInviteLink(BuildContext context) {
    final inviteLink = WebLinks.invite(retailer.inviteCode);
    Clipboard.setData(ClipboardData(text: inviteLink));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Invite link copied!'),
        backgroundColor: AppColors.primary,
      ),
    );
  }

  void _confirm(
      BuildContext context, String msg, VoidCallback onConfirm) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm'),
        content: Text(msg),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.error),
            onPressed: () {
              Navigator.pop(ctx);
              onConfirm();
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }
}

class _EditRetailerSheet extends StatefulWidget {
  final String manufacturerPhone;
  final NetworkRetailerModel retailer;
  final VoidCallback onUpdated;
  const _EditRetailerSheet({
    required this.manufacturerPhone,
    required this.retailer,
    required this.onUpdated,
  });

  @override
  State<_EditRetailerSheet> createState() => _EditRetailerSheetState();
}

class _EditRetailerSheetState extends State<_EditRetailerSheet> {
  late final _shopNameCtrl = TextEditingController(text: widget.retailer.shopName);
  late final _ownerNameCtrl = TextEditingController(text: widget.retailer.ownerName);
  late final _phoneCtrl = TextEditingController(text: PhoneUtils.toDisplay(widget.retailer.phone));
  late final _emailCtrl = TextEditingController(text: widget.retailer.email ?? '');
  // Address was editable on web's modal but had no fields here at all, so a
  // retailer added from the app could never have their address corrected.
  late final _line1Ctrl =
      TextEditingController(text: widget.retailer.line1 ?? '');
  late final _cityCtrl = TextEditingController(text: widget.retailer.city ?? '');
  late final _stateCtrl = TextEditingController(text: widget.retailer.state ?? '');
  late final _pincodeCtrl =
      TextEditingController(text: widget.retailer.pincode ?? '');
  final _mapsLinkCtrl = TextEditingController();
  bool _saving = false;
  bool _locating = false;
  bool _parsingLink = false;
  bool _showMapsLinkField = false;
  late GeoPoint? _geo = widget.retailer.geo;

  @override
  void dispose() {
    _shopNameCtrl.dispose();
    _ownerNameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _line1Ctrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _pincodeCtrl.dispose();
    _mapsLinkCtrl.dispose();
    super.dispose();
  }

  /// Same flow as _NewRetailerFormState._useCurrentLocation — matches web's
  /// edit-retailer-modal handleUseCurrentLocation (Use current location).
  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Location permission denied')),
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      final details = await PlacesService.reverseGeocode(
          pos.latitude, pos.longitude, AppConfig.googleMapsApiKey);
      if (mounted) {
        setState(() {
          _geo = GeoPoint(pos.latitude, pos.longitude);
          if (details != null) {
            if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
            if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
            if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
            if (details.formattedAddress?.isNotEmpty == true) {
              _line1Ctrl.text = details.formattedAddress!;
            }
          }
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Location error: $e')));
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  /// Same flow as _NewRetailerFormState._parseMapsLink — matches web's
  /// "Paste Google Maps link — pins location from a shared URL".
  Future<void> _parseMapsLink() async {
    final url = _mapsLinkCtrl.text.trim();
    if (url.isEmpty) return;
    setState(() => _parsingLink = true);
    try {
      ({double lat, double lng})? coords;
      if (url.contains('goo.gl') || url.contains('maps.app')) {
        coords = await PlacesService.resolveShortUrl(url);
      } else {
        coords = PlacesService.parseMapsUrl(url);
      }
      if (coords == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Could not parse location from that link')),
          );
        }
        return;
      }
      final details = await PlacesService.reverseGeocode(
          coords.lat, coords.lng, AppConfig.googleMapsApiKey);
      if (mounted) {
        setState(() {
          _geo = GeoPoint(coords!.lat, coords.lng);
          if (details != null) {
            if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
            if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
            if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
            if (details.formattedAddress?.isNotEmpty == true) {
              _line1Ctrl.text = details.formattedAddress!;
            }
          }
          _mapsLinkCtrl.clear();
          _showMapsLinkField = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _parsingLink = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Edit Retailer', style: AppTextStyles.heading2),
          const SizedBox(height: 16),
          TextField(
            controller: _shopNameCtrl,
            decoration: InputDecoration(
              labelText: 'Shop Name *',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _ownerNameCtrl,
            decoration: InputDecoration(
              labelText: 'Owner Name *',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          // Read-only: the phone identifies this retailer across seat
          // listings and every assigned product copy. Web's edit modal makes
          // it immutable for the same reason; showing it enabled here implied
          // an edit that silently broke those references.
          TextField(
            controller: _phoneCtrl,
            enabled: false,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'Phone Number',
              helperText: "Phone can't be changed after the retailer is added",
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              prefixText: '+91 ',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _line1Ctrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Street / Locality',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _cityCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'City',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _stateCtrl,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: 'State',
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _pincodeCtrl,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  decoration: InputDecoration(
                    labelText: 'Pincode',
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // ── Location helpers — same flow as the Add Retailer form, kept
          // out of it before: an existing retailer could never be re-pinned
          // or moved on a map after creation. ──
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _locating ? null : _useCurrentLocation,
                  icon: _locating
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location, size: 16),
                  label: const Text('Use current location',
                      style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    side: const BorderSide(color: AppColors.primary),
                    foregroundColor: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      setState(() => _showMapsLinkField = !_showMapsLinkField),
                  icon: const Icon(Icons.link, size: 16),
                  label: const Text('Paste Maps link',
                      style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    side: BorderSide(
                        color: _showMapsLinkField
                            ? AppColors.primary
                            : AppColors.divider),
                    foregroundColor: _showMapsLinkField
                        ? AppColors.primary
                        : AppColors.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
          if (_showMapsLinkField) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _mapsLinkCtrl,
                    keyboardType: TextInputType.url,
                    decoration: InputDecoration(
                      hintText:
                          'https://maps.google.com/maps?q=18.52,73.85 or share link…',
                      border:
                          OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _parsingLink ? null : _parseMapsLink,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  ),
                  child: _parsingLink
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Go'),
                ),
              ],
            ),
          ],
          if (_geo != null) ...[
            const SizedBox(height: 12),
            _LocationPreviewMap(geo: _geo!),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary),
              child: _saving
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white))
                  : const Text('Save Changes'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final shop = _shopNameCtrl.text.trim();
    final owner = _ownerNameCtrl.text.trim();
    if (shop.isEmpty || owner.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Shop name and owner name are required.')),
      );
      return;
    }

    // The phone is NOT editable here, matching web's edit-retailer modal.
    //
    // It identifies the retailer everywhere: retailerSeatListings and every
    // assigned product copy carry it as retailerDocId. Changing it rewrote
    // the retailer doc but left those references pointing at the old value,
    // so a retailer's assigned products silently vanished from the Assign
    // Products view on BOTH platforms. Keeping it immutable removes the
    // failure mode rather than papering over it with a migration.
    //
    // (This also used to call PhoneUtils.normalize BEFORE isValid and outside
    // the try — normalize throws on bad input, so typing a short number threw
    // an uncaught FormatException instead of showing the friendly message.)
    final phone = widget.retailer.phone;

    setState(() => _saving = true);
    try {
      await ManufacturerRepository().updateNetworkRetailer(
        inviteDocId: widget.retailer.id,
        retailerDocId: widget.retailer.phone,
        shopName: shop,
        ownerName: owner,
        phone: phone,
        email: _emailCtrl.text.trim(),
        manufacturerPhone: widget.manufacturerPhone,
        line1: _line1Ctrl.text,
        city: _cityCtrl.text,
        state: _stateCtrl.text,
        pincode: _pincodeCtrl.text,
        geo: _geo,
      );
      widget.onUpdated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

// ─── Add Retailer Sheet ──────────────────────────────────────────────────────

class _AddRetailerSheet extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  final VoidCallback onAdded;
  const _AddRetailerSheet({
    required this.manufacturerPhone,
    required this.manufacturerName,
    required this.onAdded,
  });

  @override
  State<_AddRetailerSheet> createState() => _AddRetailerSheetState();
}

class _AddRetailerSheetState extends State<_AddRetailerSheet> {
  int _tab = 0; // 0 = New Retailer, 1 = Link Existing
  String? _inviteCode; // set after successful add

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.of(context).size.height;
    return Container(
      height: screenH * 0.92,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: _inviteCode != null
          ? _SuccessView(
              inviteCode: _inviteCode!,
              onDone: () => Navigator.pop(context),
            )
          : Column(
              children: [
                // Drag handle
                const SizedBox(height: 10),
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.divider,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                // Title + subtitle
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Add Retailer', style: AppTextStyles.heading2),
                      const SizedBox(height: 2),
                      Text(
                        'Creates a retailer profile and generates a signup invite link.',
                        style: AppTextStyles.bodySmall
                            .copyWith(color: AppColors.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                // Tab bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    children: [
                      _TabButton(
                        label: 'New Retailer',
                        selected: _tab == 0,
                        onTap: () => setState(() => _tab = 0),
                      ),
                      const SizedBox(width: 8),
                      _TabButton(
                        label: 'Link Existing',
                        selected: _tab == 1,
                        onTap: () => setState(() => _tab = 1),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                const Divider(height: 1),
                // Content
                Expanded(
                  child: _tab == 0
                      ? _NewRetailerForm(
                          manufacturerPhone: widget.manufacturerPhone,
                          manufacturerName: widget.manufacturerName,
                          onAdded: (code) {
                            widget.onAdded();
                            setState(() => _inviteCode = code);
                          },
                        )
                      : _LinkExistingForm(
                          manufacturerPhone: widget.manufacturerPhone,
                          manufacturerName: widget.manufacturerName,
                          onLinked: () {
                            widget.onAdded();
                            Navigator.pop(context);
                          },
                        ),
                ),
              ],
            ),
    );
  }
}

class _TabButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _TabButton(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary
              : AppColors.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: AppTextStyles.bodyMedium.copyWith(
            color: selected ? Colors.white : AppColors.primary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

// ─── New Retailer Form ────────────────────────────────────────────────────────

class _NewRetailerForm extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  final void Function(String inviteCode) onAdded;
  const _NewRetailerForm({
    required this.manufacturerPhone,
    required this.manufacturerName,
    required this.onAdded,
  });

  @override
  State<_NewRetailerForm> createState() => _NewRetailerFormState();
}

class _NewRetailerFormState extends State<_NewRetailerForm> {
  final _shopNameCtrl = TextEditingController();
  final _line1Ctrl = TextEditingController();
  final _ownerNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _mapsSearchCtrl = TextEditingController();
  final _mapsLinkCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();

  bool _saving = false;
  bool _loadingSuggestions = false;
  bool _locating = false;
  bool _parsingLink = false;
  bool _showMapsLinkField = false;
  List<PlaceSuggestion> _suggestions = [];
  Timer? _debounce;
  // Pinned via search selection, "Use current location", or a pasted Maps
  // link — this is the actual GeoPoint saved on the retailer, matching
  // web's edit-retailer-modal (geo state). The address text fields are just
  // a display/edit convenience layered on top.
  GeoPoint? _geo;

  @override
  void dispose() {
    _shopNameCtrl.dispose();
    _ownerNameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _mapsSearchCtrl.dispose();
    _mapsLinkCtrl.dispose();
    _line1Ctrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _pincodeCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onMapsSearchChanged(String v) {
    _debounce?.cancel();
    if (v.trim().isEmpty) {
      setState(() => _suggestions = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      if (!mounted) return;
      setState(() => _loadingSuggestions = true);
      final results = await PlacesService.autocomplete(
          v, AppConfig.googleMapsApiKey);
      if (mounted) setState(() { _suggestions = results; _loadingSuggestions = false; });
    });
  }

  Future<void> _selectSuggestion(PlaceSuggestion s) async {
    setState(() {
      _mapsSearchCtrl.text = s.description;
      _suggestions = [];
      _loadingSuggestions = true;
    });
    final details = await PlacesService.getDetails(
        s.placeId, AppConfig.googleMapsApiKey);
    if (!mounted) return;
    if (details != null) {
      setState(() {
        if (_shopNameCtrl.text.isEmpty && details.name.isNotEmpty) {
          _shopNameCtrl.text = details.name;
        }
        if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
        if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
        if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
        if (details.lat != null && details.lng != null) {
          _geo = GeoPoint(details.lat!, details.lng!);
        }
      });
    }
    setState(() => _loadingSuggestions = false);
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Location permission denied')),
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      final details = await PlacesService.reverseGeocode(
          pos.latitude, pos.longitude, AppConfig.googleMapsApiKey);
      if (mounted) {
        setState(() {
          _geo = GeoPoint(pos.latitude, pos.longitude);
          if (details != null) {
            if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
            if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
            if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
            _mapsSearchCtrl.text = details.formattedAddress ?? '';
          }
          _suggestions = [];
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Location error: $e')));
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _parseMapsLink() async {
    final url = _mapsLinkCtrl.text.trim();
    if (url.isEmpty) return;
    setState(() => _parsingLink = true);
    try {
      ({double lat, double lng})? coords;
      if (url.contains('goo.gl') || url.contains('maps.app')) {
        coords = await PlacesService.resolveShortUrl(url);
      } else {
        coords = PlacesService.parseMapsUrl(url);
      }
      if (coords == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Could not parse location from that link')),
          );
        }
        return;
      }
      final details = await PlacesService.reverseGeocode(
          coords.lat, coords.lng, AppConfig.googleMapsApiKey);
      if (mounted) {
        setState(() {
          _geo = GeoPoint(coords!.lat, coords.lng);
          if (details != null) {
            if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
            if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
            if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
            if (_shopNameCtrl.text.isEmpty && details.name.isNotEmpty) {
              _shopNameCtrl.text = details.name;
            }
            _mapsSearchCtrl.text = details.formattedAddress ?? '';
          }
          _mapsLinkCtrl.clear();
          _showMapsLinkField = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _parsingLink = false);
    }
  }

  Future<void> _save() async {
    final shop = _shopNameCtrl.text.trim();
    final owner = _ownerNameCtrl.text.trim();
    final rawPhone = _phoneCtrl.text.trim();
    if (shop.isEmpty || owner.isEmpty || rawPhone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Shop name, owner name and phone are required')),
      );
      return;
    }
    // isValid FIRST: PhoneUtils.normalize throws a FormatException on bad
    // input, and it used to be called before this check and outside any try —
    // so typing a short number crashed instead of showing this message.
    if (!PhoneUtils.isValid(rawPhone)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter a valid 10-digit mobile number starting 6-9'),
        ),
      );
      return;
    }
    final phone = PhoneUtils.normalize(rawPhone);
    setState(() => _saving = true);
    try {
      final code = await ManufacturerRepository().addRetailer(
        manufacturerPhone: widget.manufacturerPhone,
        manufacturerName: widget.manufacturerName,
        shopName: shop,
        ownerName: owner,
        retailerPhone: phone,
        email: _emailCtrl.text.trim().isNotEmpty ? _emailCtrl.text.trim() : null,
        line1:
            _line1Ctrl.text.trim().isNotEmpty ? _line1Ctrl.text.trim() : null,
        city: _cityCtrl.text.trim().isNotEmpty ? _cityCtrl.text.trim() : null,
        state: _stateCtrl.text.trim().isNotEmpty ? _stateCtrl.text.trim() : null,
        pincode: _pincodeCtrl.text.trim().isNotEmpty ? _pincodeCtrl.text.trim() : null,
        geo: _geo,
      );
      widget.onAdded(code);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, kb + 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Shop name
          TextField(
            controller: _shopNameCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Shop name *',
              hintText: 'Retailer shop name',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          // Owner name
          TextField(
            controller: _ownerNameCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Owner name *',
              hintText: 'Owner or contact person',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          // Phone — digits-only, capped at 10, with a live counter, matching
          // web's add-retailer form. Immutable once saved (see the edit sheet),
          // so it's worth getting right at entry.
          TextField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Phone *',
              hintText: '10-digit mobile number',
              helperText: "Can't be changed after the retailer is added",
              counterText: '${_phoneCtrl.text.length}/10',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              prefixText: '+91 ',
            ),
          ),
          const SizedBox(height: 16),
          // Email
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: 'Email (optional)',
              hintText: 'retailer@example.com',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 20),

          // ── Google Maps search section ──────────────────────────────────
          Row(
            children: [
              const Icon(Icons.location_on, size: 16, color: AppColors.primary),
              const SizedBox(width: 6),
              Text(
                'Search shop on Google Maps — auto-fills name & address',
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _mapsSearchCtrl,
            decoration: InputDecoration(
              hintText: 'Type shop name or address (e.g. Ramesh Agro Store Pune)',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _loadingSuggestions
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : _mapsSearchCtrl.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () => setState(() {
                            _mapsSearchCtrl.clear();
                            _suggestions = [];
                          }),
                        )
                      : null,
            ),
            onChanged: _onMapsSearchChanged,
          ),
          // Suggestions dropdown
          if (_suggestions.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.divider),
                borderRadius: BorderRadius.circular(8),
                boxShadow: const [
                  BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, 2))
                ],
              ),
              child: Column(
                children: _suggestions.take(5).map((s) {
                  return InkWell(
                    onTap: () => _selectSuggestion(s),
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      child: Row(
                        children: [
                          const Icon(Icons.place_outlined,
                              size: 16,
                              color: AppColors.onSurfaceVariant),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(s.description,
                                style: AppTextStyles.bodySmall),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          const SizedBox(height: 10),

          // Location action row
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _locating ? null : _useCurrentLocation,
                  icon: _locating
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location, size: 16),
                  label: const Text('Use current location',
                      style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    side: const BorderSide(color: AppColors.primary),
                    foregroundColor: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      setState(() => _showMapsLinkField = !_showMapsLinkField),
                  icon: const Icon(Icons.link, size: 16),
                  label: const Text('Paste Maps link',
                      style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    side: BorderSide(
                        color: _showMapsLinkField
                            ? AppColors.primary
                            : AppColors.divider),
                    foregroundColor: _showMapsLinkField
                        ? AppColors.primary
                        : AppColors.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
          // Paste Maps link field
          if (_showMapsLinkField) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _mapsLinkCtrl,
                    keyboardType: TextInputType.url,
                    decoration: InputDecoration(
                      hintText:
                          'https://maps.google.com/maps?q=18.52,73.85 or share link…',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      isDense: true,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _parsingLink ? null : _parseMapsLink,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                  ),
                  child: _parsingLink
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Go'),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          TextField(
            controller: _line1Ctrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Street / Locality',
              hintText: 'Shop no., street, area',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),

          // ── City / State / Pincode row ──────────────────────────────────
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextField(
                  controller: _cityCtrl,
                  decoration: InputDecoration(
                    labelText: 'City',
                    hintText: 'City',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: TextField(
                  controller: _stateCtrl,
                  decoration: InputDecoration(
                    labelText: 'State',
                    hintText: 'State',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextField(
                  controller: _pincodeCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'PIN',
                    hintText: 'PIN',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
          if (_geo != null) ...[
            const SizedBox(height: 16),
            _LocationPreviewMap(geo: _geo!),
          ],
          const SizedBox(height: 20),

          // ── Action buttons ──────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: AppColors.divider),
                    foregroundColor: AppColors.onSurfaceVariant,
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _saving
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Add Retailer'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Small non-interactive map preview showing exactly where a pinned
/// location will save — shared by the Add and Edit retailer forms. Mirrors
/// web's edit-retailer-modal "Location pinned · lat, lng" badge + embedded
/// map preview.
class _LocationPreviewMap extends StatelessWidget {
  final GeoPoint geo;
  const _LocationPreviewMap({required this.geo});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.location_on, size: 14, color: AppColors.primary),
              const SizedBox(width: 4),
              Text(
                'Location pinned · ${geo.latitude.toStringAsFixed(5)}, '
                '${geo.longitude.toStringAsFixed(5)}',
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.primary, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            height: 160,
            child: IgnorePointer(
              child: GoogleMap(
                initialCameraPosition: CameraPosition(
                  target: LatLng(geo.latitude, geo.longitude),
                  zoom: 15,
                ),
                markers: {
                  Marker(
                    markerId: const MarkerId('pinned'),
                    position: LatLng(geo.latitude, geo.longitude),
                  ),
                },
                zoomControlsEnabled: false,
                myLocationButtonEnabled: false,
                mapToolbarEnabled: false,
                scrollGesturesEnabled: false,
                rotateGesturesEnabled: false,
                tiltGesturesEnabled: false,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Link Existing Form ───────────────────────────────────────────────────────

class _LinkExistingForm extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  final VoidCallback onLinked;
  const _LinkExistingForm({
    required this.manufacturerPhone,
    required this.manufacturerName,
    required this.onLinked,
  });

  @override
  State<_LinkExistingForm> createState() => _LinkExistingFormState();
}

class _LinkExistingFormState extends State<_LinkExistingForm> {
  final _searchCtrl = TextEditingController();
  List<Map<String, dynamic>> _results = [];
  Map<String, dynamic>? _selected;
  bool _searching = false;
  bool _linking = false;
  Timer? _debounce;

  @override
  void dispose() {
    _searchCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() { _results = []; _selected = null; });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 500), () async {
      if (!mounted) return;
      setState(() { _searching = true; _selected = null; });
      try {
        final res = await ManufacturerRepository()
            .searchRegisteredRetailers(v.trim());
        if (mounted) setState(() { _results = res; _searching = false; });
      } catch (_) {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  Future<void> _link() async {
    final u = _selected;
    if (u == null) return;
    setState(() => _linking = true);
    try {
      await ManufacturerRepository().linkExistingRetailer(
        manufacturerPhone: widget.manufacturerPhone,
        manufacturerName: widget.manufacturerName,
        retailerPhone: u['phone'] as String? ?? u['id'] as String,
        shopName: u['shopName'] as String? ?? u['name'] as String? ?? '',
        ownerName: u['name'] as String? ?? '',
        email: u['email'] as String?,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                '${u['shopName'] ?? u['name'] ?? 'Retailer'} linked to your network'),
            backgroundColor: AppColors.success,
          ),
        );
        widget.onLinked();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _linking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, kb + 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Search for a retailer who already has a KrishiDukan account and link them to your network.',
            style: AppTextStyles.body
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search by name, shop, or phone…',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : _searchCtrl.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () => setState(() {
                            _searchCtrl.clear();
                            _results = [];
                            _selected = null;
                          }),
                        )
                      : null,
            ),
            onChanged: _onSearchChanged,
          ),
          const SizedBox(height: 4),

          // Results dropdown
          if (_results.isNotEmpty && _selected == null)
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.divider),
                borderRadius: BorderRadius.circular(8),
                boxShadow: const [
                  BoxShadow(
                      color: Colors.black12,
                      blurRadius: 4,
                      offset: Offset(0, 2))
                ],
              ),
              child: Column(
                children: _results.map((u) {
                  final shop = u['shopName'] as String? ?? '';
                  final name = u['name'] as String? ?? '';
                  final phone = u['phone'] as String? ?? u['id'] as String;
                  return InkWell(
                    onTap: () => setState(() {
                      _selected = u;
                      _results = [];
                      _searchCtrl.text = shop.isNotEmpty ? shop : name;
                    }),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      child: Row(
                        children: [
                          const Icon(Icons.store_outlined,
                              size: 18,
                              color: AppColors.onSurfaceVariant),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  shop.isNotEmpty ? shop : name,
                                  style: AppTextStyles.bodyMedium,
                                ),
                                if (name.isNotEmpty && shop.isNotEmpty)
                                  Text(name, style: AppTextStyles.caption),
                                Text(phone, style: AppTextStyles.caption),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

          // No results
          if (!_searching &&
              _searchCtrl.text.trim().length >= 2 &&
              _results.isEmpty &&
              _selected == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Row(
                children: [
                  const Icon(Icons.info_outline,
                      size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No registered retailers found for "${_searchCtrl.text.trim()}".',
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),

          // Selected retailer card
          if (_selected != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle,
                      color: AppColors.primary, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (_selected!['shopName'] as String?)?.isNotEmpty ==
                                  true
                              ? _selected!['shopName'] as String
                              : _selected!['name'] as String? ?? '',
                          style: AppTextStyles.bodyMedium
                              .copyWith(fontWeight: FontWeight.w600),
                        ),
                        if ((_selected!['name'] as String?)?.isNotEmpty == true)
                          Text(_selected!['name'] as String,
                              style: AppTextStyles.caption),
                        Text(
                          _selected!['phone'] as String? ??
                              _selected!['id'] as String,
                          style: AppTextStyles.caption,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () => setState(() {
                      _selected = null;
                      _searchCtrl.clear();
                    }),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: AppColors.divider),
                    foregroundColor: AppColors.onSurfaceVariant,
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton(
                  onPressed: (_selected != null && !_linking) ? _link : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    disabledBackgroundColor:
                        AppColors.primary.withValues(alpha: 0.4),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _linking
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Link to Network'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Success view (shown after New Retailer is added) ─────────────────────────

class _SuccessView extends StatelessWidget {
  final String inviteCode;
  final VoidCallback onDone;
  const _SuccessView({required this.inviteCode, required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, color: AppColors.success, size: 64),
          const SizedBox(height: 16),
          Text('Retailer Added!', style: AppTextStyles.heading2),
          const SizedBox(height: 8),
          Text(
            'Share this invite code with the retailer:',
            style: AppTextStyles.body
                .copyWith(color: AppColors.onSurfaceVariant),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: inviteCode));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content: Text('Copied!'),
                    backgroundColor: AppColors.primary),
              );
            },
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.primary),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    inviteCode,
                    style: AppTextStyles.heading2.copyWith(
                      letterSpacing: 4,
                      fontFamily: 'monospace',
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Icon(Icons.copy, color: AppColors.primary, size: 20),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onDone,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              child: const Text('Done'),
            ),
          ),
        ],
      ),
    );
  }
}
