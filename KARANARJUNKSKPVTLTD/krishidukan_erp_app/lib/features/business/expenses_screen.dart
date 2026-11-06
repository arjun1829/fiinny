import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/audit.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import '../../widgets/form_bits.dart';
import '../../widgets/kpi_card.dart';
import '../auth/auth_repository.dart';

/// EXPENSE_CATEGORIES in ExpensePage.tsx.
const expenseCategories = [
  'Employee Salary', 'Subscription', 'Cloud Services', 'Internet', 'Electricity',
  'Office Rent', 'Office Supplies', 'Travel', 'Maintenance', 'Marketing', 'Miscellaneous',
];

class Expense {
  const Expense(this.id, this.name, this.category, this.amount, this.date, this.notes, this.employee);
  final String id;
  final String name;
  final String category;
  final double amount;
  final String date; // YYYY-MM-DD
  final String notes;
  final String employee;
}

final expensesProvider = StreamProvider.autoDispose<List<Expense>>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'expenses')
      .orderBy('date', descending: true)
      .snapshots()
      .map((s) => [
            for (final d in s.docs)
              Expense(d.id, str(d.data()['name']), str(d.data()['category']), dbl(d.data()['amount']),
                  str(d.data()['date']), str(d.data()['notes']), str(d.data()['linkedEmployeeName']))
          ]);
});

class ExpensesScreen extends ConsumerStatefulWidget {
  const ExpensesScreen({super.key});

  @override
  ConsumerState<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends ConsumerState<ExpensesScreen> {
  late String _month = isoDay(DateTime.now()).substring(0, 7);
  String _category = 'All';

  void _shiftMonth(int delta) {
    final d = DateTime.parse('$_month-01');
    setState(() => _month = isoDay(DateTime(d.year, d.month + delta, 1)).substring(0, 7));
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(expensesProvider);
    final inMonth = (async.valueOrNull ?? const <Expense>[]).where((e) => e.date.startsWith(_month)).toList();
    final list = inMonth.where((e) => _category == 'All' || e.category == _category).toList();
    final total = list.fold<double>(0, (s, e) => s + e.amount);
    final byCat = <String, double>{};
    for (final e in inMonth) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
    }
    final top = byCat.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final monthLabel = fmtFullDate(DateTime.parse('$_month-01')).substring(3);

    return Scaffold(
      appBar: AppBar(title: const Text('Expenses')),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-expense',
        onPressed: () => _openForm(context, null),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Expense'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 4, 14, 100),
        children: [
          Row(children: [
            IconButton(onPressed: () => _shiftMonth(-1), icon: const Icon(Icons.chevron_left_rounded)),
            Expanded(child: Center(child: Text(monthLabel, style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)))),
            IconButton(onPressed: () => _shiftMonth(1), icon: const Icon(Icons.chevron_right_rounded)),
          ]),
          Row(children: [
            Expanded(child: KpiCard(label: 'Spent', value: fmtInr(total), accent: AppColors.critical, sub: '${list.length} entries')),
            const SizedBox(width: 10),
            Expanded(child: KpiCard(label: 'Top category', value: top.isEmpty ? '—' : fmtInrCompact(top.first.value),
                sub: top.isEmpty ? 'no spend' : top.first.key)),
          ]),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: ChoiceRow(
              options: ['All', ...expenseCategories.where(byCat.containsKey)],
              selected: _category,
              onSelected: (c) => setState(() => _category = c),
            ),
          ),
          const SizedBox(height: 12),
          if (async.isLoading)
            const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
          else if (async.hasError)
            const EmptyNote('Could not load expenses.')
          else if (list.isEmpty)
            const EmptyNote('No expenses this month.')
          else
            for (final e in list) ...[
              Material(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(14),
                child: ListTile(
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14), side: BorderSide(color: AppColors.border)),
                  title: Text(e.name, style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
                  subtitle: Text([e.category, e.date, if (e.employee.isNotEmpty) e.employee].join('  ·  '),
                      style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
                  trailing: Text(fmtInr2(e.amount), style: kTabular.copyWith(fontSize: 13.5)),
                  onTap: () => _openForm(context, e),
                ),
              ),
              const SizedBox(height: 6),
            ],
        ],
      ),
    );
  }

  void _openForm(BuildContext context, Expense? e) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        enableDrag: false,
        builder: (_) => _ExpenseForm(existing: e),
      );
}

class _ExpenseForm extends ConsumerStatefulWidget {
  const _ExpenseForm({this.existing});
  final Expense? existing;

  @override
  ConsumerState<_ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends ConsumerState<_ExpenseForm> {
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _amount = TextEditingController(text: widget.existing == null ? '' : editNum(widget.existing!.amount));
  late final _notes = TextEditingController(text: widget.existing?.notes ?? '');
  late String _category = widget.existing?.category.isNotEmpty == true ? widget.existing!.category : 'Miscellaneous';
  late DateTime _date = DateTime.tryParse(widget.existing?.date ?? '') ?? DateTime.now();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  CollectionReference<Map<String, dynamic>> _col(AppUser u) =>
      tenantCollection(ref.read(firestoreProvider), u.tenantId, 'expenses');

  /// handleSave in ExpensePage.tsx — same payload; employee link is optional
  /// and stays as it was on edit.
  Future<void> _save() async {
    final user = ref.read(appUserProvider).valueOrNull;
    if (user == null) return;
    final amt = parseAmount(_amount.text);
    if (_name.text.trim().isEmpty || amt <= 0) {
      return setState(() => _error = 'Name and an amount above zero are required.');
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final payload = <String, dynamic>{
      'name': _name.text.trim(),
      'category': _category,
      'amount': amt,
      'date': isoDay(_date),
      'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      'updatedAt': FieldValue.serverTimestamp(),
    };
    try {
      if (widget.existing != null) {
        await _col(user).doc(widget.existing!.id).update(payload);
        logAudit(ref.read(firestoreProvider), user,
            module: 'Expenses', action: 'Update', entityName: payload['name'] as String, entityId: widget.existing!.id);
      } else {
        final r = await _col(user).add({
          ...payload,
          'linkedEmployeeId': null,
          'linkedEmployeeName': null,
          'createdAt': FieldValue.serverTimestamp(),
          'createdBy': user.email,
        });
        logAudit(ref.read(firestoreProvider), user,
            module: 'Expenses', action: 'Create', entityName: payload['name'] as String, entityId: r.id,
            description: 'Expense ₹${amt.toStringAsFixed(0)} · $_category · mobile app');
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _error = 'Not saved. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final user = ref.read(appUserProvider).valueOrNull;
    if (user == null || widget.existing == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this expense?'),
        content: Text('${widget.existing!.name} · ${fmtInr2(widget.existing!.amount)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true),
              child: Text('Delete', style: TextStyle(color: AppColors.critical))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await _col(user).doc(widget.existing!.id).delete();
      logAudit(ref.read(firestoreProvider), user,
          module: 'Expenses', action: 'Delete', entityName: widget.existing!.name, entityId: widget.existing!.id,
          description: 'Expense ₹${widget.existing!.amount.toStringAsFixed(0)} deleted · mobile app');
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not delete.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy,
      child: Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(widget.existing == null ? 'NEW EXPENSE' : 'EDIT EXPENSE', style: kMicro),
            const SizedBox(height: 10),
            TextField(controller: _name, textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'What for *', isDense: true)),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: AmountField(controller: _amount, label: 'Amount *')),
              const SizedBox(width: 10),
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () async {
                    final d = await showDatePicker(context: context, initialDate: _date,
                        firstDate: DateTime(2020), lastDate: DateTime.now().add(const Duration(days: 1)));
                    if (d != null) setState(() => _date = d);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Date', isDense: true),
                    child: Text(fmtFullDate(_date)),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            const FieldLabel('Category'),
            ChoiceRow(options: expenseCategories, selected: _category, onSelected: (c) => setState(() => _category = c)),
            const SizedBox(height: 10),
            TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Notes (optional)', isDense: true)),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: AppColors.critical, fontSize: 13)),
            ],
            const SizedBox(height: 14),
            BusyButton(label: 'Save expense', busy: _busy, onPressed: _save),
            if (widget.existing != null)
              TextButton(
                onPressed: _busy ? null : _delete,
                child: Text('Delete', style: TextStyle(color: AppColors.critical)),
              ),
          ]),
        ),
      ),
    );
  }
}
