// lib/screens/review_inbox_screen.dart
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/ingest_draft_model.dart';
import '../services/review_queue_service.dart';
import '../widgets/review_draft_editor_sheet.dart';

enum _Filter { all, needsAmount, debit, credit }

class ReviewInboxScreen extends StatefulWidget {
  final String userId;
  const ReviewInboxScreen({required this.userId, super.key});

  @override
  State<ReviewInboxScreen> createState() => _ReviewInboxScreenState();
}

class _ReviewInboxScreenState extends State<ReviewInboxScreen> {
  final _svc = ReviewQueueService.instance;

  // selection state
  final Set<String> _selected = {};
  bool _isSelectMode = false;
  bool _bulkBusy = false;

  // filters & search
  _Filter _filter = _Filter.all;
  String _query = '';

  final _fmtAmt =
  NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
  final _fmtWhen = DateFormat('d MMM, y • h:mm a');

  // ---------- Helpers ----------
  bool get _hasSelection => _selected.isNotEmpty;
  bool get _selectMode => _isSelectMode;

  void _toggleOne(String key) {
    setState(() {
      if (_selected.contains(key)) {
        _selected.remove(key);
      } else {
        _selected.add(key);
      }
    });
  }

  void _enterSelectMode() => setState(() => _isSelectMode = true);

  void _exitSelectMode() => setState(() {
    _isSelectMode = false;
    _selected.clear();
  });

  void _clearSelection() => setState(() => _selected.clear());

  void _selectAll(List<IngestDraft> items) => setState(() {
    _selected
      ..clear()
      ..addAll(items.map((e) => e.key));
  });

  Iterable<IngestDraft> _applyFilters(List<IngestDraft> items) sync* {
    for (final d in items) {
      // filter by search query
      if (_query.isNotEmpty) {
        final q = _query.toLowerCase();
        final src = [
          d.note,
          (d.bank ?? ''),
          (d.brain?['category'] as String? ?? ''),
        ].join(' ').toLowerCase();
        if (!src.contains(q)) continue;
      }
      // filter by quick chips
      switch (_filter) {
        case _Filter.all:
          yield d;
          break;
        case _Filter.needsAmount:
          if (d.amount == null) yield d;
          break;
        case _Filter.debit:
          if (d.direction == 'debit') yield d;
          break;
        case _Filter.credit:
          if (d.direction == 'credit') yield d;
          break;
      }
    }
  }

  double _selectedTotal(List<IngestDraft> all) {
    double sum = 0;
    for (final d in all) {
      if (_selected.contains(d.key)) {
        sum += (d.amount ?? 0);
      }
    }
    return sum;
  }

  Future<void> _approveSelected(List<IngestDraft> items) async {
    if (_selected.isEmpty || _bulkBusy) return;

    final keys = items
        .where((d) => _selected.contains(d.key))
        .map((d) => d.key)
        .toList();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Approve selected drafts?'),
        content: Text(
            'This will post ${keys.length} item(s). Drafts without INR amount will be skipped.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Approve')),
        ],
      ),
    ) ??
        false;

    if (!ok) return;

    setState(() => _bulkBusy = true);
    try {
      final (posted, blocked) = await _svc.approveMany(widget.userId, keys);
      if (!mounted) return;

      _clearSelection();

      if (posted > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Approved $posted draft${posted == 1 ? '' : 's'}'),
          ),
        );
      }
      if (blocked > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                '$blocked draft${blocked == 1 ? '' : 's'} need amount. Tap to edit.'),
            action: SnackBarAction(
              label: 'Review',
              onPressed: () {}, // stays on screen
            ),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Bulk approve failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _bulkBusy = false);
    }
  }

  Future<void> _approveOne(IngestDraft d) async {
    try {
      await _svc.approve(widget.userId, d.key);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Approved “${_trimNote(d)}”')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Approve failed: $e')),
      );
    }
  }

  String _trimNote(IngestDraft d) =>
      (d.note.isNotEmpty ? d.note : (d.direction == 'debit' ? 'Debit' : 'Credit'))
          .replaceAll('\n', ' ')
          .trim();

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return StreamBuilder<List<IngestDraft>>(
      stream: _svc.pendingStream(widget.userId),
      builder: (context, snap) {
        final itemsAll = snap.data ?? const <IngestDraft>[];
        final items = _applyFilters(itemsAll).toList(growable: false);
        final loading = !snap.hasData;

        final needsAmountCount =
            itemsAll.where((d) => d.amount == null).length;

        return Scaffold(
          // Glassy gradient background
          extendBodyBehindAppBar: true,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            title: AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: (_selectMode && _hasSelection)
                  ? Text('${_selected.length} selected',
                  key: const ValueKey('sel'))
                  : Text('Review (${itemsAll.length})',
                  key: const ValueKey('rev')),
            ),
            leading: _selectMode
                ? IconButton(
              icon: const Icon(Icons.close),
              onPressed: _exitSelectMode,
              tooltip: 'Exit select mode',
            )
                : null,
            actions: [
              if (_selectMode) ...[
                IconButton(
                  tooltip: 'Select all',
                  icon: const Icon(Icons.select_all),
                  onPressed: () => _selectAll(items),
                ),
                IconButton(
                  tooltip: 'Clear selection',
                  icon: const Icon(Icons.clear_all),
                  onPressed: _clearSelection,
                ),
              ] else ...[
                IconButton(
                  tooltip: 'Multi-select',
                  icon: const Icon(Icons.fact_check_outlined),
                  onPressed: _enterSelectMode,
                ),
              ],
            ],
          ),
          body: Stack(
            children: [
              // glossy backdrop
              _BackgroundGradient(),
              // subtle top gloss
              _TopGlowOverlay(),
              SafeArea(
                child: loading
                    ? const Center(child: CircularProgressIndicator())
                    : itemsAll.isEmpty
                    ? _EmptyState(onOpenParsers: () {
                  // hook if you add a settings screen
                })
                    : Column(
                  children: [
                    // Search (glassy)
                    Padding(
                      padding:
                      const EdgeInsets.fromLTRB(16, 8, 16, 6),
                      child: _glass(
                        context: context,
                        radius: 16,
                        child: Row(
                          children: [
                            const SizedBox(width: 8),
                            const Icon(Icons.search),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextField(
                                onChanged: (v) => setState(() {
                                  _query = v.trim();
                                }),
                                decoration: const InputDecoration(
                                  hintText:
                                  'Search note, bank, category…',
                                  border: InputBorder.none,
                                ),
                              ),
                            ),
                            if (_query.isNotEmpty)
                              IconButton(
                                tooltip: 'Clear',
                                icon: const Icon(Icons.close),
                                onPressed: () =>
                                    setState(() => _query = ''),
                              ),
                          ],
                        ),
                      ),
                    ),
                    // Filter chips
                    SingleChildScrollView(
                      padding:
                      const EdgeInsets.fromLTRB(16, 0, 16, 10),
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _filterChip(
                            label: 'All',
                            active: _filter == _Filter.all,
                            onTap: () =>
                                setState(() => _filter = _Filter.all),
                          ),
                          const SizedBox(width: 8),
                          _filterChip(
                            label:
                            'Needs amount ($needsAmountCount)',
                            active:
                            _filter == _Filter.needsAmount,
                            color: Colors.orange,
                            onTap: () => setState(
                                    () => _filter = _Filter.needsAmount),
                          ),
                          const SizedBox(width: 8),
                          _filterChip(
                            label: 'Debit',
                            active: _filter == _Filter.debit,
                            color: Colors.red,
                            onTap: () => setState(
                                    () => _filter = _Filter.debit),
                          ),
                          const SizedBox(width: 8),
                          _filterChip(
                            label: 'Credit',
                            active: _filter == _Filter.credit,
                            color: Colors.green,
                            onTap: () => setState(
                                    () => _filter = _Filter.credit),
                          ),
                        ],
                      ),
                    ),

                    // List
                    Expanded(
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(
                            16, 6, 16, 16),
                        cacheExtent: 800,
                        separatorBuilder: (_, __) =>
                        const SizedBox(height: 10),
                        itemCount: items.length,
                        itemBuilder: (_, i) {
                          final d = items[i];
                          final isSelected =
                          _selected.contains(d.key);
                          final isDebit = d.direction == 'debit';
                          final amountText = d.amount == null
                              ? '—'
                              : _fmtAmt.format(d.amount);

                          // ---- fxOriginal (safe locals to avoid red brackets) ----
                          final fx = (d.fxOriginal as Map?)?.cast<String, dynamic>();
                          final fxCur = fx?['currency'] as String?;
                          final fxAmt = fx?['amount'];
                          final hasFx = fxCur != null && fxCur.isNotEmpty && fxAmt != null;

                          return Dismissible(
                            key: ValueKey('dismiss-${d.key}'),
                            direction: DismissDirection.startToEnd,
                            background: _ApproveBg(),
                            confirmDismiss: (_) async {
                              // If no amount, don’t approve on swipe
                              if (d.amount == null) {
                                ScaffoldMessenger.of(context)
                                    .showSnackBar(const SnackBar(
                                    content: Text(
                                        'Add amount before approving.')));
                                return false;
                              }
                              await _approveOne(d);
                              return true; // stream will remove it
                            },
                            child: InkWell(
                              key: ValueKey(d.key),
                              borderRadius: BorderRadius.circular(16),
                              onLongPress: () {
                                HapticFeedback.selectionClick();
                                if (!_selectMode) {
                                  _enterSelectMode();
                                }
                                _toggleOne(d.key);
                              },
                              onTap: () async {
                                if (_selectMode) {
                                  _toggleOne(d.key);
                                  return;
                                }
                                // open editor bottom sheet
                                final changed =
                                await showModalBottomSheet<bool>(
                                  context: context,
                                  isScrollControlled: true,
                                  backgroundColor:
                                  Colors.transparent,
                                  barrierColor: Colors.black26,
                                  shape: RoundedRectangleBorder(
                                      borderRadius:
                                      BorderRadius.circular(20)),
                                  builder: (_) =>
                                      FractionallySizedBox(
                                        heightFactor: 0.88,
                                        child: _glass(
                                          context: context,
                                          radius: 20,
                                          padding:
                                          const EdgeInsets.all(0),
                                          child:
                                          ReviewDraftEditorSheet(
                                            userId: widget.userId,
                                            draft: d,
                                          ),
                                        ),
                                      ),
                                );
                                if (changed == true && mounted) {
                                  // Stream refreshes automatically
                                }
                              },
                              child: _glass(
                                context: context,
                                radius: 16,
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 8),
                                  child: Row(
                                    crossAxisAlignment:
                                    CrossAxisAlignment.center,
                                    children: [
                                      _avatar(isDebit),
                                      const SizedBox(width: 10),
                                      // Title + chips
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                          CrossAxisAlignment
                                              .start,
                                          children: [
                                            Text(
                                              _trimNote(d),
                                              maxLines: 1,
                                              overflow: TextOverflow
                                                  .ellipsis,
                                              style: theme
                                                  .textTheme.titleMedium
                                                  ?.copyWith(
                                                  fontWeight:
                                                  FontWeight
                                                      .w600),
                                            ),
                                            const SizedBox(height: 6),
                                            Wrap(
                                              spacing: 8,
                                              runSpacing: 4,
                                              children: [
                                                Row(
                                                  mainAxisSize:
                                                  MainAxisSize
                                                      .min,
                                                  children: [
                                                    const Icon(
                                                      Icons
                                                          .schedule,
                                                      size: 12,
                                                    ),
                                                    const SizedBox(
                                                        width: 4),
                                                    Text(
                                                      _fmtWhen.format(
                                                          d.date),
                                                      style: theme
                                                          .textTheme
                                                          .labelSmall,
                                                    ),
                                                  ],
                                                ),
                                                if ((d.bank ?? '')
                                                    .isNotEmpty)
                                                  _pill(context,
                                                      d.bank!),
                                                if ((d.last4 ?? '')
                                                    .isNotEmpty)
                                                  _pill(context,
                                                      '•••• ${d.last4}'),
                                                if ((d.brain?['category']
                                                as String?)
                                                    ?.isNotEmpty ==
                                                    true)
                                                  _pill(
                                                      context,
                                                      '${d.brain!['category']}'),
                                                if (hasFx)
                                                  _pill(context, '$fxCur $fxAmt'),
                                                if (d.amount == null)
                                                  _pill(context,
                                                      'needs amount',
                                                      color: Colors
                                                          .orange),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Column(
                                        mainAxisAlignment:
                                        MainAxisAlignment.center,
                                        crossAxisAlignment:
                                        CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            amountText,
                                            style: theme.textTheme
                                                .titleMedium
                                                ?.copyWith(
                                              fontWeight:
                                              FontWeight.w700,
                                              color: isDebit
                                                  ? Colors
                                                  .red.shade700
                                                  : Colors
                                                  .green.shade700,
                                            ),
                                          ),
                                          if (_selectMode)
                                            Padding(
                                              padding:
                                              const EdgeInsets
                                                  .only(top: 6),
                                              child: Checkbox(
                                                value: isSelected,
                                                onChanged: (_) =>
                                                    _toggleOne(
                                                        d.key),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Bottom action bar for bulk approve when something is selected
          bottomNavigationBar: _selectMode && _hasSelection
              ? SafeArea(
            child: _BottomBulkBar(
              busy: _bulkBusy,
              total: _selectedTotal(itemsAll),
              onClear: _clearSelection,
              onApprove: () => _approveSelected(itemsAll),
            ),
          )
              : null,
        );
      },
    );
  }

  // ---------- Small UI helpers ----------

  Widget _avatar(bool isDebit) {
    final bg = isDebit ? Colors.red[50] : Colors.green[50];
    final fg = isDebit ? Colors.red : Colors.green;
    return CircleAvatar(
      backgroundColor: bg,
      child: Icon(
        isDebit ? Icons.remove_circle_outline : Icons.add_circle_outline,
        color: fg,
      ),
    );
  }

  Widget _filterChip({
    required String label,
    required bool active,
    required VoidCallback onTap,
    Color? color,
  }) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return ChoiceChip(
      selected: active,
      label: Text(label),
      selectedColor: c.withOpacity(0.12),
      labelStyle: TextStyle(
        color: active ? c : Theme.of(context).colorScheme.onSurface,
        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
      ),
      side: BorderSide(color: c.withOpacity(active ? 0.30 : 0.18)),
      onSelected: (_) => onTap(),
    );
  }

  Widget _pill(BuildContext context, String text, {Color? color}) {
    final bg = color != null
        ? color.withOpacity(0.85)
        : Theme.of(context).colorScheme.primary.withOpacity(0.10);
    final fg =
    color != null ? Colors.white : Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: color == null
            ? Border.all(
            color:
            Theme.of(context).colorScheme.primary.withOpacity(0.12))
            : null,
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
      ),
    );
  }

  // Glass container primitive
  Widget _glass({
    required BuildContext context,
    required double radius,
    EdgeInsets? padding,
    required Widget child,
  }) {
    final border = Colors.white.withOpacity(0.25);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: padding ?? const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: border, width: 1),
            borderRadius: BorderRadius.circular(radius),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withOpacity(0.55),
                Colors.white.withOpacity(0.22),
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

// ---------- Decorative & structural widgets ----------

class _BackgroundGradient extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    // Soft mint-to-indigo gradient for a premium feel
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            cs.primaryContainer.withOpacity(0.45),
            cs.secondaryContainer.withOpacity(0.25),
            cs.surfaceVariant.withOpacity(0.30),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
    );
  }
}

class _TopGlowOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // A subtle radial glow at the top for gloss
    return IgnorePointer(
      child: Align(
        alignment: Alignment.topCenter,
        child: Container(
          height: 160,
          decoration: BoxDecoration(
            gradient: RadialGradient(
              radius: 0.75,
              colors: [
                Colors.white.withOpacity(0.30),
                Colors.transparent,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ApproveBg extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.20),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: const [
          Icon(Icons.check_circle, size: 28, color: Colors.green),
          SizedBox(width: 8),
          Text('Approve',
              style:
              TextStyle(fontWeight: FontWeight.w700, color: Colors.green)),
        ],
      ),
    );
  }
}

class _BottomBulkBar extends StatelessWidget {
  final bool busy;
  final double total;
  final VoidCallback onClear;
  final VoidCallback onApprove;

  const _BottomBulkBar({
    required this.busy,
    required this.total,
    required this.onClear,
    required this.onApprove,
  });

  @override
  Widget build(BuildContext context) {
    final nf =
    NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.55),
              border: Border.all(color: Colors.white.withOpacity(0.25)),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.06),
                  blurRadius: 12,
                  offset: const Offset(0, -4),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : onClear,
                    child: const Text('Clear'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    icon: busy
                        ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                        : const Icon(Icons.done_all),
                    label: Text(
                        busy ? 'Approving…' : 'Approve (${nf.format(total)})'),
                    onPressed: busy ? null : onApprove,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onOpenParsers;
  const _EmptyState({required this.onOpenParsers});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // glossy empty card
          ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: BackdropFilter(
              filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
              child: Container(
                width: double.infinity,
                padding:
                const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.55),
                  border: Border.all(color: Colors.white.withOpacity(0.25)),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.inbox_outlined, size: 44),
                    const SizedBox(height: 10),
                    Text('Inbox zero! ✨',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text(
                      'Nothing to review right now. Keep your parsers running for SMS/Email and come back later.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: onOpenParsers,
                      icon: const Icon(Icons.settings_outlined),
                      label: const Text('Parser settings'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
