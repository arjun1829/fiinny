// lib/screens/loan_screen.dart
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/loan_model.dart';
import '../services/loan_service.dart';

/// Finance UI palette (shared with Add Transaction)
const Color kBg = Color(0xFFF8FAF9);
const Color kPrimary = Color(0xFF09857a);
const Color kText = Color(0xFF0F1E1C);
const Color kLine = Color(0x14000000);

class LoansScreen extends StatefulWidget {
  final String userId;
  const LoansScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<LoansScreen> createState() => _LoansScreenState();
}

class _LoansScreenState extends State<LoansScreen> {
  late Future<List<LoanModel>> _loansFuture;
  List<LoanModel> _latest = [];

  String _segment = 'active'; // 'active' | 'closed'

  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  // brand (aligned to app palette)
  final Color _accent = kPrimary;
  final Color _heroTop = const Color(0xFF0BA58F);
  final Color _heroBottom = const Color(0xFF065B52);

  // quotes
  static const _quotes = [
    "Tiny prepayments, big savings.",
    "Autopay + alerts = peace.",
    "Refi if rate feels heavy.",
  ];
  int _quoteIndex = 0;
  Timer? _quoteTimer;

  @override
  void initState() {
    super.initState();
    _fetchLoans();
    _quoteTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted) return;
      setState(() => _quoteIndex = (_quoteIndex + 1) % _quotes.length);
    });
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    super.dispose();
  }

  void _fetchLoans() {
    _loansFuture = LoanService().getLoans(widget.userId);
  }

  // ---------------- helpers ----------------

  bool _isActive(LoanModel l) => !l.isClosed;

  int _lastDayOfMonth(int year, int month) {
    final nextMonth = month == 12 ? 1 : month + 1;
    final nextYear = month == 12 ? year + 1 : year;
    return DateTime(nextYear, nextMonth, 0).day;
  }

  DateTime _dateWithDOM(int y, int m, int dom) {
    final d = dom.clamp(1, _lastDayOfMonth(y, m));
    return DateTime(y, m, d);
  }

  DateTime? _nextPaymentDate(LoanModel l) {
    if (l.isClosed) return null;
    final dom = l.paymentDayOfMonth;
    final storedDue = l.dueDate;
    if (dom == null) return storedDue;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    var candidate = _dateWithDOM(now.year, now.month, dom);
    if (!candidate.isAfter(today)) {
      final y = now.month == 12 ? now.year + 1 : now.year;
      final m = now.month == 12 ? 1 : now.month + 1;
      candidate = _dateWithDOM(y, m, dom);
    }
    if (storedDue != null) {
      final s = DateTime(storedDue.year, storedDue.month, storedDue.day);
      if (!candidate.isBefore(s)) return s;
    }
    return candidate;
  }

  String _dueBadge(LoanModel l) {
    final nd = _nextPaymentDate(l);
    if (nd == null) return "--";
    final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
    final d = DateTime(nd.year, nd.month, nd.day);
    final diff = d.difference(today).inDays;
    if (diff < 0) return "Overdue";
    if (diff == 0) return "Due today";
    return "Due in ${diff}d";
  }

  List<LoanModel> _view(List<LoanModel> all) {
    final list = all.where((l) => _segment == 'active' ? _isActive(l) : l.isClosed).toList();
    list.sort((a, b) {
      final ad = _nextPaymentDate(a);
      final bd = _nextPaymentDate(b);
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad.compareTo(bd);
    });
    return list;
  }

  int _monthsLeftFor(LoanModel l) {
    if (l.isClosed) return 0;
    final now = DateTime.now();
    if (l.dueDate != null) {
      final days = DateTime(l.dueDate!.year, l.dueDate!.month, l.dueDate!.day)
          .difference(DateTime(now.year, now.month, now.day))
          .inDays;
      return days <= 0 ? 0 : (days / 30).ceil();
    }
    return l.tenureMonths ?? 0;
  }

  Map<String, dynamic> _summary(List<LoanModel> current) {
    final active = current.where(_isActive).toList();
    final totalOutstanding = active.fold<double>(0.0, (s, l) => s + l.amount);
    final totalEmi = active.fold<double>(0.0, (s, l) => s + (l.emi ?? 0));
    final withRate = active.where((l) => (l.interestRate ?? 0) > 0).toList();
    final avgRate =
    withRate.isEmpty ? 0.0 : withRate.fold<double>(0.0, (s, l) => s + (l.interestRate ?? 0)) / withRate.length;

    DateTime? nextDue;
    for (final l in active) {
      final nd = _nextPaymentDate(l);
      if (nd == null) continue;
      if (nextDue == null || nd.isBefore(nextDue)) nextDue = nd;
    }

    final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
    final overdueCount = active.where((l) {
      final nd = _nextPaymentDate(l);
      return nd != null && nd.isBefore(today);
    }).length;

    final withOriginal = active.where((l) => (l.originalAmount ?? 0) > 0).toList();
    final sumOriginal = withOriginal.fold<double>(0, (s, l) => s + (l.originalAmount ?? 0));
    final sumOutstandingOnOriginals = withOriginal.fold<double>(0, (s, l) => s + l.amount);
    final paid = math.max(0.0, sumOriginal - sumOutstandingOnOriginals);
    final paidPct = sumOriginal <= 0 ? null : (paid / sumOriginal).clamp(0.0, 1.0);

    final monthsLeft = active.fold<int>(0, (s, l) => s + _monthsLeftFor(l));
    final yearsLeft = monthsLeft / 12.0;
    final yearsProgress = (1.0 - (yearsLeft / 10.0)).clamp(0.0, 1.0);
    final loansCount = active.length;
    final loansProgress = (loansCount / 5.0).clamp(0.0, 1.0);

    return {
      'totalOutstanding': totalOutstanding,
      'totalEmi': totalEmi,
      'avgRate': avgRate,
      'nextDue': nextDue,
      'overdueCount': overdueCount,
      'paidPct': paidPct,
      'yearsLeft': yearsLeft,
      'yearsProgress': yearsProgress,
      'loansCount': loansCount,
      'loansProgress': loansProgress,
    };
  }

  // ---------------- actions ----------------

  Future<void> _confirmDelete(LoanModel loan) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Loan?'),
        content: Text('Are you sure you want to delete "${loan.title}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (ok == true) {
      await LoanService().deleteLoan(loan.id!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Loan "${loan.title}" deleted!'), backgroundColor: Colors.red),
        );
        setState(_fetchLoans);
      }
    }
  }

  Future<void> _toggleClosed(LoanModel loan) async {
    final updated = loan.copyWith(isClosed: !loan.isClosed);
    await LoanService().saveLoan(updated);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(updated.isClosed ? 'Marked closed' : 'Reopened')),
    );
    setState(_fetchLoans);
  }

  Future<void> _toggleReminder(LoanModel loan) async {
    final updated = loan.copyWith(reminderEnabled: !(loan.reminderEnabled ?? false));
    await LoanService().saveLoan(updated);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(updated.reminderEnabled == true ? 'Reminders ON' : 'Reminders OFF')),
    );
    setState(_fetchLoans);
  }

  Future<void> _editLoan(LoanModel loan) async {
    final edited = await Navigator.pushNamed(context, '/addLoan', arguments: {
      'userId': widget.userId,
      'loan': loan,
      'mode': 'edit',
    });
    if (edited == true && mounted) setState(_fetchLoans);
  }

  // ---------------- UI ----------------

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final safeTop = media.padding.top;
    final heroHeight = 170.0 + safeTop;

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      child: Scaffold(
        backgroundColor: kBg, // unified app bg
        floatingActionButton: FloatingActionButton(
          heroTag: 'loans-fab',
          backgroundColor: kPrimary,
          onPressed: () async {
            final added = await Navigator.pushNamed(context, '/addLoan', arguments: widget.userId);
            if (added == true) setState(_fetchLoans);
          },
          child: const Icon(Icons.add, color: Colors.white),
          tooltip: "Add Loan",
        ),
        body: FutureBuilder<List<LoanModel>>(
          future: _loansFuture,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            _latest = snap.data ?? [];
            final counts = {
              'active': _latest.where(_isActive).length,
              'closed': _latest.where((l) => l.isClosed).length,
            };
            final view = _view(_latest);
            final sum = _summary(_latest);

            return RefreshIndicator(
              onRefresh: () async {
                setState(_fetchLoans);
                await Future.delayed(const Duration(milliseconds: 300));
              },
              child: Stack(
                children: [
                  // background
                  Positioned.fill(child: _BackgroundDecor(top: _heroTop, bottom: _heroBottom)),

                  CustomScrollView(
                    physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                    slivers: [
                      // HERO — quote + Loans title
                      SliverToBoxAdapter(
                        child: SizedBox(
                          height: heroHeight,
                          child: Stack(
                            children: [
                              const Positioned.fill(child: _SheenOverlay()),
                              Positioned.fill(
                                child: SafeArea(
                                  bottom: false,
                                  child: Padding(
                                    padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.center,
                                      children: [
                                        _GlassChip(
                                          child: AnimatedSwitcher(
                                            duration: const Duration(milliseconds: 300),
                                            child: Text(
                                              _quotes[_quoteIndex],
                                              key: ValueKey(_quoteIndex),
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 13.5,
                                                fontWeight: FontWeight.w800,
                                                letterSpacing: .2,
                                              ),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 16),
                                        Text(
                                          "Loans",
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            color: Colors.white.withOpacity(.98),
                                            fontSize: 36,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: -.3,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      // SUMMARY — glassy card
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                          child: _Glass(
                            blur: 16,
                            opacity: .28,
                            borderOpacity: .45,
                            radius: 18,
                            child: _SummaryCard(
                              bg: Colors.white.withOpacity(.78),
                              accent: Colors.black87,
                              segment: _segment,
                              totalOutstanding: sum['totalOutstanding'] as double,
                              totalEmi: sum['totalEmi'] as double,
                              avgRate: sum['avgRate'] as double,
                              nextDue: sum['nextDue'] as DateTime?,
                              overdueCount: sum['overdueCount'] as int,
                              paidPct: sum['paidPct'] as double?,
                              yearsLeft: sum['yearsLeft'] as double,
                              yearsProgress: sum['yearsProgress'] as double,
                              loansCount: sum['loansCount'] as int,
                              loansProgress: sum['loansProgress'] as double,
                              currency: _inr,
                            ),
                          ),
                        ),
                      ),

                      const SliverToBoxAdapter(child: SizedBox(height: 18)),

                      // Segments
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                          child: _Segments(
                            segment: _segment,
                            counts: counts,
                            accent: Colors.white,
                            onChanged: (s) => setState(() => _segment = s),
                          ),
                        ),
                      ),

                      // "Our Loans"
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: Row(
                            children: const [
                              Text("Our Loans",
                                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white)),
                            ],
                          ),
                        ),
                      ),

                      // List / Empty
                      if (view.isEmpty)
                        SliverFillRemaining(
                          hasScrollBody: false,
                          child: Center(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.account_balance_wallet_rounded, size: 72, color: Colors.white),
                                  const SizedBox(height: 12),
                                  Text(
                                    _segment == 'active' ? "No active loans yet." : "No closed loans yet.",
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
                                  ),
                                  const SizedBox(height: 8),
                                  if (_segment == 'active')
                                    ElevatedButton.icon(
                                      onPressed: () async {
                                        final added = await Navigator.pushNamed(context, '/addLoan', arguments: widget.userId);
                                        if (added == true) setState(_fetchLoans);
                                      },
                                      icon: const Icon(Icons.add),
                                      label: const Text("Add Loan"),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.white,
                                        foregroundColor: _heroBottom,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 2, 16, 110),
                          sliver: SliverList.separated(
                            itemCount: view.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 12),
                            itemBuilder: (ctx, i) {
                              final l = view[i];
                              return _LoanTile(
                                loan: l,
                                accent: _accent,
                                currency: _inr,
                                dueBadge: _dueBadge(l),
                                onToggleClosed: () => _toggleClosed(l),
                                onToggleReminder: () => _toggleReminder(l),
                                onDelete: () => _confirmDelete(l),
                                onTap: () => _showDetails(l),
                                onEdit: () => _editLoan(l),
                                showInlineActions: false,
                              );
                            },
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  // Bottom sheet (actions live here)
  void _showDetails(LoanModel l) {
    final nd = _nextPaymentDate(l);
    final dueBadge = _dueBadge(l);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 14,
          left: 16, right: 16, top: 8,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              _BankLogoCircle(size: 52, lenderName: l.lenderName, lenderType: l.lenderType, accent: _accent, isClosed: l.isClosed),
              const SizedBox(width: 10),
              Expanded(
                child: Text(l.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: (l.isClosed ? Colors.green[50] : Colors.blue[50]),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  l.isClosed ? "Closed" : dueBadge,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: l.isClosed
                        ? Colors.green[800]
                        : (dueBadge == "Overdue" ? Colors.red[800] : Colors.blue[800]),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                _kpi("Outstanding", _inr.format(l.amount)),
                if (l.originalAmount != null) _kpi("Original", _inr.format(l.originalAmount)),
                if (l.emi != null && l.emi! > 0) _kpi("EMI", _inr.format(l.emi)),
                if (l.interestRate != null) _kpi("Rate", "${l.interestRate}%"),
                _kpi("Lender", "${l.lenderType}${l.lenderName != null ? " • ${l.lenderName}" : ""}"),
                if (nd != null) _kpi("Next", "${DateFormat("d MMM").format(nd)} • $dueBadge"),
                if (l.dueDate != null) _kpi("Final Due", DateFormat("d MMM, yyyy").format(l.dueDate!)),
                if (l.tenureMonths != null) _kpi("Tenure", "${l.tenureMonths} mo"),
                if (l.paymentDayOfMonth != null) _kpi("Pay on", "Day ${l.paymentDayOfMonth}"),
                _kpi("Reminder", (l.reminderEnabled ?? false) ? "On" : "Off"),
              ],
            ),
            if ((l.note ?? '').isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(l.note!, style: const TextStyle(color: Colors.black87)),
            ],
            const SizedBox(height: 14),

            // WRAP prevents overflow on smaller screens
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                TextButton.icon(
                  onPressed: () => _editLoan(l),
                  icon: const Icon(Icons.edit_rounded),
                  label: const Text("Edit"),
                ),
                TextButton.icon(
                  onPressed: () => _toggleClosed(l),
                  icon: Icon(l.isClosed ? Icons.lock_open_rounded : Icons.verified_rounded),
                  label: Text(l.isClosed ? "Reopen" : "Mark closed"),
                ),
                TextButton.icon(
                  onPressed: () => _toggleReminder(l),
                  icon: Icon((l.reminderEnabled ?? false) ? Icons.notifications_active : Icons.notifications_off),
                  label: Text((l.reminderEnabled ?? false) ? "Reminders off" : "Reminders on"),
                ),
                const SizedBox(width: 12),
                TextButton.icon(
                  onPressed: () => _confirmDelete(l),
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
                  label: const Text("Delete", style: TextStyle(color: Colors.red)),
                ),
              ],
            ),

            const SizedBox(height: 6),
          ],
        ),
      ),
    );
  }

  Widget _kpi(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text("$label: ", style: TextStyle(fontSize: 12, color: Colors.grey[800], fontWeight: FontWeight.w700)),
        Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
      ]),
    );
  }
}

// ================= background & glass =================

class _BackgroundDecor extends StatelessWidget {
  final Color top;
  final Color bottom;
  const _BackgroundDecor({Key? key, required this.top, required this.bottom}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [top, bottom],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
        ),
        Positioned(top: -60, left: -40, child: _blob(color: Colors.white.withOpacity(.12), size: 180)),
        Positioned(top: 60, right: -40, child: _blob(color: Colors.white.withOpacity(.10), size: 140)),
        Positioned(bottom: 120, left: -30, child: _blob(color: Colors.white.withOpacity(.08), size: 160)),
      ],
    );
  }

  Widget _blob({required Color color, required double size}) {
    return Container(
      height: size,
      width: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        boxShadow: [BoxShadow(color: color, blurRadius: 60, spreadRadius: 10)],
      ),
    );
  }
}

class _SheenOverlay extends StatelessWidget {
  const _SheenOverlay({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.white.withOpacity(.10),
              Colors.white.withOpacity(.02),
              Colors.white.withOpacity(.08),
              Colors.transparent,
            ],
            stops: const [0.0, 0.35, 0.55, 1.0],
          ),
        ),
      ),
    );
  }
}

class _Glass extends StatelessWidget {
  final Widget child;
  final double blur;
  final double opacity;
  final double borderOpacity;
  final double radius;

  const _Glass({
    Key? key,
    required this.child,
    this.blur = 14,
    this.opacity = .25,
    this.borderOpacity = .35,
    this.radius = 16,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(opacity),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: Colors.white.withOpacity(borderOpacity)),
            boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 8))],
          ),
          child: Stack(
            children: [
              Positioned(
                top: 0, left: 0, right: 0, height: 10,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.white.withOpacity(.30), Colors.white.withOpacity(0)],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
              ),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _GlassChip extends StatelessWidget {
  final Widget child;
  const _GlassChip({Key? key, required this.child}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return _Glass(
      blur: 16,
      opacity: .18,
      borderOpacity: .45,
      radius: 24,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: DefaultTextStyle.merge(
          style: const TextStyle(fontWeight: FontWeight.w800),
          child: child,
        ),
      ),
    );
  }
}

// ================= segments, summary, tiles =================

class _Segments extends StatelessWidget {
  final String segment; // 'active' | 'closed'
  final void Function(String) onChanged;
  final Map<String, int> counts;
  final Color accent;
  const _Segments({Key? key, required this.segment, required this.onChanged, required this.counts, required this.accent})
      : super(key: key);

  @override
  Widget build(BuildContext context) {
    final keys = ['active', 'closed'];
    final labels = {'active': 'Active', 'closed': 'Closed'};
    final icons = {'active': Icons.play_circle_fill_rounded, 'closed': Icons.verified_rounded};

    return Wrap(
      spacing: 8, runSpacing: 8,
      children: keys.map((k) {
        final sel = k == segment;
        return ChoiceChip(
          selected: sel,
          onSelected: (_) => onChanged(k),
          label: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icons[k], size: 18, color: sel ? Colors.white : kText.withOpacity(.8)),
            const SizedBox(width: 6),
            Text("${labels[k]} (${counts[k] ?? 0})"),
          ]),
          labelStyle: TextStyle(
            color: sel ? Colors.white : kText.withOpacity(.9),
            fontWeight: FontWeight.w800,
          ),
          selectedColor: kPrimary,
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: sel ? kPrimary : kLine),
          ),
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        );
      }).toList(),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final Color bg;
  final Color accent;
  final String segment;
  final double totalOutstanding;
  final double totalEmi;
  final double avgRate;
  final DateTime? nextDue;
  final int overdueCount;

  final double? paidPct;
  final double yearsLeft;
  final double yearsProgress;
  final int loansCount;
  final double loansProgress;

  final NumberFormat currency;

  const _SummaryCard({
    Key? key,
    required this.bg,
    required this.accent,
    required this.segment,
    required this.totalOutstanding,
    required this.totalEmi,
    required this.avgRate,
    required this.nextDue,
    required this.overdueCount,
    required this.paidPct,
    required this.yearsLeft,
    required this.yearsProgress,
    required this.loansCount,
    required this.loansProgress,
    required this.currency,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final nextDueText = nextDue == null ? "--" : DateFormat("d MMM, yyyy").format(nextDue!);

    Widget line(String label, double value, {String? meta, Color? color}) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
            if (meta != null) ...[
              const SizedBox(width: 6),
              Text(meta, style: TextStyle(color: Colors.grey[700], fontWeight: FontWeight.w600)),
            ],
          ]),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              minHeight: 8,
              value: value.clamp(0.0, 1.0),
              backgroundColor: Colors.grey[200],
              valueColor: AlwaysStoppedAnimation<Color>(color ?? accent),
            ),
          ),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(.45)),
        boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8, runSpacing: 8,
            children: [
              _chip("Outstanding", segment == 'active' ? currency.format(totalOutstanding) : "--"),
              _chip("EMI / mo", segment == 'active' ? currency.format(totalEmi) : "--"),
              _chip("Avg rate", avgRate > 0 ? "${avgRate.toStringAsFixed(1)}%" : "--"),
              _chip("Next due", segment == 'active' ? nextDueText : "--"),
              _chip("Overdue", segment == 'active' ? "$overdueCount" : "0"),
            ],
          ),
          const SizedBox(height: 14),
          if (paidPct != null) line("Paid overall", paidPct!, meta: "${(paidPct! * 100).toStringAsFixed(0)}%"),
          if (paidPct != null) const SizedBox(height: 10),
          line("Years left", yearsProgress, meta: yearsLeft <= 0 ? "done" : "${yearsLeft.toStringAsFixed(1)}y"),
          const SizedBox(height: 10),
          line("Loans", loansProgress, meta: "$loansCount", color: Colors.black87),
        ],
      ),
    );
  }

  Widget _chip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(.92),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text("$label: ", style: TextStyle(fontSize: 12, color: Colors.grey[800], fontWeight: FontWeight.w700)),
        Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
      ]),
    );
  }
}

class _LoanTile extends StatelessWidget {
  final LoanModel loan;
  final Color accent;
  final NumberFormat currency;
  final String dueBadge;
  final VoidCallback onToggleClosed;
  final VoidCallback onToggleReminder;
  final VoidCallback onDelete;
  final VoidCallback onTap;
  final VoidCallback onEdit;
  final bool showInlineActions;

  const _LoanTile({
    Key? key,
    required this.loan,
    required this.accent,
    required this.currency,
    required this.dueBadge,
    required this.onToggleClosed,
    required this.onToggleReminder,
    required this.onDelete,
    required this.onTap,
    required this.onEdit,
    this.showInlineActions = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isClosed = loan.isClosed;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.96, end: 1.0),
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: kLine, width: 1),
          boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8))],
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            // tightened trailing padding prevents tiny pixel overflow on some devices
            padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _BankLogoCircle(
                  lenderName: loan.lenderName,
                  lenderType: loan.lenderType,
                  accent: accent,
                  isClosed: isClosed,
                  size: 54, // presence
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    // Title row + badge + menu
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Text(
                            loan.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16.8, color: kText),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _StatusBadge(text: isClosed ? 'Closed' : dueBadge, isClosed: isClosed),
                        const SizedBox(width: 4),
                        PopupMenuButton<String>(
                          padding: EdgeInsets.zero,
                          position: PopupMenuPosition.under,
                          offset: const Offset(-20, 0),
                          constraints: const BoxConstraints(minWidth: 160),
                          tooltip: 'Actions',
                          icon: const Icon(Icons.more_vert),
                          onSelected: (v) {
                            switch (v) {
                              case 'edit':
                                onEdit();
                                break;
                              case 'toggleClosed':
                                onToggleClosed();
                                break;
                              case 'toggleReminder':
                                onToggleReminder();
                                break;
                              case 'delete':
                                onDelete();
                                break;
                            }
                          },
                          itemBuilder: (ctx) => const [
                            PopupMenuItem(
                              value: 'edit',
                              child: ListTile(
                                leading: Icon(Icons.edit_rounded),
                                title: Text('Edit'),
                                dense: true,
                                visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                              ),
                            ),
                            PopupMenuItem(
                              value: 'toggleClosed',
                              child: ListTile(
                                leading: Icon(Icons.verified_rounded),
                                title: Text('Toggle closed'),
                                dense: true,
                                visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                              ),
                            ),
                            PopupMenuItem(
                              value: 'toggleReminder',
                              child: ListTile(
                                leading: Icon(Icons.notifications_rounded),
                                title: Text('Toggle reminder'),
                                dense: true,
                                visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                              ),
                            ),
                            PopupMenuDivider(),
                            PopupMenuItem(
                              value: 'delete',
                              child: ListTile(
                                leading: Icon(Icons.delete_forever_rounded, color: Colors.red),
                                title: Text('Delete'),
                                dense: true,
                                visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    Row(children: [
                      // Note: original code prefixes ₹ + currency.format (which already has ₹).
                      // Kept as-is to avoid any behavioral change.
                      Text("₹ ${currency.format(loan.amount)}",
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                      const SizedBox(width: 10),
                      if ((loan.interestRate ?? 0) > 0) _pill(Icons.percent_rounded, "${loan.interestRate}%"),
                      if ((loan.emi ?? 0) > 0)
                        Padding(
                          padding: const EdgeInsets.only(left: 6),
                          child: _pill(Icons.savings_rounded, "EMI ${currency.format(loan.emi)}"),
                        ),
                    ]),
                    const SizedBox(height: 6),
                    Text(
                      "${loan.lenderType}${loan.lenderName != null ? " • ${loan.lenderName}" : ""}",
                      style: TextStyle(color: Colors.grey[800], fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ]),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _pill(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(8)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: Colors.black87),
        const SizedBox(width: 6),
        Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String text;
  final bool isClosed;
  const _StatusBadge({required this.text, required this.isClosed});

  @override
  Widget build(BuildContext context) {
    Color bg, fg;
    if (isClosed) {
      bg = const Color(0xFFE9F8EE);
      fg = const Color(0xFF136A2B);
    } else if (text == "Overdue") {
      bg = const Color(0xFFFFE9E9);
      fg = const Color(0xFFB42318);
    } else if (text == "Due today") {
      bg = const Color(0xFFFFF6E5);
      fg = const Color(0xFFB25E09);
    } else {
      bg = const Color(0xFFE9F6FF);
      fg = const Color(0xFF0B67A3);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: bg.withOpacity(.9)),
      ),
      child: Text(text, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: fg)),
    );
  }
}

// ---------------- bank logo ----------------

class _BankLogoCircle extends StatelessWidget {
  final String? lenderName;
  final String lenderType;
  final Color accent;
  final bool isClosed;
  final double size;

  const _BankLogoCircle({
    Key? key,
    required this.lenderName,
    required this.lenderType,
    required this.accent,
    this.isClosed = false,
    this.size = 48,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: _AssetIndex.findBankLogo(context, lenderName, lenderType),
      builder: (context, snap) {
        final path = snap.data;
        if (path != null) {
          return Container(
            height: size,
            width: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white,
              border: Border.all(color: Colors.black.withOpacity(.06), width: 1),
              boxShadow: const [BoxShadow(color: Color(0x16000000), blurRadius: 8, offset: Offset(0, 4))],
            ),
            clipBehavior: Clip.antiAlias,
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: ClipOval(child: Image.asset(path, fit: BoxFit.cover)),
            ),
          );
        }
        return Container(
          height: size,
          width: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: accent.withOpacity(.10),
            border: Border.all(color: accent.withOpacity(.22), width: 1),
            boxShadow: const [BoxShadow(color: Color(0x16000000), blurRadius: 8, offset: Offset(0, 4))],
          ),
          child: Icon(
            isClosed ? Icons.verified_rounded : Icons.account_balance_rounded,
            color: isClosed ? Colors.green : accent,
            size: size * 0.66,
          ),
        );
      },
    );
  }
}

// indexer for assets/banks
class _AssetIndex {
  static Set<String>? _assets;

  static Future<void> _load(BuildContext context) async {
    if (_assets != null) return;
    try {
      final manifestStr = await DefaultAssetBundle.of(context).loadString('AssetManifest.json');
      final Map<String, dynamic> manifest = json.decode(manifestStr) as Map<String, dynamic>;
      _assets = manifest.keys.toSet();
    } catch (_) {
      _assets = <String>{};
    }
  }

  static Future<String?> findBankLogo(BuildContext context, String? lenderName, String lenderType) async {
    await _load(context);
    final assets = _assets ?? const <String>{};
    if (assets.isEmpty) return null;

    final stems = _nameVariants(lenderName) + _nameVariants(lenderType);
    const base = 'assets/banks/';
    const exts = ['.png', '.jpg', '.jpeg', '.webp'];

    for (final stem in stems) {
      for (final ext in exts) {
        final key = '$base$stem$ext';
        if (assets.contains(key)) return key;
      }
    }
    return null;
  }

  static List<String> _nameVariants(String? raw) {
    if (raw == null || raw.trim().isEmpty) return const [];
    var s = raw.trim().toLowerCase();
    s = s.replaceAll('&', 'and');


    final dropWords = ['bank', 'ltd', 'limited', 'financial', 'finance', 'co', 'company'];
    final tokens = s
        .replaceAll(RegExp(r'[^a-z0-9\s_-]'), ' ')
        .split(RegExp(r'\s+'))
        .where((t) => t.isNotEmpty && !dropWords.contains(t))
        .toList();

    final joinedUnderscore = tokens.join('_');
    final joinedHyphen = tokens.join('-');
    final joinedSpace = tokens.join(' ');
    final collapsed = tokens.join();

    final tokensWithBank = s
        .replaceAll(RegExp(r'[^a-z0-9\s_-]'), ' ')
        .split(RegExp(r'\s+'))
        .where((t) => t.isNotEmpty)
        .toList();
    final withBankUnderscore = tokensWithBank.join('_');
    final withBankHyphen = tokensWithBank.join('-');
    final withBankCollapsed = tokensWithBank.join();

    return {
      joinedUnderscore,
      joinedHyphen,
      joinedSpace.replaceAll(' ', '_'),
      collapsed,
      withBankUnderscore,
      withBankHyphen,
      withBankCollapsed,
    }.where((e) => e.isNotEmpty).toList();
  }
}
