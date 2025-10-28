// lib/screens/subs_bills/add_flow/add_emi_link_sheet.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:lifemap/models/loan_model.dart';
import 'package:lifemap/services/loan_service.dart';
import 'package:lifemap/details/models/recurring_scope.dart';
import 'package:lifemap/details/services/recurring_service.dart';

class SubsBillsAddEmiLinkSheet extends StatefulWidget {
  final RecurringScope scope;
  final String currentUserId; // used to fetch user's loans
  final List<String>? participantUserIds; // group-only context

  const SubsBillsAddEmiLinkSheet({
    Key? key,
    required this.scope,
    required this.currentUserId,
    this.participantUserIds,
  }) : super(key: key);

  @override
  State<SubsBillsAddEmiLinkSheet> createState() => _SubsBillsAddEmiLinkSheetState();
}

class _SubsBillsAddEmiLinkSheetState extends State<SubsBillsAddEmiLinkSheet> {
  final _loanSvc = LoanService();
  final _recurringSvc = RecurringService();

  final _q = TextEditingController();
  final _scroll = ScrollController();

  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  List<LoanModel> _loans = [];
  List<LoanModel> _view = [];
  bool _loading = true;
  String? _error;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // ---------------- data ----------------

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _loanSvc.getLoans(widget.currentUserId);
      _loans = list.where((l) => !l.isClosed).toList();
      _applyFilter(_q.text);
    } catch (e) {
      _error = 'Failed to load loans: $e';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onSearchChanged(String t) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 180), () {
      if (!mounted) return;
      _applyFilter(t);
    });
  }

  void _applyFilter(String t) {
    final q = t.trim().toLowerCase();
    if (q.isEmpty) {
      setState(() => _view = List.of(_loans));
      return;
    }
    setState(() {
      _view = _loans.where((l) {
        final s = "${l.title} ${l.lenderType} ${l.lenderName ?? ''}".toLowerCase();
        return s.contains(q);
      }).toList();
    });
  }

  Future<void> _attach(LoanModel loan) async {
    try {
      if (widget.scope.isGroup) {
        final participants = widget.participantUserIds ?? const <String>[];
        if (participants.isEmpty) {
          throw Exception('No participants available for this group.');
        }
        await _recurringSvc.attachLoanToGroup(
          groupId: widget.scope.groupId!,
          loan: loan,
          participantUserIds: participants,
        );
      } else {
        await _recurringSvc.attachLoanToFriend(
          userPhone: widget.scope.userPhone!,
          friendId: widget.scope.friendId!,
          loan: loan,
        );
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Attach failed: $e')),
      );
    }
  }

  // Open AddLoanScreen; support both return styles:
  // - String loanId  → attach immediately
  // - bool true      → refresh list (legacy)
  // - anything else  → no-op
  Future<void> _createNewLoan() async {
    final res = await Navigator.pushNamed(
      context,
      '/addLoan',                 // -> lib/screens/add_loan_screen.dart
      arguments: widget.currentUserId,   // your AddLoanScreen expects userId as argument
    );

    if (!mounted) return;

    if (res is String && res.isNotEmpty) {
      // We got a new loanId explicitly; fetch and attach.
      try {
        final created = await _loanSvc.getById(res);
        if (created != null) {
          await _attach(created);
          return;
        }
      } catch (_) {
        // fall through to refresh list
      }
    }

    if (res == true) {
      // Older flow returns true; just reload and let user pick
      await _load();
      // Smoothly scroll a bit so the list area is visible
      await Future.delayed(const Duration(milliseconds: 60));
      if (mounted && _scroll.hasClients) {
        _scroll.animateTo(
          100,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
        );
      }
    }
    // else: user cancelled; do nothing
  }

  // ---------------- helpers ----------------

  String _dueBadge(LoanModel l) {
    final nd = l.nextPaymentDate();
    if (nd == null) return "--";
    final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
    final d = DateTime(nd.year, nd.month, nd.day);
    final diff = d.difference(today).inDays;
    if (diff < 0) return "Overdue";
    if (diff == 0) return "Due today";
    return "Due in ${diff}d";
  }

  // ---------------- UI ----------------

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final maxHeight = media.size.height * 0.85;

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            // respect keyboard
            bottom: 16 + media.viewInsets.bottom,
            top: 10,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // handle
              Container(
                height: 4,
                width: 44,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(99),
                ),
              ),

              // header
              Row(
                children: [
                  const Icon(Icons.account_balance_rounded),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Link a loan as EMI',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _createNewLoan,
                    icon: const Icon(Icons.add),
                    label: const Text('New Loan'),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // search
              TextField(
                controller: _q,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  hintText: 'Search loans…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),

              const SizedBox(height: 10),

              // body
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: CircularProgressIndicator(),
                )
              else if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(
                        _error!,
                        style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w700),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _load,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              else if (_view.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        Text(
                          _q.text.trim().isEmpty
                              ? 'No active loans found.'
                              : 'No results for “${_q.text.trim()}”.',
                          style: TextStyle(color: Colors.grey[700], fontWeight: FontWeight.w600),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: _createNewLoan,
                          icon: const Icon(Icons.add),
                          label: const Text('Add a loan'),
                        ),
                      ],
                    ),
                  )
                else
                  Flexible(
                    child: RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        controller: _scroll,
                        shrinkWrap: true,
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: _view.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (ctx, i) {
                          final l = _view[i];
                          return _LoanTile(
                            loan: l,
                            inr: _inr,
                            dueBadge: _dueBadge(l),
                            onTap: () => _attach(l),
                          );
                        },
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------- small UI bits ----------------

class _LoanTile extends StatelessWidget {
  final LoanModel loan;
  final NumberFormat inr;
  final String dueBadge;
  final VoidCallback onTap;

  const _LoanTile({
    Key? key,
    required this.loan,
    required this.inr,
    required this.dueBadge,
    required this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final subtle = Colors.grey[700];

    final emi = loan.emi ?? loan.minDue ?? 0;
    final hasEmi = emi > 0;

    Color bg;
    Color fg;
    if (dueBadge == "Overdue") {
      bg = const Color(0xFFFFE9E9);
      fg = const Color(0xFFB42318);
    } else if (dueBadge == "Due today") {
      bg = const Color(0xFFFFF6E5);
      fg = const Color(0xFFB25E09);
    } else {
      bg = const Color(0xFFE9F6FF);
      fg = const Color(0xFF0B67A3);
    }

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade300),
          ),
          child: Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF7F6),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.receipt_long_rounded, color: Colors.teal),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // title + badge
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            loan.title,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          fit: FlexFit.loose,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: bg,
                              border: Border.all(color: bg),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              dueBadge,
                              overflow: TextOverflow.ellipsis,
                              softWrap: false,
                              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: fg),
                            ),
                          ),
                        ),

                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      "${loan.lenderType}${loan.lenderName != null ? ' • ${loan.lenderName}' : ''}",
                      style: TextStyle(color: subtle, fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    // AFTER
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        if (hasEmi)
                          _pill(Icons.savings_rounded, "EMI ${inr.format(emi)}"),
                        _pill(Icons.balance_rounded, "Outstanding ${inr.format(loan.amount)}"),
                      ],
                    ),

                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.link_rounded),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pill(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: Colors.black87),
        const SizedBox(width: 6),
        Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}
