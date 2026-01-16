import 'dart:ui';
import 'package:flutter/material.dart';

import '../models/loan_model.dart';
import '../logic/loan_detection_parser.dart';

/// Shared palette (matches Add Transaction)
const Color kBg = Color(0xFFF8FAF9);
const Color kPrimary = Color(0xFF09857a);
const Color kText = Color(0xFF0F1E1C);
const Color kSubtle = Color(0xFF9AA5A1);
const Color kLine = Color(0x14000000);

/// Lightweight draft object the wizard edits and returns
class AddLoanDraft {
  String title;
  String lenderType; // Bank | NBFC | Other
  String? lenderName;

  double amount;
  double? originalAmount;
  double? emi;
  double? interestRate;

  int? tenureMonths;
  int? paymentDayOfMonth; // 1..31
  DateTime? finalDueDate; // optional explicit last due

  String? note;
  bool reminderEnabled;

  AddLoanDraft({
    this.title = '',
    this.lenderType = 'Bank',
    this.lenderName,
    this.amount = 0,
    this.originalAmount,
    this.emi,
    this.interestRate,
    this.tenureMonths,
    this.paymentDayOfMonth,
    this.finalDueDate,
    this.note,
    this.reminderEnabled = false,
  });

  factory AddLoanDraft.fromLoan(LoanModel? l) {
    if (l == null) return AddLoanDraft();
    return AddLoanDraft(
      title: l.title,
      lenderType: l.lenderType,
      lenderName: l.lenderName,
      amount: l.amount,
      originalAmount: l.originalAmount,
      emi: l.emi,
      interestRate: l.interestRate,
      tenureMonths: l.tenureMonths,
      paymentDayOfMonth: l.paymentDayOfMonth,
      finalDueDate: l.dueDate,
      note: l.note,
      reminderEnabled: l.reminderEnabled ?? false,
    );
  }
}

/// Public widget: a complete stepper that yields AddLoanDraft on submit
class AddLoanWizard extends StatefulWidget {
  final String userId;
  final AddLoanDraft initial;
  final Future<void> Function(AddLoanDraft draft) onSubmit;
  final bool saving;
  final String mode; // 'add' | 'edit'

  const AddLoanWizard({
    Key? key,
    required this.userId,
    required this.initial,
    required this.onSubmit,
    this.saving = false,
    this.mode = 'add',
  }) : super(key: key);

  @override
  State<AddLoanWizard> createState() => _AddLoanWizardState();
}

class _AddLoanWizardState extends State<AddLoanWizard> {
  final _pg = PageController();
  int _step = 0;

  // controllers
  final _title = TextEditingController();
  final _lenderName = TextEditingController();

  final _amount = TextEditingController();
  final _original = TextEditingController();
  final _emi = TextEditingController();
  final _rate = TextEditingController();

  final _tenure = TextEditingController();
  final _payDom = TextEditingController();
  DateTime? _finalDue;

  final _note = TextEditingController();
  bool _reminders = false;

  String _lenderType = 'Bank';

  @override
  void initState() {
    super.initState();
    _hydrate(widget.initial);
  }

  @override
  void didUpdateWidget(covariant AddLoanWizard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initial != widget.initial) {
      _hydrate(widget.initial);
    }
  }

  void _hydrate(AddLoanDraft d) {
    _title.text = d.title;
    _lenderType = d.lenderType;
    _lenderName.text = d.lenderName ?? '';

    _amount.text = d.amount == 0 ? '' : d.amount.toString();
    _original.text = d.originalAmount?.toString() ?? '';
    _emi.text = d.emi?.toString() ?? '';
    _rate.text = d.interestRate?.toString() ?? '';

    _tenure.text = d.tenureMonths?.toString() ?? '';
    _payDom.text = d.paymentDayOfMonth?.toString() ?? '';
    _finalDue = d.finalDueDate;

    _note.text = d.note ?? '';
    _reminders = d.reminderEnabled;
    setState(() {});
  }

  @override
  void dispose() {
    _pg.dispose();
    _title.dispose();
    _lenderName.dispose();
    _amount.dispose();
    _original.dispose();
    _emi.dispose();
    _rate.dispose();
    _tenure.dispose();
    _payDom.dispose();
    _note.dispose();
    super.dispose();
  }

  // ---------- draft build ----------
  AddLoanDraft _draft() {
    double? _toD(String s) =>
        s.trim().isEmpty ? null : double.tryParse(s.trim());
    int? _toI(String s) => s.trim().isEmpty ? null : int.tryParse(s.trim());

    return AddLoanDraft(
      title: _title.text.trim(),
      lenderType: _lenderType,
      lenderName:
          _lenderName.text.trim().isEmpty ? null : _lenderName.text.trim(),
      amount: double.tryParse(_amount.text.trim()) ?? 0,
      originalAmount: _toD(_original.text),
      emi: _toD(_emi.text),
      interestRate: _toD(_rate.text),
      tenureMonths: _toI(_tenure.text),
      paymentDayOfMonth: _toI(_payDom.text),
      finalDueDate: _finalDue,
      note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      reminderEnabled: _reminders,
    );
  }

  // ---------- validation per step ----------
  bool _valid0() {
    if (_title.text.trim().isEmpty) {
      _toast('Enter a loan title');
      return false;
    }
    if ((_amount.text.trim().isEmpty) ||
        (double.tryParse(_amount.text.trim()) == null) ||
        (double.tryParse(_amount.text.trim())! <= 0)) {
      _toast('Enter a valid outstanding amount');
      return false;
    }
    return true;
  }

  bool _valid1() {
    // No hard constraints; numbers are optional
    return true;
  }

  bool _valid2() {
    final dom = _payDom.text.trim();
    if (dom.isNotEmpty) {
      final v = int.tryParse(dom);
      if (v == null || v < 1 || v > 31) {
        _toast('Payment day must be 1–31');
        return false;
      }
    }
    final ten = _tenure.text.trim();
    if (ten.isNotEmpty) {
      final v = int.tryParse(ten);
      if (v == null || v < 0) {
        _toast('Tenure must be a positive number of months');
        return false;
      }
    }
    return true;
  }

  void _next() {
    FocusScope.of(context).unfocus();
    if (_step == 0 && !_valid0()) return;
    if (_step == 1 && !_valid1()) return;
    if (_step == 2 && !_valid2()) return;
    if (_step < 3) {
      setState(() => _step += 1);
      _pg.animateToPage(_step,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic);
    }
  }

  void _back() {
    FocusScope.of(context).unfocus();
    if (_step > 0) {
      setState(() => _step -= 1);
      _pg.animateToPage(_step,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic);
    } else {
      Navigator.pop(context);
    }
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  void _onNoteChanged(String v) {
    // Smart detection
    final res = LoanDetectionParser.parse(v);
    if (res != null) {
      // Check if meaningful change to avoid loops/flicker
      bool changed = false;
      final newAmount = res.amount;
      if (newAmount > 0 && (double.tryParse(_amount.text) ?? 0) != newAmount) {
        _amount.text = newAmount.toStringAsFixed(0);
        changed = true;
      }

      // Map loan type
      // existing types: 'Bank', 'NBFC', 'Other'
      // If given -> maybe 'Other'? Or stay.
      // If taken -> maybe check name?
      // The prompt says "update the Amount or Loan Type".
      // If I took a loan, maybe it's Bank or Other.
      // I'll stick to updating Amount mostly, unless I map 'Friend' -> 'Other'

      // Actually, AddLoanWizard has _lenderType.
      // If text implies "I lent", but the wizard controls just "Lender Type", it's ambiguous.
      // Use best judgment:
      if (res.type == LoanType.given) {
        // If I lent, the "Lender" is technically me, but usually we record the "Borrower" as the entity?
        // No, LoanModel records "Lender".
        // If I write "Lent 500 to Bob", Bob is the borrower.
        // I will assume for now I don't change lenderType blindly unless it's a known bank name.
      }

      if (changed) setState(() {});
    }
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final steps = ['Basics', 'Numbers', 'Schedule', 'Review'];

    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: kBg,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: kText),
          onPressed: _back,
        ),
        centerTitle: true,
        title: Text(
          widget.mode == 'edit' ? 'Edit Loan' : 'Add Loan',
          style: const TextStyle(color: kText, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              child: _StepperBar(
                  current: _step, total: steps.length, labels: steps),
            ),
            Expanded(
              child: PageView(
                controller: _pg,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _StepBasics(
                    titleCtrl: _title,
                    lenderType: _lenderType,
                    onLenderType: (v) => setState(() => _lenderType = v),
                    lenderNameCtrl: _lenderName,
                    onNext: _next,
                  ),
                  _StepNumbers(
                    amountCtrl: _amount,
                    originalCtrl: _original,
                    emiCtrl: _emi,
                    rateCtrl: _rate,
                    onBack: _back,
                    onNext: _next,
                  ),
                  _StepSchedule(
                    tenureCtrl: _tenure,
                    payDomCtrl: _payDom,
                    finalDue: _finalDue,
                    onPickDue: () async {
                      final now = DateTime.now();
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: _finalDue ?? now,
                        firstDate: DateTime(now.year - 5),
                        lastDate: DateTime(now.year + 10),
                      );
                      if (picked != null) setState(() => _finalDue = picked);
                    },
                    onClearDue: () => setState(() => _finalDue = null),
                    noteCtrl: _note,
                    onNoteChange: _onNoteChanged,
                    reminders: _reminders,
                    onReminders: (v) => setState(() => _reminders = v),
                    onBack: _back,
                    onNext: _next,
                  ),
                  _StepReview(
                    data: _draft(),
                    saving: widget.saving,
                    onBack: _back,
                    onSave: () => widget.onSubmit(_draft()),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// ------------------- STEPS -------------------

class _StepBasics extends StatelessWidget {
  final TextEditingController titleCtrl;
  final String lenderType;
  final ValueChanged<String> onLenderType;
  final TextEditingController lenderNameCtrl;
  final VoidCallback onNext;

  const _StepBasics({
    Key? key,
    required this.titleCtrl,
    required this.lenderType,
    required this.onLenderType,
    required this.lenderNameCtrl,
    required this.onNext,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final types = const ['Bank', 'NBFC', 'Other'];
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _H2('Loan title'),
        const SizedBox(height: 8),
        _Box(
          child: TextField(
            controller: titleCtrl,
            decoration: _inputDec().copyWith(hintText: 'Eg: Home Loan'),
          ),
        ),
        const SizedBox(height: 18),
        const _H2('Lender type'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: types.map((t) {
            final sel = t == lenderType;
            return ChoiceChip(
              selected: sel,
              onSelected: (_) => onLenderType(t),
              label: Text(t),
              labelStyle: TextStyle(
                color: sel ? Colors.white : kText.withValues(alpha: 0.9),
                fontWeight: FontWeight.w700,
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
        ),
        const SizedBox(height: 18),
        const _H2('Lender name (optional)'),
        const SizedBox(height: 8),
        _Box(
          child: TextField(
            controller: lenderNameCtrl,
            decoration:
                _inputDec().copyWith(hintText: 'Eg: HDFC, Bajaj Finance'),
          ),
        ),
        const SizedBox(height: 28),
        _PrimaryButton(text: 'Next', onPressed: onNext),
      ]),
    );
  }
}

class _StepNumbers extends StatelessWidget {
  final TextEditingController amountCtrl;
  final TextEditingController originalCtrl;
  final TextEditingController emiCtrl;
  final TextEditingController rateCtrl;
  final VoidCallback onBack;
  final VoidCallback onNext;

  const _StepNumbers({
    Key? key,
    required this.amountCtrl,
    required this.originalCtrl,
    required this.emiCtrl,
    required this.rateCtrl,
    required this.onBack,
    required this.onNext,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _H2('Outstanding amount'),
        const SizedBox(height: 8),
        _Box(
          child: TextField(
            controller: amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: _inputDec().copyWith(prefixText: '₹ '),
          ),
        ),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: _LabeledField(
              label: 'Original amount',
              controller: originalCtrl,
              hint: '₹',
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _LabeledField(
              label: 'EMI (per month)',
              controller: emiCtrl,
              hint: '₹',
            ),
          ),
        ]),
        const SizedBox(height: 12),
        _LabeledField(
          label: 'Interest rate (annual %)',
          controller: rateCtrl,
          hint: 'e.g. 8.9',
        ),
        const SizedBox(height: 28),
        Row(children: [
          _GhostButton(text: 'Back', onPressed: onBack),
          const SizedBox(width: 12),
          Expanded(child: _PrimaryButton(text: 'Next', onPressed: onNext)),
        ]),
      ]),
    );
  }
}

class _StepSchedule extends StatelessWidget {
  final TextEditingController tenureCtrl;
  final TextEditingController payDomCtrl;
  final DateTime? finalDue;
  final VoidCallback onPickDue;
  final VoidCallback onClearDue;

  final TextEditingController noteCtrl;
  final ValueChanged<String>? onNoteChange;
  final bool reminders;
  final ValueChanged<bool> onReminders;

  final VoidCallback onBack;
  final VoidCallback onNext;

  const _StepSchedule({
    Key? key,
    required this.tenureCtrl,
    required this.payDomCtrl,
    required this.finalDue,
    required this.onPickDue,
    required this.onClearDue,
    required this.noteCtrl,
    this.onNoteChange,
    required this.reminders,
    required this.onReminders,
    required this.onBack,
    required this.onNext,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    String _dateTxt(DateTime d) =>
        "${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}";

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: _LabeledField(
              label: 'Tenure (months)',
              controller: tenureCtrl,
              hint: 'e.g. 36',
              keyboardType: TextInputType.number,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _LabeledField(
              label: 'Pay on (day of month)',
              controller: payDomCtrl,
              hint: '1–31',
              keyboardType: TextInputType.number,
            ),
          ),
        ]),
        const SizedBox(height: 12),
        const _H2('Final due date (optional)'),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: _Box(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                child: Text(
                  finalDue == null ? 'Not set' : _dateTxt(finalDue!),
                  style: TextStyle(
                    color: finalDue == null ? kSubtle : kText,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          OutlinedButton.icon(
            onPressed: onPickDue,
            icon: const Icon(Icons.event_rounded, color: kPrimary),
            label: const Text('Pick',
                style: TextStyle(color: kPrimary, fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: kPrimary),
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
          if (finalDue != null) ...[
            const SizedBox(width: 10),
            OutlinedButton.icon(
              onPressed: onClearDue,
              icon: const Icon(Icons.clear_rounded, color: Colors.red),
              label: const Text('Clear',
                  style: TextStyle(
                      color: Colors.red, fontWeight: FontWeight.w700)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFFE57373)),
                backgroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
            ),
          ],
        ]),
        const SizedBox(height: 16),
        const _H2('Notes & reminders'),
        const SizedBox(height: 8),
        _Box(
          child: TextField(
            controller: noteCtrl,
            maxLines: 2,
            onChanged: onNoteChange,
            decoration: _inputDec()
                .copyWith(hintText: 'Optional note (e.g. borrowed 500)'),
          ),
        ),
        const SizedBox(height: 8),
        SwitchListTile.adaptive(
          value: reminders,
          onChanged: onReminders,
          title: const Text('Payment reminders',
              style: TextStyle(fontWeight: FontWeight.w800)),
          subtitle: const Text('Get a nudge near your payment day'),
          contentPadding: EdgeInsets.zero,
          activeTrackColor: kPrimary,
        ),
        const SizedBox(height: 28),
        Row(children: [
          _GhostButton(text: 'Back', onPressed: onBack),
          const SizedBox(width: 12),
          Expanded(child: _PrimaryButton(text: 'Next', onPressed: onNext)),
        ]),
      ]),
    );
  }
}

class _StepReview extends StatelessWidget {
  final AddLoanDraft data;
  final bool saving;
  final VoidCallback onBack;
  final VoidCallback onSave;

  const _StepReview({
    Key? key,
    required this.data,
    required this.saving,
    required this.onBack,
    required this.onSave,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final rows = <_KV>[
      _KV('Title', data.title),
      _KV('Lender',
          "${data.lenderType}${(data.lenderName ?? '').isNotEmpty ? ' • ${data.lenderName}' : ''}"),
      _KV('Outstanding', "₹ ${data.amount.toStringAsFixed(0)}"),
      if (data.originalAmount != null)
        _KV('Original', "₹ ${data.originalAmount!.toStringAsFixed(0)}"),
      if (data.emi != null)
        _KV('EMI', "₹ ${data.emi!.toStringAsFixed(0)} / mo"),
      if (data.interestRate != null) _KV('Rate', "${data.interestRate}%"),
      if (data.tenureMonths != null) _KV('Tenure', "${data.tenureMonths} mo"),
      if (data.paymentDayOfMonth != null)
        _KV('Pay on', "Day ${data.paymentDayOfMonth}"),
      if (data.finalDueDate != null)
        _KV('Final Due',
            "${data.finalDueDate!.day.toString().padLeft(2, '0')}-${data.finalDueDate!.month.toString().padLeft(2, '0')}-${data.finalDueDate!.year}"),
      _KV('Reminders', data.reminderEnabled ? 'On' : 'Off'),
      if ((data.note ?? '').isNotEmpty) _KV('Note', data.note!),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _H2('Review & Save'),
        const SizedBox(height: 12),
        _GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: rows.map((kv) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(children: [
                    Expanded(
                      child: Text(kv.k,
                          style: const TextStyle(
                              color: kSubtle, fontWeight: FontWeight.w700)),
                    ),
                    Expanded(
                      child: Text(kv.v,
                          textAlign: TextAlign.right,
                          style: const TextStyle(
                              color: kText, fontWeight: FontWeight.w800)),
                    ),
                  ]),
                );
              }).toList(),
            ),
          ),
        ),
        const SizedBox(height: 28),
        Row(children: [
          _GhostButton(text: 'Back', onPressed: onBack),
          const SizedBox(width: 12),
          Expanded(
            child: _PrimaryButton(
              text: 'Save Loan',
              onPressed: saving ? null : onSave,
              loading: saving,
            ),
          ),
        ]),
      ]),
    );
  }
}

/// ------------------- shared UI -------------------

class _StepperBar extends StatelessWidget {
  final int current;
  final int total;
  final List<String> labels;
  const _StepperBar(
      {required this.current, required this.total, required this.labels});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: List.generate(total, (i) {
            final active = i <= current;
            return Expanded(
              child: Container(
                height: 6,
                margin: EdgeInsets.only(right: i == total - 1 ? 0 : 6),
                decoration: BoxDecoration(
                  color: active ? kPrimary : const Color(0x22000000),
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: labels.map((t) {
            final idx = labels.indexOf(t);
            final active = idx == current;
            return Expanded(
              child: Text(
                t,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: active ? kPrimary : kSubtle,
                  fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                  fontSize: 12,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _H2 extends StatelessWidget {
  final String t;
  const _H2(this.t);
  @override
  Widget build(BuildContext context) {
    return Text(
      t,
      style: const TextStyle(
          color: kText, fontWeight: FontWeight.w800, fontSize: 16),
    );
  }
}

class _LabeledField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  const _LabeledField({
    Key? key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return _Box(
      label: label,
      child: TextField(
        controller: controller,
        keyboardType: keyboardType ??
            const TextInputType.numberWithOptions(decimal: true),
        decoration: _inputDec().copyWith(hintText: hint),
      ),
    );
  }
}

class _Box extends StatelessWidget {
  final Widget child;
  final String? label;
  const _Box({required this.child, this.label});

  @override
  Widget build(BuildContext context) {
    final box = Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kLine),
        boxShadow: const [
          BoxShadow(
              color: Color(0x0F000000), blurRadius: 10, offset: Offset(0, 4))
        ],
      ),
      child: child,
    );
    if (label == null) return box;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label!,
            style: const TextStyle(
                color: kText, fontWeight: FontWeight.w700, fontSize: 13.5)),
        const SizedBox(height: 6),
        box,
      ],
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool loading;
  const _PrimaryButton(
      {required this.text, required this.onPressed, this.loading = false});
  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 2,
      ),
      child: loading
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white)),
            )
          : Text(text,
              style:
                  const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800)),
    );
  }
}

class _GhostButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  const _GhostButton({required this.text, required this.onPressed});
  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        side: const BorderSide(color: kLine),
        foregroundColor: kText,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: kLine, width: 1),
        boxShadow: const [
          BoxShadow(
              color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8))
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3), child: child),
      ),
    );
  }
}

class _KV {
  final String k;
  final String v;
  const _KV(this.k, this.v);
}

InputDecoration _inputDec() {
  final base = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: const BorderSide(color: kLine, width: 1),
  );
  return InputDecoration(
    filled: true,
    fillColor: Colors.white,
    hintStyle: const TextStyle(color: kSubtle),
    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
    enabledBorder: base,
    focusedBorder: base.copyWith(
        borderSide: const BorderSide(color: kPrimary, width: 1.4)),
  );
}
