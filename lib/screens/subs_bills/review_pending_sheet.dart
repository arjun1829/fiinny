// lib/screens/subs_bills/review_pending_sheet.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/subscriptions/subscriptions_service.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'package:lifemap/ui/glass/glass_card.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';
import 'package:lifemap/screens/subs_bills/widgets/brand_avatar_registry.dart';

/// Flip true if you have `createdAt` + composite index.
/// Keep false for “just work” mode.
const bool kTryOrderByCreatedAt = false;

/// Set true temporarily if you want to see the collection path & counts in the UI.
const bool kDebugBanner = false;

/// Upgraded review sheet with:
/// - Search + chips (sort by: Created / Next Due / Amount, filter: High confidence)
/// - Swipe actions (➡ Confirm, ⬅ Not a subscription/loan)
/// - Sticky footer: Confirm All Visible / Reject All Visible
/// - Brand avatars + tidy INR formatting
class ReviewPendingSheet extends StatefulWidget {
  final String userId;   // Firestore users/{userId}
  final bool isLoans;    // false = subscriptions, true = loans
  final SubscriptionsService subsSvc;

  ReviewPendingSheet({
    super.key,
    required this.userId,
    this.isLoans = false,
    SubscriptionsService? service,
  }) : subsSvc = service ?? SubscriptionsService();

  @override
  State<ReviewPendingSheet> createState() => _ReviewPendingSheetState();
}

class _ReviewPendingSheetState extends State<ReviewPendingSheet> {
  final _inrFmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
  final TextEditingController _search = TextEditingController();
  final FocusNode _searchFocus = FocusNode();

  String _sortKey = 'created'; // created | due | amount
  bool _hiConfOnly = false;    // confidenceScore >= 0.7

  bool _busyAll = false;
  String? _undoId; // last rejected id for quick undo

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  CollectionReference<Map<String, dynamic>> _col() => FirebaseFirestore.instance
      .collection('users')
      .doc(widget.userId)
      .collection(widget.isLoans ? 'loans' : 'subscriptions');

  Query<Map<String, dynamic>> _baseQuery() {
    final base = _col().where('needsConfirmation', isEqualTo: true);
    return kTryOrderByCreatedAt
        ? base.orderBy('createdAt', descending: true)
        : base;
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.isLoans ? 'Review EMIs' : 'Review Subscriptions';
    final tint  = widget.isLoans ? AppColors.teal : AppColors.mint;

    return SafeArea(
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              tint.withOpacity(.08),
              Colors.white,
            ],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
          child: Column(
          children: [
            // drag handle
            Container(height: 4, width: 42,
                decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 12),

            // Header row
            Row(
              children: [
                Icon(widget.isLoans ? Icons.account_balance_rounded : Icons.subscriptions_rounded, color: tint),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(title,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),

            if (kDebugBanner) ...[
              const SizedBox(height: 6),
              _DebugPath(path: 'users/${widget.userId}/${widget.isLoans ? 'loans' : 'subscriptions'}'),
            ],

            const SizedBox(height: 8),

            // Search + chips
            TonalCard(
              surface: Colors.white,
              borderColor: Colors.black.withOpacity(.12),
              borderWidth: 1,
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
              borderRadius: const BorderRadius.all(Radius.circular(16)),
              child: Column(
                children: [
                  Stack(
                    alignment: Alignment.centerRight,
                    children: [
                      TextField(
                        controller: _search,
                        focusNode: _searchFocus,
                        decoration: InputDecoration(
                          isDense: true,
                          hintText: 'Search brand / lender...',
                          prefixIcon: const Icon(Icons.search_rounded),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: Colors.black.withOpacity(.14)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: tint, width: 1.6),
                          ),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                      ValueListenableBuilder<TextEditingValue>(
                        valueListenable: _search,
                        builder: (_, v, __) => v.text.isEmpty
                            ? const SizedBox.shrink()
                            : Padding(
                          padding: const EdgeInsets.only(right: 4),
                          child: IconButton(
                            onPressed: () { _search.clear(); setState(() {}); },
                            icon: const Icon(Icons.clear_rounded, size: 18),
                            tooltip: 'Clear',
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _ChipsRow(
                    tint: tint,
                    sortKey: _sortKey,
                    hiConfOnly: _hiConfOnly,
                    onSort: (k) => setState(() => _sortKey = k),
                    onToggleHiConf: () => setState(() => _hiConfOnly = !_hiConfOnly),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            // Live list
            Expanded(
              child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: _baseQuery().snapshots(includeMetadataChanges: true),
                builder: (ctx, snap) {
                  if (snap.hasError) {
                    return _centerText('Failed to load.\n${snap.error}');
                  }
                  if (!snap.hasData) {
                    return const Center(
                      child: SizedBox(
                        height: 24,
                        width: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    );
                  }

                  final allDocs = snap.data!.docs;
                  final items = allDocs
                      .map((d) => _Pending.fromDoc(d, widget.isLoans))
                      .whereType<_Pending>()
                      .toList();

                  final q = _search.text.trim().toLowerCase();
                  final filtered = items.where((x) {
                    if (_hiConfOnly && (x.confidence == null || x.confidence! < .70)) return false;
                    if (q.isEmpty) return true;
                    return x.title.toLowerCase().contains(q) ||
                        (x.detBy?.toLowerCase().contains(q) ?? false);
                  }).toList();

                  filtered.sort((a, b) {
                    switch (_sortKey) {
                      case 'amount':
                        final ad = (a.amount ?? 0);
                        final bd = (b.amount ?? 0);
                        return bd.compareTo(ad);
                      case 'due':
                        final ad = a.nextDue ?? DateTime(2100);
                        final bd = b.nextDue ?? DateTime(2100);
                        return ad.compareTo(bd);
                      default:
                        final ad = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
                        final bd = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
                        return bd.compareTo(ad);
                    }
                  });

                  final totalAmt = filtered.fold<double>(0, (s, e) => s + (e.amount ?? 0));
                  final hiConfCount =
                      filtered.where((x) => x.confidence != null && x.confidence! >= .70).length;
                  final overdueCount =
                      filtered.where((x) => x.nextDue != null && _isOverdue(x.nextDue!)).length;
                  final now = DateTime.now();
                  final dueSoonCount = filtered.where((x) {
                    if (x.nextDue == null) return false;
                    if (_isOverdue(x.nextDue!)) return false;
                    return x.nextDue!.difference(now).inDays <= 7;
                  }).length;

                  final summaryCard = _ReviewSummaryCard(
                    tint: tint,
                    formatter: _inrFmt,
                    pending: filtered.length,
                    totalAmount: totalAmt,
                    hiConf: hiConfCount,
                    overdue: overdueCount,
                    dueSoon: dueSoonCount,
                    isLoans: widget.isLoans,
                  );

                  if (filtered.isEmpty) {
                    return Column(
                      children: [
                        summaryCard,
                        const SizedBox(height: 20),
                        Expanded(child: _EmptyReviewState(tint: tint)),
                      ],
                    );
                  }

                  final bottomPadding = MediaQuery.of(ctx).viewPadding.bottom + 140;

                  return Column(
                    children: [
                      summaryCard,
                      const SizedBox(height: 16),
                      Expanded(
                        child: Stack(
                          children: [
                            ListView.separated(
                              padding: EdgeInsets.only(bottom: bottomPadding),
                              itemCount: filtered.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 12),
                              itemBuilder: (_, i) => _row(context, filtered[i], tint),
                            ),
                            Positioned(
                              left: 0,
                              right: 0,
                              bottom: 0,
                              child: SafeArea(
                                top: false,
                                child: GlassCard(
                                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                                  glassGradient: [
                                    Colors.white.withOpacity(.92),
                                    tint.withOpacity(.12),
                                  ],
                                  borderOpacityOverride: .12,
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Row(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Container(
                                            height: 36,
                                            width: 36,
                                            decoration: BoxDecoration(
                                              color: tint.withOpacity(.12),
                                              borderRadius: BorderRadius.circular(12),
                                            ),
                                            child: Icon(Icons.fact_check_rounded, color: tint),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                const Text(
                                                  'Bulk actions',
                                                  style: TextStyle(fontWeight: FontWeight.w900),
                                                ),
                                                const SizedBox(height: 2),
                                                Text(
                                                  '${filtered.length} item${filtered.length == 1 ? '' : 's'} visible',
                                                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 12),
                                      Wrap(
                                        spacing: 12,
                                        runSpacing: 12,
                                        crossAxisAlignment: WrapCrossAlignment.center,
                                        alignment: WrapAlignment.spaceBetween,
                                        children: [
                                          _Pill('Total: ${_inrFmt.format(totalAmt)}', base: tint),
                                          Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              OutlinedButton.icon(
                                                onPressed: _busyAll ? null : () => _rejectAll(filtered),
                                                icon: const Icon(Icons.close_rounded, size: 18),
                                                label: const Text('Reject all'),
                                                style: OutlinedButton.styleFrom(
                                                  foregroundColor: Colors.black87,
                                                  side: BorderSide(color: Colors.black.withOpacity(.18)),
                                                  textStyle: const TextStyle(fontWeight: FontWeight.w700),
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              FilledButton.icon(
                                                onPressed: _busyAll ? null : () => _confirmAll(filtered),
                                                icon: _busyAll
                                                    ? const SizedBox(
                                                        height: 16,
                                                        width: 16,
                                                        child: CircularProgressIndicator(
                                                          strokeWidth: 2,
                                                          color: Colors.white,
                                                        ),
                                                      )
                                                    : const Icon(Icons.check_circle_rounded, size: 18),
                                                label: const Text('Confirm all'),
                                                style: FilledButton.styleFrom(
                                                  backgroundColor: tint,
                                                  foregroundColor: Colors.white,
                                                  textStyle: const TextStyle(fontWeight: FontWeight.w800),
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
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    ),
    );
  }

  // ---------- Row ----------

  Widget _row(BuildContext context, _Pending p, Color tint) {
    final dueStr = p.nextDue == null ? '—' : _fmtDate(p.nextDue!);
    final amtStr = p.amount == null ? '—' : _inrFmt.format(p.amount);
    final isOverdue = p.nextDue != null && _isOverdue(p.nextDue!);

    final dueLabel = p.nextDue == null
        ? '—'
        : (isOverdue ? 'Was due $dueStr' : 'Due $dueStr');
    final avatarAsset = BrandAvatarRegistry.assetFor(p.title);

    final metaChips = <Widget>[
      _MetaChip(
        icon: Icons.currency_rupee_rounded,
        text: amtStr,
        color: tint,
        filled: true,
      ),
      _MetaChip(
        icon: Icons.event,
        text: dueLabel,
        color: isOverdue ? AppColors.bad : tint,
        textColor: isOverdue ? AppColors.bad : tint,
        filled: !isOverdue,
      ),
    ];

    if (p.detBy != null && p.detBy!.isNotEmpty) {
      metaChips.add(
        _MetaChip(
          icon: Icons.auto_awesome,
          text: p.detBy!,
          color: Colors.black45,
          textColor: Colors.black87,
        ),
      );
    }

    final tile = GlassCard(
      onTap: () => _edit(context, p.id, p.raw, isLoans: widget.isLoans),
      padding: const EdgeInsets.fromLTRB(14, 14, 16, 16),
      radius: 20,
      glassGradient: [
        Colors.white.withOpacity(.95),
        Colors.white.withOpacity(.78),
      ],
      borderOpacityOverride: .10,
      showShadow: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BrandAvatar(assetPath: avatarAsset, label: p.title, size: 40, radius: 12),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            p.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        if (isOverdue)
                          const Padding(
                            padding: EdgeInsets.only(left: 8),
                            child: _StatusChip('Overdue', AppColors.bad),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: metaChips,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: p.confidence != null
                    ? _ConfidenceMeter(value: p.confidence!, tint: tint)
                    : const Text(
                        'Auto-detected from your accounts',
                        style: TextStyle(fontSize: 11, color: Colors.black54),
                      ),
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                onPressed: () => _confirmOne(context, p.id),
                icon: const Icon(Icons.check_rounded, size: 18),
                label: const Text('Confirm'),
                style: FilledButton.styleFrom(
                  backgroundColor: tint,
                  foregroundColor: Colors.white,
                  textStyle: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(width: 6),
              PopupMenuButton<String>(
                tooltip: 'More',
                onSelected: (v) {
                  switch (v) {
                    case 'edit':
                      _edit(context, p.id, p.raw, isLoans: widget.isLoans);
                      break;
                    case 'reject':
                      _rejectOne(context, p.id);
                      break;
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'edit',
                    child: _MenuRow(icon: Icons.edit_rounded, label: 'Edit'),
                  ),
                  PopupMenuItem(
                    value: 'reject',
                    child: _MenuRow(
                      icon: Icons.close_rounded,
                      label: 'Not a ${widget.isLoans ? 'loan' : 'subscription'}',
                    ),
                  ),
                ],
                icon: Icon(Icons.more_horiz_rounded, color: Colors.black.withOpacity(.70)),
              ),
            ],
          ),
        ],
      ),
    );

    return Dismissible(
      key: ValueKey('pending-${p.id}'),
      background:
          _swipeBg(Icons.check_circle_outline_rounded, 'Confirm', Colors.green),
      secondaryBackground: _swipeBg(
        Icons.close_rounded,
        'Not ${widget.isLoans ? 'loan' : 'subscription'}',
        Colors.red,
      ),
      confirmDismiss: (dir) async {
        if (dir == DismissDirection.startToEnd) {
          await _confirmOne(context, p.id);
        } else {
          await _rejectOne(context, p.id);
        }
        return false;
      },
      child: tile,
    );
  }

  Widget _swipeBg(IconData icon, String text, Color color) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(.25)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(children: [Icon(icon, color: color), const SizedBox(width: 6), Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w800))]),
          Row(children: [Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w800)), const SizedBox(width: 6), Icon(icon, color: color)]),
        ],
      ),
    );
  }

  // ---------- Bulk actions ----------

  Future<void> _confirmAll(List<_Pending> list) async {
    setState(() => _busyAll = true);
    var ok = 0;
    for (final p in list) {
      try {
        if (widget.isLoans) {
          await widget.subsSvc.confirmLoan(userId: widget.userId, loanId: p.id);
        } else {
          await widget.subsSvc.confirmSubscription(userId: widget.userId, subscriptionId: p.id);
        }
        ok++;
      } catch (e) {
        // fallback write
        try {
          await _col().doc(p.id).update({
            'needsConfirmation': false,
            'active': true,
            'updatedAt': FieldValue.serverTimestamp(),
          });
          ok++;
        } catch (_) {}
      }
    }
    setState(() => _busyAll = false);
    _snack(context, 'Confirmed $ok item(s)');
  }

  Future<void> _rejectAll(List<_Pending> list) async {
    setState(() => _busyAll = true);
    var ok = 0;
    for (final p in list) {
      try {
        if (widget.isLoans) {
          await widget.subsSvc.rejectLoan(userId: widget.userId, loanId: p.id);
        } else {
          await widget.subsSvc.rejectSubscription(userId: widget.userId, subscriptionId: p.id);
        }
        ok++;
      } catch (e) {
        try {
          await _col().doc(p.id).update({
            'active': false,
            'needsConfirmation': false,
            'updatedAt': FieldValue.serverTimestamp(),
          });
          ok++;
        } catch (_) {}
      }
    }
    setState(() => _busyAll = false);
    _snack(context, 'Rejected $ok item(s)');
  }

  // ---------- Single actions ----------

  Future<void> _confirmOne(BuildContext context, String id) async {
    try {
      if (widget.isLoans) {
        await widget.subsSvc.confirmLoan(userId: widget.userId, loanId: id);
      } else {
        await widget.subsSvc.confirmSubscription(userId: widget.userId, subscriptionId: id);
      }
      _snack(context, 'Confirmed');
    } catch (e) {
      if (kDebugMode) debugPrint('[ReviewPendingSheet] svc confirm failed: $e → fallback');
      try {
        await _col().doc(id).update({
          'needsConfirmation': false,
          'active': true,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        _snack(context, 'Confirmed (fallback)');
      } catch (e2) {
        _snack(context, 'Failed to confirm. $e2');
      }
    }
  }

  Future<void> _rejectOne(BuildContext context, String id) async {
    _undoId = id;
    try {
      if (widget.isLoans) {
        await widget.subsSvc.rejectLoan(userId: widget.userId, loanId: id);
      } else {
        await widget.subsSvc.rejectSubscription(userId: widget.userId, subscriptionId: id);
      }
      _snackUndo(context, 'Hidden for now', onUndo: () => _undoReject());
    } catch (e) {
      if (kDebugMode) debugPrint('[ReviewPendingSheet] svc reject failed: $e → fallback');
      try {
        await _col().doc(id).update({
          'active': false,
          'needsConfirmation': false,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        _snackUndo(context, 'Hidden (fallback)', onUndo: () => _undoReject());
      } catch (e2) {
        _snack(context, 'Failed to reject. $e2');
      }
    }
  }

  Future<void> _undoReject() async {
    final id = _undoId;
    if (id == null) return;
    try {
      await _col().doc(id).update({
        'active': true,
        'needsConfirmation': true,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      _snack(context, 'Undo complete');
    } catch (e) {
      _snack(context, 'Could not undo: $e');
    } finally {
      _undoId = null;
    }
  }

  // ---------- Edit dialog (kept simple & safe) ----------

  Future<void> _edit(BuildContext context, String id, Map<String, dynamic> data, {required bool isLoans}) async {
    final ctrlAmt = TextEditingController(
      text: (isLoans ? data['emiAmount'] : data['expectedAmount'])?.toString() ?? '',
    );
    final ctrlTol = TextEditingController(text: (data['tolerancePct'] ?? 12).toString());
    String recurrence = (data['recurrence'] ?? 'monthly').toString();

    DateTime? nextDue;
    if (data['nextDue'] is Timestamp) {
      nextDue = (data['nextDue'] as Timestamp).toDate();
    } else if (data['nextDue'] is DateTime) {
      nextDue = data['nextDue'] as DateTime;
    }

    bool saving = false;

    await showDialog(
      context: context,
      builder: (_) {
        return StatefulBuilder(
          builder: (ctx, setD) {
            return AlertDialog(
              title: Text(isLoans ? 'Edit EMI' : 'Edit Subscription'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: ctrlAmt,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Amount', hintText: 'e.g. 799'),
                    ),
                    if (!isLoans) ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: recurrence,
                        items: const [
                          DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                          DropdownMenuItem(value: 'yearly', child: Text('Yearly')),
                          DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                        ],
                        decoration: const InputDecoration(labelText: 'Recurrence'),
                        onChanged: (v) => setD(() => recurrence = v ?? 'monthly'),
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextField(
                      controller: ctrlTol,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Tolerance %', hintText: 'e.g. 12'),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Text(nextDue == null ? 'No Next Due set' : 'Next due: ${_fmtDate(nextDue!)}'),
                        ),
                        TextButton.icon(
                          onPressed: () async {
                            final today = DateTime.now();
                            final picked = await showDatePicker(
                              context: ctx,
                              firstDate: DateTime(today.year - 2),
                              lastDate: DateTime(today.year + 5),
                              initialDate: nextDue ?? today,
                            );
                            if (picked != null) setD(() => nextDue = picked);
                          },
                          icon: const Icon(Icons.event),
                          label: const Text('Pick date'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: saving ? null : () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: saving
                      ? null
                      : () async {
                    setD(() => saving = true);
                    final updates = <String, dynamic>{
                      'tolerancePct': double.tryParse(ctrlTol.text) ?? (data['tolerancePct'] ?? 12),
                      'needsConfirmation': false, // edited = confirmed
                      'active': true,
                      'updatedAt': FieldValue.serverTimestamp(),
                    };
                    final parsedAmount = double.tryParse(ctrlAmt.text);
                    if (parsedAmount != null) {
                      if (isLoans) {
                        updates['emiAmount'] = parsedAmount;
                      } else {
                        updates['expectedAmount'] = parsedAmount;
                        updates['recurrence'] = recurrence;
                      }
                    }
                    if (nextDue != null) {
                      updates['nextDue'] = Timestamp.fromDate(nextDue!);
                    }

                    try {
                      await _col().doc(id).update(updates);
                      if (Navigator.canPop(ctx)) Navigator.pop(ctx);
                      _snack(context, 'Saved');
                    } catch (e) {
                      setD(() => saving = false);
                      _snack(context, 'Failed to save. $e');
                    }
                  },
                  child: saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // ---------- helpers ----------

  bool _isOverdue(DateTime d) {
    final now = DateTime.now();
    final dd = DateTime(d.year, d.month, d.day);
    final today = DateTime(now.year, now.month, now.day);
    return dd.isBefore(today);
  }

  String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }

  Widget _centerText(String s) => Center(
    child: Padding(padding: const EdgeInsets.all(24), child: Text(s, textAlign: TextAlign.center)),
  );

  void _snack(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _snackUndo(BuildContext context, String msg, {required VoidCallback onUndo}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        action: SnackBarAction(label: 'UNDO', onPressed: onUndo),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String text;
  final Color base;

  const _StatusChip(this.text, this.base, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: base.withOpacity(.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withOpacity(.22)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: base,
          fontWeight: FontWeight.w800,
          fontSize: 11.5,
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final Color base;
  final EdgeInsetsGeometry padding;

  const _Pill(
    this.text, {
    this.base = AppColors.mint,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: base.withOpacity(.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withOpacity(.22)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: base,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  final Color? textColor;
  final bool filled;

  const _MetaChip({
    required this.icon,
    required this.text,
    required this.color,
    this.textColor,
    this.filled = false,
  });

  @override
  Widget build(BuildContext context) {
    final fg = textColor ?? color;
    final bg = filled ? color.withOpacity(.14) : Colors.white;
    final border = color.withOpacity(filled ? .32 : .18);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfidenceMeter extends StatelessWidget {
  final double value;
  final Color tint;

  const _ConfidenceMeter({
    required this.value,
    required this.tint,
  });

  @override
  Widget build(BuildContext context) {
    final safeValue = value.clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Confidence',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black54),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  minHeight: 6,
                  value: safeValue,
                  color: tint,
                  backgroundColor: tint.withOpacity(.12),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              '${(safeValue * 100).round()}%',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: tint,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ReviewSummaryCard extends StatelessWidget {
  final Color tint;
  final NumberFormat formatter;
  final int pending;
  final double totalAmount;
  final int hiConf;
  final int overdue;
  final int dueSoon;
  final bool isLoans;

  const _ReviewSummaryCard({
    required this.tint,
    required this.formatter,
    required this.pending,
    required this.totalAmount,
    required this.hiConf,
    required this.overdue,
    required this.dueSoon,
    required this.isLoans,
  });

  @override
  Widget build(BuildContext context) {
    final title = isLoans ? 'Loans & EMIs' : 'Subscriptions';
    return GlassCard(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      radius: 22,
      glassGradient: [
        Colors.white.withOpacity(.96),
        tint.withOpacity(.10),
      ],
      borderOpacityOverride: .14,
      showShadow: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 40,
                width: 40,
                decoration: BoxDecoration(
                  color: tint.withOpacity(.16),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  isLoans ? Icons.account_balance_rounded : Icons.subscriptions_rounded,
                  color: tint,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$pending pending',
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$title need your confirmation',
                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _SummaryMetric(
                icon: Icons.currency_rupee,
                label: 'Total amount',
                value: formatter.format(totalAmount),
                tint: tint,
                emphasize: true,
              ),
              _SummaryMetric(
                icon: Icons.verified_rounded,
                label: 'High confidence',
                value: '$hiConf',
                tint: AppColors.teal,
              ),
              _SummaryMetric(
                icon: Icons.priority_high_rounded,
                label: 'Overdue',
                value: '$overdue',
                tint: AppColors.bad,
              ),
              _SummaryMetric(
                icon: Icons.upcoming_rounded,
                label: 'Due soon (≤7d)',
                value: '$dueSoon',
                tint: tint,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color tint;
  final bool emphasize;

  const _SummaryMetric({
    required this.icon,
    required this.label,
    required this.value,
    required this.tint,
    this.emphasize = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: tint.withOpacity(.12),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tint.withOpacity(.24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: tint),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black54),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: emphasize ? 18 : 16,
              color: tint,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyReviewState extends StatelessWidget {
  final Color tint;

  const _EmptyReviewState({
    required this.tint,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.celebration_rounded, size: 42, color: tint),
          const SizedBox(height: 12),
          const Text(
            'All caught up!',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
          ),
          const SizedBox(height: 6),
          const Text(
            'We’ll let you know when we detect something new.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
        ],
      ),
    );
  }
}

// ===== Tiny models / widgets =====

class _Pending {
  final String id;
  final String title;
  final double? amount;
  final DateTime? nextDue;
  final double? confidence;
  final String? detBy; // detectedBy
  final DateTime? createdAt;
  final Map<String, dynamic> raw;

  _Pending({
    required this.id,
    required this.title,
    required this.amount,
    required this.nextDue,
    required this.confidence,
    required this.detBy,
    required this.createdAt,
    required this.raw,
  });

  static _Pending? fromDoc(DocumentSnapshot<Map<String, dynamic>> doc, bool isLoans) {
    try {
      final d = doc.data();
      if (d == null) return null;
      final t = isLoans ? (d['lender'] ?? 'LOAN') : (d['brand'] ?? 'SUBSCRIPTION');
      final amtRaw = isLoans ? d['emiAmount'] : d['expectedAmount'];
      final amt = (amtRaw is num) ? amtRaw.toDouble() : double.tryParse('$amtRaw');

      DateTime? nextDue;
      final nd = d['nextDue'];
      if (nd is Timestamp) nextDue = nd.toDate();
      if (nd is DateTime) nextDue = nd;

      DateTime? created;
      final c = d['createdAt'];
      if (c is Timestamp) created = c.toDate();
      if (c is DateTime) created = c;

      final conf = (d['confidenceScore'] is num) ? (d['confidenceScore'] as num).toDouble() : null;
      final det = (d['detectedBy'] ?? '').toString();
      return _Pending(
        id: doc.id,
        title: '$t',
        amount: amt,
        nextDue: nextDue,
        confidence: conf,
        detBy: det.isEmpty ? null : det,
        createdAt: created,
        raw: d,
      );
    } catch (e) {
      debugPrint('[ReviewPendingSheet] model build failed: $e');
      return null;
    }
  }
}

class _ChipsRow extends StatelessWidget {
  final Color tint;
  final String sortKey; // created | due | amount
  final bool hiConfOnly;
  final ValueChanged<String> onSort;
  final VoidCallback onToggleHiConf;

  const _ChipsRow({
    required this.tint,
    required this.sortKey,
    required this.hiConfOnly,
    required this.onSort,
    required this.onToggleHiConf,
  });

  @override
  Widget build(BuildContext context) {
    Widget chip(String label, String key) {
      final selected = sortKey == key;
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: FilterChip(
          selected: selected,
          showCheckmark: false,
          label: Text(label),
          onSelected: (_) => onSort(key),
          side: BorderSide(color: (selected ? tint : Colors.black.withOpacity(.12))),
          backgroundColor: const Color(0x0F000000),
          selectedColor: tint.withOpacity(.16),
          labelStyle: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected ? tint : Colors.black87,
          ),
        ),
      );
    }

    return Row(
      children: [
        const Text('Sort', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black54)),
        const SizedBox(width: 8),
        chip('Created', 'created'),
        chip('Next due', 'due'),
        chip('Amount', 'amount'),
        const SizedBox(width: 12),
        const Text('Filter', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black54)),
        const SizedBox(width: 8),
        FilterChip(
          selected: hiConfOnly,
          showCheckmark: false,
          label: const Text('High confidence'),
          onSelected: (_) => onToggleHiConf(),
          side: BorderSide(color: (hiConfOnly ? tint : Colors.black.withOpacity(.12))),
          backgroundColor: const Color(0x0F000000),
          selectedColor: tint.withOpacity(.16),
          labelStyle: TextStyle(
            fontWeight: FontWeight.w700,
            color: hiConfOnly ? tint : Colors.black87,
          ),
        ),
      ],
    );
  }
}

class _MenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MenuRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.black87),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _DebugPath extends StatelessWidget {
  final String path;
  const _DebugPath({required this.path});
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<QuerySnapshot>(
      future: FirebaseFirestore.instance.collection(path).limit(1).get(),
      builder: (_, snap) {
        final info = snap.hasData ? 'ok' : (snap.hasError ? 'err' : '…');
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(8),
          margin: const EdgeInsets.only(bottom: 6),
          decoration: BoxDecoration(
            color: Colors.orange.withOpacity(.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.orange.withOpacity(.25)),
          ),
          child: Text('Path: $path   ($info)',
              style: const TextStyle(fontSize: 12, color: Colors.orange, fontWeight: FontWeight.w700)),
        );
      },
    );
  }
}
