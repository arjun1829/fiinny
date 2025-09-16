// lib/screens/add_loan_screen.dart
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/loan_model.dart';
import '../services/loan_service.dart';

/// Shared palette (aligned with Add Transaction look)
const Color kBg     = Color(0xFFF8FAF9);
const Color kText   = Color(0xFF0F1E1C);
const Color kSubtle = Color(0xFF9AA5A1);
const Color kLine   = Color(0x14000000);

enum _InputMode { knowEmi, knowMonths }

class AddLoanScreen extends StatefulWidget {
  final String userId;
  const AddLoanScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddLoanScreen> createState() => _AddLoanScreenState();
}

class _AddLoanScreenState extends State<AddLoanScreen>
    with SingleTickerProviderStateMixin, RestorationMixin {
  final _formKey = GlobalKey<FormState>();

  // controllers
  final _titleCtrl = TextEditingController();
  final _outstandingCtrl = TextEditingController();
  final _emiCtrl = TextEditingController();
  final _rateCtrl = TextEditingController();
  final _monthsLeftCtrl = TextEditingController();
  final _origCtrl = TextEditingController();
  final _lenderNameCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  // lifted selections (persist across rebuilds/scroll)
  String? _titleSelected; // from title options OR "Other…"
  String _lenderType = 'Bank'; // Bank, NBFC, Friend, Other
  String? _lenderNameSelected; // for Bank/NBFC OR "Other…"

  LoanInterestMethod _interestMethod = LoanInterestMethod.reducing;
  _InputMode _mode = _InputMode.knowEmi;
  int? _paymentDOM; // 1..31
  bool _reminderEnabled = true;
  int _daysBefore = 2;
  TimeOfDay _reminderTime = const TimeOfDay(hour: 9, minute: 0);
  bool _autopay = false;

  bool _saving = false;
  bool _didPersist = false;

  // Success overlay controls
  bool _showSuccess = false;
  late final AnimationController _successCtl =
  AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
  late final Animation<double> _successScale =
  CurvedAnimation(parent: _successCtl, curve: Curves.easeOutBack);

  // Auto-close overlay? Keep false (manual close)
  bool _successAutoClose = false;
  Duration _successHold = const Duration(milliseconds: 2200);

  // formatting
  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  Color get _brand => const Color(0xFF09857a);

  // options
  static const List<String> _titleOptions = [
    'Home Loan','Education Loan','Personal Loan','Car Loan','Two-Wheeler Loan',
    'Credit Card Dues','BNPL','Gold Loan','Consumer Durable Loan',
  ];
  static const List<String> _banks = [
    'HDFC Bank','ICICI Bank','SBI','Axis Bank','Kotak','IDFC First','Yes Bank','IndusInd Bank'
  ];
  static const List<String> _nbfcs = [
    'Bajaj Finance','Tata Capital','HDB Financial','Hero Fincorp','Home Credit','Mahindra Finance'
  ];
  static const String _other = 'Other…';

  // ----- Restoration (optional) -----
  @override
  String? get restorationId => 'add_loan_screen';

  final RestorableIntN _restPaymentDOM = RestorableIntN(null);
  final RestorableBool _restReminderEnabled = RestorableBool(true);
  final RestorableInt _restDaysBefore = RestorableInt(2);

  @override
  void restoreState(RestorationBucket? oldBucket, bool initialRestore) {
    registerForRestoration(_restPaymentDOM, 'payment_dom');
    registerForRestoration(_restReminderEnabled, 'reminder_enabled');
    registerForRestoration(_restDaysBefore, 'days_before');
    _paymentDOM = _restPaymentDOM.value;
    _reminderEnabled = _restReminderEnabled.value;
    _daysBefore = _restDaysBefore.value;
  }

  @override
  void dispose() {
    _successCtl.dispose();
    _titleCtrl.dispose();
    _outstandingCtrl.dispose();
    _emiCtrl.dispose();
    _rateCtrl.dispose();
    _monthsLeftCtrl.dispose();
    _origCtrl.dispose();
    _lenderNameCtrl.dispose();
    _noteCtrl.dispose();
    _restPaymentDOM.dispose();
    _restReminderEnabled.dispose();
    _restDaysBefore.dispose();
    super.dispose();
  }

  // -------------------------- helpers --------------------------
  String _digitsOnly(String s) => s.replaceAll(RegExp(r'[^0-9.]'), '');
  double _asAmount(TextEditingController c) {
    final s = _digitsOnly(c.text).trim();
    return double.tryParse(s) ?? 0.0;
  }
  double get _P => _asAmount(_outstandingCtrl);

  double? get _annualRate {
    final s = _rateCtrl.text.trim();
    if (s.isEmpty) return null;
    return double.tryParse(s);
  }

  double? get _E {
    final s = _digitsOnly(_emiCtrl.text).trim();
    if (s.isEmpty) return null;
    return double.tryParse(s);
  }

  int? get _nUser {
    final s = _monthsLeftCtrl.text.trim();
    if (s.isEmpty) return null;
    final v = int.tryParse(s);
    return (v == null || v < 1) ? null : v;
  }

  bool get _titleIsOther => _titleSelected == _other;
  bool get _lenderNameIsOther => _lenderNameSelected == _other;

  // --- DOM helpers with short-month clamping ---
  int get _safeDay {
    final raw = _paymentDOM ?? DateTime.now().day;
    if (raw < 1) return 1;
    if (raw > 31) return 31;
    return raw;
  }

  int _lastDayOfMonth(int year, int month) {
    final nextMonth = month == 12 ? 1 : month + 1;
    final nextYear = month == 12 ? year + 1 : year;
    return DateTime(nextYear, nextMonth, 0).day; // day 0 => last day of prev month
  }

  DateTime _dateWithDOM(int year, int month, int dom) {
    final last = _lastDayOfMonth(year, month);
    final day = dom.clamp(1, last);
    return DateTime(year, month, day);
  }

  DateTime _nextDueFromToday() {
    final now = DateTime.now();
    final candidate = _dateWithDOM(now.year, now.month, _safeDay);
    if (candidate.isAfter(now)) return candidate;
    final y = (now.month == 12) ? now.year + 1 : now.year;
    final m = (now.month == 12) ? 1 : now.month + 1;
    return _dateWithDOM(y, m, _safeDay);
  }

  // EMI math
  double _emiReducing(double p, double annual, int n) {
    final r = annual / 12 / 100;
    if (p <= 0 || annual <= 0 || n <= 0) return 0;
    if (r == 0) return p / n;
    final pow = math.pow(1 + r, n) as double;
    return p * r * pow / (pow - 1);
  }
  double _emiFlat(double p, double annual, int n) {
    if (p <= 0 || annual <= 0 || n <= 0) return 0;
    final years = n / 12.0;
    final totalInterest = p * (annual / 100.0) * years;
    return (p + totalInterest) / n;
  }
  int? _solveMonthsReducing(double p, double annual, double emi) {
    final r = annual / 12 / 100;
    if (p <= 0 || annual <= 0 || emi <= 0) return null;
    if (emi <= p * r) return null;
    final num = math.log(emi / (emi - p * r));
    final den = math.log(1 + r);
    final n = (num / den);
    if (n.isNaN || n.isInfinite) return null;
    return n.ceil();
  }
  int? _solveMonthsFlat(double p, double emi) {
    if (p <= 0 || emi <= 0) return null;
    return (p / emi).ceil();
  }

  _Plan _computePlan() {
    final p = _P;
    final R = _annualRate;
    final interest = _interestMethod;

    if (p <= 0 || R == null || R <= 0 || _paymentDOM == null) {
      return const _Plan.empty();
    }

    int? n = _nUser;
    double? e = _E;

    if (_mode == _InputMode.knowEmi && e != null) {
      n = (interest == LoanInterestMethod.reducing)
          ? _solveMonthsReducing(p, R, e)
          : _solveMonthsFlat(p, e);
    } else if (_mode == _InputMode.knowMonths && n != null) {
      e = (interest == LoanInterestMethod.reducing)
          ? _emiReducing(p, R, n)
          : _emiFlat(p, R, n);
    }

    if (n == null || n <= 0 || e == null || e <= 0) {
      return const _Plan.empty();
    }

    final totalPayable = e * n;
    final totalInterest = math.max(0.0, totalPayable - p);
    final firstDue = _nextDueFromToday();

    // maturity = due date in the (n-1)th month from firstDue
    DateTime maturity;
    {
      final targetMonthIndex = firstDue.month + (n - 1); // 1..∞
      final y = firstDue.year + ((targetMonthIndex - 1) ~/ 12);
      final m = ((targetMonthIndex - 1) % 12) + 1;
      maturity = _dateWithDOM(y, m, _safeDay);
    }

    return _Plan(
      emi: e,
      months: n,
      totalInterest: totalInterest,
      totalPayable: totalPayable,
      firstDue: firstDue,
      maturity: maturity,
    );
  }

  List<String> _ally(_Plan plan) {
    final out = <String>[];
    final R = _annualRate ?? 0;
    if (R == 0) out.add("Enter interest rate to compute EMI and tenure.");
    if (R >= 30) out.add("Very high rate (≥30%). Consider refinance.");
    if (_mode == _InputMode.knowEmi && _E != null && _P > 0 && R > 0) {
      final r = R / 12 / 100;
      if ((_E ?? 0) <= _P * r) out.add("EMI seems too low; increase EMI or confirm rate.");
    }
    if (_paymentDOM == null) out.add("Pick a monthly due date (1–31) for reminders.");
    if (_reminderEnabled && _daysBefore < 2) out.add("Set reminders ≥2 days before due date.");
    if (plan.isValid && plan.months > 60) out.add("Long payoff (>60 mo) → try prepayments.");
    return out;
  }

  // -------------------------- save / success --------------------------
  Future<void> _showSuccessOverlay() async {
    setState(() => _showSuccess = true);
    _successCtl.forward(from: 0);

    if (_successAutoClose) {
      await Future<void>.delayed(_successHold);
      if (!mounted) return;
      setState(() => _showSuccess = false);
      Navigator.pop(context, true);
    }
  }

  Future<bool> _trySave({bool showSnackOnSkip = false}) async {
    if (_didPersist) {
      if (showSnackOnSkip) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Already saved ✅")),
        );
      }
      return true;
    }

    if ((_titleCtrl.text.trim().isEmpty) ||
        (_P <= 0) ||
        (_annualRate == null || _annualRate! <= 0) ||
        (_paymentDOM == null)) {
      if (showSnackOnSkip) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Need title, outstanding, rate% and monthly due day.")),
        );
      }
      return false;
    }

    final plan = _computePlan();
    if (!plan.isValid) {
      if (showSnackOnSkip) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Enter EMI or Months (with a valid rate).")),
        );
      }
      return false;
    }

    if (_saving) return true;

    setState(() => _saving = true);
    try {
      final loan = LoanModel(
        userId: widget.userId,
        title: _titleCtrl.text.trim(),
        amount: _P,
        originalAmount: _origCtrl.text.trim().isEmpty
            ? null
            : (double.tryParse(_digitsOnly(_origCtrl.text)) ?? null),
        lenderType: _lenderType,
        lenderName: _lenderNameCtrl.text.trim().isEmpty ? null : _lenderNameCtrl.text.trim(),
        interestRate: _annualRate!, // validated above
        interestMethod: _interestMethod,
        emi: double.parse(plan.emi.toStringAsFixed(2)),
        tenureMonths: plan.months,
        paymentDayOfMonth: _safeDay,
        autopay: _autopay,
        startDate: null,
        dueDate: plan.maturity,
        reminderEnabled: _reminderEnabled,
        reminderDaysBefore: _daysBefore,
        reminderTime: "${_reminderTime.hour.toString().padLeft(2, '0')}:${_reminderTime.minute.toString().padLeft(2, '0')}",
        note: _noteCtrl.text.trim().isNotEmpty ? _noteCtrl.text.trim() : null,
        isClosed: false,
        createdAt: DateTime.now(),
      );

      final id = await LoanService().addLoan(loan);
      await LoanService().setReminderPrefs(
        id,
        enabled: _reminderEnabled,
        daysBefore: _daysBefore,
        timeHHmm: "${_reminderTime.hour.toString().padLeft(2, '0')}:${_reminderTime.minute.toString().padLeft(2, '0')}",
      );

      _didPersist = true;
      if (mounted) await _showSuccessOverlay();
      return true;
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Save failed: $e")));
      return false;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<bool> _autoSaveIfPossible() async {
    await _trySave(showSnackOnSkip: true);
    return true;
  }

  // -------------------------- Stepper nav --------------------------
  final _pg = PageController();
  int _step = 0;
  void _next() {
    FocusScope.of(context).unfocus();
    if (!_validateStep(_step)) return;
    if (_step < 3) setState(() => _step++);
    _pg.animateToPage(_step, duration: const Duration(milliseconds: 220), curve: Curves.easeOutCubic);
  }
  void _back() {
    FocusScope.of(context).unfocus();
    if (_step > 0) setState(() => _step--);
    else {
      _autoSaveIfPossible();
      Navigator.pop(context);
      return;
    }
    _pg.animateToPage(_step, duration: const Duration(milliseconds: 220), curve: Curves.easeOutCubic);
  }

  bool _validateStep(int s) {
    if (s == 0) {
      return _titleCtrl.text.trim().isNotEmpty && _P > 0;
    }
    if (s == 1) {
      final plan = _computePlan();
      return (_annualRate ?? 0) > 0 && plan.isValid && _paymentDOM != null;
    }
    return true;
  }

  // -------------------------- UI --------------------------
  @override
  Widget build(BuildContext context) {
    final plan = _computePlan();
    final ally = _ally(plan);
    final steps = ['Basics','Schedule','Reminders','Review'];

    // promoted locals for safe formatting in Review
    final eInput = _E;
    final nInput = _nUser;

    return WillPopScope(
      onWillPop: _autoSaveIfPossible,
      child: Scaffold(
        backgroundColor: kBg,
        appBar: AppBar(
          backgroundColor: kBg,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, color: kText),
            onPressed: _back,
          ),
          centerTitle: true,
          title: const Text('Add Loan', style: TextStyle(color: kText, fontWeight: FontWeight.w800)),
          actions: [
            IconButton(
              tooltip: 'Save now',
              onPressed: () => _trySave(showSnackOnSkip: true),
              icon: const Icon(Icons.save_rounded, color: kText),
            ),
          ],
        ),
        body: SafeArea(
          child: Stack(
            children: [
              Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                    child: _StepperBar(current: _step, total: steps.length, labels: steps, brand: _brand),
                  ),
                  Expanded(
                    child: PageView(
                      controller: _pg,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        // STEP 0 — Basics
                        SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _heroTip("Add Loan", "Select title & lender, set rate, EMI or months. We’ll compute and remind you."),
                              const SizedBox(height: 18),
                              _H2('Basics', brand: _brand),
                              const SizedBox(height: 8),
                              _TitleDropdown(
                                key: const PageStorageKey('title-dropdown'),
                                options: _titleOptions,
                                selected: _titleSelected,
                                controller: _titleCtrl,
                                brand: _brand,
                                onChangedSelected: (v) => setState(() => _titleSelected = v),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: DropdownButtonFormField<String>(
                                      value: _lenderType,
                                      isExpanded: true,
                                      items: const ['Bank','NBFC','Friend','Other']
                                          .map((t) => DropdownMenuItem(value: t, child: Text(t, overflow: TextOverflow.ellipsis)))
                                          .toList(),
                                      onChanged: (v) => setState(() {
                                        _lenderType = (v ?? 'Bank');
                                        _lenderNameSelected = null;
                                        _lenderNameCtrl.clear();
                                      }),
                                      decoration: _dec("Lender Type", icon: Icons.account_balance_rounded),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _LenderNameField(
                                      key: const PageStorageKey('lender-name-field'),
                                      lenderType: _lenderType,
                                      banks: _banks,
                                      nbfcs: _nbfcs,
                                      selected: _lenderNameSelected,
                                      controller: _lenderNameCtrl,
                                      brand: _brand,
                                      onChangedSelected: (v) => setState(() => _lenderNameSelected = v),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _outstandingCtrl,
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                                decoration: _dec("Outstanding today (₹)", icon: Icons.currency_rupee_rounded, hint: "What’s left to pay"),
                                onChanged: (_) => setState(() {}),
                              ),
                              const SizedBox(height: 10),
                              TextFormField(
                                controller: _origCtrl,
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                                decoration: _dec("Original sanctioned (₹) — optional", icon: Icons.flag_rounded),
                              ),
                              const SizedBox(height: 24),
                              _PrimaryButton(text: 'Next', onPressed: _next, brand: _brand),
                            ],
                          ),
                        ),

                        // STEP 1 — Schedule
                        SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _H2('Rate & Schedule', brand: _brand),
                              const SizedBox(height: 10),
                              DropdownButtonFormField<LoanInterestMethod>(
                                value: _interestMethod,
                                isExpanded: true,
                                items: const [
                                  DropdownMenuItem(value: LoanInterestMethod.reducing, child: Text("Reducing (EMI) — recommended")),
                                  DropdownMenuItem(value: LoanInterestMethod.flat, child: Text("Flat rate")),
                                ],
                                onChanged: (v) => setState(() => _interestMethod = v ?? LoanInterestMethod.reducing),
                                decoration: _dec("Interest Method", icon: Icons.functions_rounded),
                              ),
                              const SizedBox(height: 12),
                              _RateSliderField(
                                label: "Annual Rate %",
                                icon: Icons.percent_rounded,
                                controller: _rateCtrl,
                                min: 0, max: 48, divisions: 48,
                                onChanged: () => setState(() {}),
                                brand: _brand,
                              ),
                              const SizedBox(height: 12),
                              DropdownButtonFormField<int>(
                                value: _paymentDOM,
                                isExpanded: true,
                                items: List.generate(31, (i) => i + 1)
                                    .map((d) => DropdownMenuItem(value: d, child: Text("Pay on $d")))
                                    .toList(),
                                onChanged: (v) {
                                  setState(() => _paymentDOM = v);
                                  _restPaymentDOM.value = v;
                                },
                                decoration: _dec("Monthly due day", icon: Icons.event_available_rounded),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                "Short months auto-adjust to last day (e.g., Feb).",
                                style: TextStyle(fontSize: 12, color: Colors.grey[600], fontWeight: FontWeight.w600),
                              ),
                              const SizedBox(height: 12),
                              Center(
                                child: AnimatedToggleButtons(
                                  isSelected: [_mode == _InputMode.knowEmi, _mode == _InputMode.knowMonths],
                                  onPressed: (i) => setState(() => _mode = (i == 0) ? _InputMode.knowEmi : _InputMode.knowMonths),
                                  brand: _brand,
                                  labels: const ["I know my EMI", "I know months left"],
                                ),
                              ),
                              const SizedBox(height: 10),
                              AnimatedCrossFade(
                                crossFadeState: _mode == _InputMode.knowEmi ? CrossFadeState.showFirst : CrossFadeState.showSecond,
                                duration: const Duration(milliseconds: 250),
                                firstChild: TextFormField(
                                  controller: _emiCtrl,
                                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                                  decoration: _dec("EMI (₹)", icon: Icons.savings_rounded),
                                  onChanged: (_) => setState(() {}),
                                ),
                                secondChild: TextFormField(
                                  controller: _monthsLeftCtrl,
                                  keyboardType: TextInputType.number,
                                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                  decoration: _dec("Months remaining", icon: Icons.timelapse_rounded, hint: "e.g. 24"),
                                  onChanged: (_) => setState(() {}),
                                ),
                              ),
                              const SizedBox(height: 16),
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 250),
                                switchInCurve: Curves.easeOut,
                                child: _SummaryCard(
                                  key: ValueKey("${plan.emi}-${plan.months}-${plan.totalPayable}"),
                                  brand: _brand,
                                  plan: plan,
                                  currency: _inr,
                                ),
                              ),
                              if (ally.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Text("Suggestions", style: TextStyle(fontWeight: FontWeight.w800, color: Colors.grey[900])),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6, runSpacing: 6,
                                  children: ally.map((s) => Chip(
                                    label: Text(s),
                                    backgroundColor: Colors.blue[50],
                                    visualDensity: VisualDensity.compact,
                                  )).toList(),
                                ),
                              ],
                              const SizedBox(height: 24),
                              Row(
                                children: [
                                  _GhostButton(text: 'Back', onPressed: _back),
                                  const SizedBox(width: 12),
                                  Expanded(child: _PrimaryButton(text: 'Next', onPressed: _next, brand: _brand)),
                                ],
                              ),
                            ],
                          ),
                        ),

                        // STEP 2 — Reminders
                        SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _H2('Reminders & Notes', brand: _brand),
                              const SizedBox(height: 10),
                              SwitchListTile.adaptive(
                                value: _reminderEnabled,
                                onChanged: (v) {
                                  setState(() => _reminderEnabled = v);
                                  _restReminderEnabled.value = v;
                                },
                                title: const Text("Remind me about EMI"),
                                subtitle: const Text("We’ll notify you before each due date"),
                                activeColor: _brand,
                                contentPadding: EdgeInsets.zero,
                              ),
                              AnimatedCrossFade(
                                crossFadeState: _reminderEnabled ? CrossFadeState.showFirst : CrossFadeState.showSecond,
                                duration: const Duration(milliseconds: 200),
                                firstChild: Row(
                                  children: [
                                    Expanded(
                                      child: Slider(
                                        value: _daysBefore.toDouble(),
                                        min: 0, max: 7, divisions: 7,
                                        label: "$_daysBefore day(s) before",
                                        onChanged: (v) {
                                          setState(() => _daysBefore = v.toInt());
                                          _restDaysBefore.value = _daysBefore;
                                        },
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    OutlinedButton.icon(
                                      icon: const Icon(Icons.access_time_rounded),
                                      onPressed: () async {
                                        final t = await showTimePicker(context: context, initialTime: _reminderTime);
                                        if (t != null) setState(() => _reminderTime = t);
                                      },
                                      label: Text("${_reminderTime.hour.toString().padLeft(2, '0')}:${_reminderTime.minute.toString().padLeft(2, '0')}"),
                                    ),
                                  ],
                                ),
                                secondChild: const SizedBox.shrink(),
                              ),
                              SwitchListTile.adaptive(
                                value: _autopay,
                                onChanged: (v) => setState(() => _autopay = v),
                                title: const Text("Autopay enabled"),
                                subtitle: const Text("Mark if your bank auto-debits EMI"),
                                activeColor: _brand,
                                contentPadding: EdgeInsets.zero,
                              ),
                              const SizedBox(height: 8),
                              TextField(
                                controller: _noteCtrl,
                                maxLines: 3,
                                decoration: _dec("Notes (optional)", icon: Icons.notes_rounded),
                              ),
                              const SizedBox(height: 24),
                              Row(
                                children: [
                                  _GhostButton(text: 'Back', onPressed: _back),
                                  const SizedBox(width: 12),
                                  Expanded(child: _PrimaryButton(text: 'Next', onPressed: _next, brand: _brand)),
                                ],
                              ),
                            ],
                          ),
                        ),

                        // STEP 3 — Review
                        SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _H2('Review & Save', brand: _brand),
                              const SizedBox(height: 10),
                              _ReviewList(rows: [
                                _KV('Title', _titleCtrl.text.trim().isEmpty ? '--' : _titleCtrl.text.trim()),
                                _KV('Lender Type', _lenderType),
                                _KV('Lender Name', _lenderNameCtrl.text.trim().isEmpty ? '--' : _lenderNameCtrl.text.trim()),
                                _KV('Outstanding', _inr.format(_P)),
                                if (_origCtrl.text.trim().isNotEmpty)
                                  _KV('Original Sanctioned', _inr.format(double.tryParse(_digitsOnly(_origCtrl.text)) ?? 0)),
                                _KV('Interest Method', _interestMethod == LoanInterestMethod.reducing ? 'Reducing (EMI)' : 'Flat'),
                                _KV('Annual Rate', _annualRate == null ? '--' : "${_annualRate!.toStringAsFixed(1)}%"),
                                if (_mode == _InputMode.knowEmi && eInput != null) _KV('EMI (input)', _inr.format(eInput)),
                                if (_mode == _InputMode.knowMonths && nInput != null) _KV('Months (input)', "$nInput"),
                                _KV('Monthly Due Day', _paymentDOM?.toString() ?? '--'),
                                if (_noteCtrl.text.trim().isNotEmpty) _KV('Notes', _noteCtrl.text.trim()),
                                _KV('Reminders', _reminderEnabled ? 'On' : 'Off'),
                                if (_reminderEnabled) _KV('Notify', "$_daysBefore day(s) before at ${_reminderTime.hour.toString().padLeft(2,'0')}:${_reminderTime.minute.toString().padLeft(2,'0')}"),
                                _KV('Autopay', _autopay ? 'Yes' : 'No'),
                              ]),
                              const SizedBox(height: 12),
                              _SummaryCard(brand: _brand, plan: plan, currency: _inr),
                              const SizedBox(height: 24),
                              Row(
                                children: [
                                  _GhostButton(text: 'Back', onPressed: _back),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _PrimaryButton(
                                      text: 'Add Loan',
                                      onPressed: _saving ? null : () async {
                                        final ok = await _trySave(showSnackOnSkip: true);
                                        if (ok && _successAutoClose) {
                                          // overlay handles pop
                                        }
                                      },
                                      brand: _brand,
                                      loading: _saving,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Center(
                                child: Text(
                                  _didPersist ? "Saved • You can close this page." : "Tip: swipe back — we’ll try saving first.",
                                  style: TextStyle(fontSize: 12, color: Colors.grey[600], fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              // success overlay
              IgnorePointer(
                ignoring: !_showSuccess,
                child: AnimatedOpacity(
                  opacity: _showSuccess ? 1 : 0,
                  duration: const Duration(milliseconds: 220),
                  child: Container(
                    color: Colors.black.withOpacity(0.25),
                    alignment: Alignment.center,
                    child: ScaleTransition(
                      scale: _successScale,
                      child: _SuccessCard(
                        brand: _brand,
                        onDone: () {
                          setState(() => _showSuccess = false);
                          Navigator.pop(context, true);
                        },
                        showDone: !_successAutoClose,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // -------------------------- UI bits (kept from your file) --------------------------
  InputDecoration _dec(String label, {IconData? icon, String? hint}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      isDense: true,
      prefixIcon: icon != null ? Icon(icon) : null,
      filled: true,
      fillColor: _brand.withOpacity(.055),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: _brand),
      ),
      labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
    );
  }

  Widget _heroTip(String title, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [ _brand.withOpacity(.12), Colors.white ],
        ),
        border: Border.all(color: _brand.withOpacity(.18)),
        boxShadow: const [BoxShadow(color: Color(0x11000000), blurRadius: 12, offset: Offset(0, 6))],
      ),
      child: Row(
        children: [
          Container(
            height: 40, width: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(colors: [ _brand.withOpacity(.9), _brand.withOpacity(.6) ]),
            ),
            child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(color: _brand, fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -.2)),
              const SizedBox(height: 4),
              Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
        ],
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Title dropdown (lifted state) + “Other…” inline field (unchanged behavior)
// -----------------------------------------------------------------------------
class _TitleDropdown extends StatelessWidget {
  final List<String> options;
  final String? selected; // may be one of options or "Other…"
  final TextEditingController controller;
  final Color brand;
  final ValueChanged<String?> onChangedSelected;
  static const String other = 'Other…';

  const _TitleDropdown({
    Key? key,
    required this.options,
    required this.selected,
    required this.controller,
    required this.brand,
    required this.onChangedSelected,
  }) : super(key: key);

  bool get _isOther => selected == other;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: selected,
          isExpanded: true,
          items: [
            ...options.map((o) => DropdownMenuItem(value: o, child: Text(o))),
            const DropdownMenuItem(value: other, child: Text(other)),
          ],
          onChanged: (v) {
            onChangedSelected(v);
            if (v != other && v != null) {
              controller.text = v;
            } else if (v == other) {
              controller.clear();
            }
          },
          decoration: InputDecoration(
            labelText: "Loan Title",
            isDense: true,
            prefixIcon: const Icon(Icons.edit_rounded),
            filled: true,
            fillColor: brand.withOpacity(.055),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: Colors.grey.shade300),
            ),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          child: _isOther
              ? Padding(
            padding: const EdgeInsets.only(top: 8),
            child: TextField(
              controller: controller,
              decoration: InputDecoration(
                labelText: "Enter loan title",
                isDense: true,
                prefixIcon: const Icon(Icons.edit_rounded),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
            ),
          )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Lender name field (lifted state): Bank/NBFC -> dropdown + Other, else text
// -----------------------------------------------------------------------------
class _LenderNameField extends StatelessWidget {
  final String lenderType; // Bank, NBFC, Friend, Other
  final List<String> banks;
  final List<String> nbfcs;
  final String? selected; // for Bank/NBFC or "Other…"
  final TextEditingController controller;
  final Color brand;
  final ValueChanged<String?> onChangedSelected;

  static const String other = 'Other…';

  const _LenderNameField({
    Key? key,
    required this.lenderType,
    required this.banks,
    required this.nbfcs,
    required this.selected,
    required this.controller,
    required this.brand,
    required this.onChangedSelected,
  }) : super(key: key);

  List<String> get _options {
    switch (lenderType) {
      case 'Bank':
        return [...banks, other];
      case 'NBFC':
        return [...nbfcs, other];
      default:
        return const <String>[];
    }
  }

  bool get _showDropdown => lenderType == 'Bank' || lenderType == 'NBFC';
  bool get _isOther => selected == other;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (_showDropdown)
          DropdownButtonFormField<String>(
            value: selected,
            isExpanded: true,
            items: _options.map((o) => DropdownMenuItem(value: o, child: Text(o, overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (v) {
              onChangedSelected(v);
              if (v != other && v != null) {
                controller.text = v;
              } else {
                controller.clear();
              }
            },
            decoration: InputDecoration(
              labelText: "Lender Name",
              isDense: true,
              prefixIcon: const Icon(Icons.badge_outlined),
              filled: true,
              fillColor: brand.withOpacity(.055),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
          ),
        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          child: (!_showDropdown || _isOther)
              ? Padding(
            padding: EdgeInsets.only(top: _showDropdown ? 8 : 0),
            child: TextField(
              controller: controller,
              decoration: InputDecoration(
                labelText: "Lender Name",
                hintText: lenderType == 'Friend' ? "Friend's name" : "Type lender name",
                isDense: true,
                prefixIcon: const Icon(Icons.badge_outlined),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
            ),
          )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Rate slider + inline box + animated readout (kept)
// -----------------------------------------------------------------------------
class _RateSliderField extends StatefulWidget {
  final String label;
  final IconData icon;
  final TextEditingController controller;
  final double min;
  final double max;
  final int divisions;
  final VoidCallback onChanged;
  final Color brand;

  const _RateSliderField({
    Key? key,
    required this.label,
    required this.icon,
    required this.controller,
    required this.min,
    required this.max,
    required this.divisions,
    required this.onChanged,
    required this.brand,
  }) : super(key: key);

  @override
  State<_RateSliderField> createState() => _RateSliderFieldState();
}

class _RateSliderFieldState extends State<_RateSliderField> {
  double _value = 10;

  @override
  void initState() {
    super.initState();
    final v = double.tryParse(widget.controller.text.trim());
    _value = (v != null && v >= widget.min && v <= widget.max) ? v : 10;
  }

  void _syncFromText() {
    final v = double.tryParse(widget.controller.text.trim());
    if (v == null) return;
    final clamped = v.clamp(widget.min, widget.max);
    setState(() => _value = clamped.toDouble());
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Text(
              widget.label,
              style: TextStyle(
                fontWeight: FontWeight.w900,
                color: widget.brand,
                fontSize: 14,
                letterSpacing: -.2,
              ),
            ),
            const Spacer(),
            TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: _value),
              duration: const Duration(milliseconds: 180),
              builder: (_, val, __) => Text(
                "${val.toStringAsFixed(1)}%",
                style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.black87),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Slider(
                value: _value,
                min: widget.min,
                max: widget.max,
                divisions: widget.divisions,
                label: _value.toStringAsFixed(1),
                onChanged: (v) {
                  setState(() => _value = v);
                  widget.controller.text = v.toStringAsFixed(1);
                  widget.onChanged();
                },
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 84,
              child: TextField(
                controller: widget.controller,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                textAlign: TextAlign.center,
                decoration: InputDecoration(
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                ),
                onChanged: (_) => _syncFromText(),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Summary (kept)
// -----------------------------------------------------------------------------
class _SummaryCard extends StatelessWidget {
  final Color brand;
  final _Plan plan;
  final NumberFormat currency;

  const _SummaryCard({
    Key? key,
    required this.brand,
    required this.plan,
    required this.currency,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final rows = <_Kpi>[
      _Kpi("EMI", plan.isValid ? currency.format(plan.emi) : "--"),
      _Kpi("Payments", plan.isValid ? "${plan.months}" : "--"),
      _Kpi("Total Interest", plan.isValid ? currency.format(plan.totalInterest) : "--"),
      _Kpi("Total Payable", plan.isValid ? currency.format(plan.totalPayable) : "--"),
      _Kpi("First Due", plan.firstDue != null ? DateFormat('d MMM, yyyy').format(plan.firstDue!) : "--"),
      _Kpi("Maturity", plan.maturity != null ? DateFormat('d MMM, yyyy').format(plan.maturity!) : "--"),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 14, offset: Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Summary", style: TextStyle(fontWeight: FontWeight.w900, color: Colors.grey[900], fontSize: 18)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 12, runSpacing: 10,
            children: rows.map((k) => _kpiChip(brand, k.label, k.value)).toList(),
          ),
          if (!plan.isValid)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text("Enter Rate% and EMI or Months. Pick a due day.",
                  style: TextStyle(color: brand, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }

  Widget _kpiChip(Color brand, String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: brand.withOpacity(.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: brand.withOpacity(.16)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text("$label: ", style: TextStyle(fontSize: 12, color: Colors.grey[800], fontWeight: FontWeight.w700)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _Kpi {
  final String label; final String value;
  _Kpi(this.label, this.value);
}

// -----------------------------------------------------------------------------
// Success overlay card (kept)
// -----------------------------------------------------------------------------
class _SuccessCard extends StatelessWidget {
  final Color brand;
  final VoidCallback onDone;
  final bool showDone;
  const _SuccessCard({Key? key, required this.brand, required this.onDone, this.showDone = true}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 280,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: brand.withOpacity(.2)),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 8))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            height: 64, width: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: brand.withOpacity(.10),
              border: Border.all(color: brand.withOpacity(.25)),
            ),
            child: Icon(Icons.check_rounded, color: brand, size: 38),
          ),
          const SizedBox(height: 12),
          const Text("Saved!", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text("Your loan has been added.", textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[700], fontWeight: FontWeight.w600)),
          if (showDone) ...[
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: onDone,
              style: ElevatedButton.styleFrom(
                backgroundColor: brand,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: const Text("Done"),
            ),
          ],
        ],
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Fancy toggle (kept)
// -----------------------------------------------------------------------------
class AnimatedToggleButtons extends StatelessWidget {
  final List<bool> isSelected;
  final void Function(int) onPressed;
  final List<String> labels;
  final Color brand;
  const AnimatedToggleButtons({
    Key? key,
    required this.isSelected,
    required this.onPressed,
    required this.labels,
    required this.brand,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      children: List.generate(labels.length, (i) {
        final selected = isSelected[i];
        return TweenAnimationBuilder<double>(
          tween: Tween<double>(begin: 1, end: selected ? 1.03 : 1),
          duration: const Duration(milliseconds: 180),
          builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
          child: ChoiceChip(
            label: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Text(labels[i]),
            ),
            selected: selected,
            onSelected: (_) => onPressed(i),
            selectedColor: brand.withOpacity(.15),
            labelStyle: TextStyle(
              fontWeight: FontWeight.w800,
              color: selected ? brand : Colors.black87,
            ),
          ),
        );
      }),
    );
  }
}

// -----------------------------------------------------------------------------
// Plan DTO (kept)
// -----------------------------------------------------------------------------
class _Plan {
  final double emi;
  final int months;
  final double totalInterest;
  final double totalPayable;
  final DateTime? firstDue;
  final DateTime? maturity;

  const _Plan({
    required this.emi,
    required this.months,
    required this.totalInterest,
    required this.totalPayable,
    required this.firstDue,
    required this.maturity,
  });

  const _Plan.empty()
      : emi = 0,
        months = 0,
        totalInterest = 0,
        totalPayable = 0,
        firstDue = null,
        maturity = null;

  bool get isValid => emi > 0 && months > 0 && totalPayable > 0;
}

// -----------------------------------------------------------------------------
// Stepper primitives (new, aligned with Add Transaction)
// -----------------------------------------------------------------------------
class _StepperBar extends StatelessWidget {
  final int current;
  final int total;
  final List<String> labels;
  final Color brand;
  const _StepperBar({required this.current, required this.total, required this.labels, required this.brand});

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
                  color: active ? brand : const Color(0x22000000),
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
                  color: active ? brand : kSubtle,
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
  final Color brand;
  const _H2(this.t, {required this.brand});
  @override
  Widget build(BuildContext context) {
    return Text(
      t,
      style: TextStyle(color: brand, fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: -.2),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool loading;
  final Color brand;
  const _PrimaryButton({required this.text, required this.onPressed, this.loading=false, required this.brand});
  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: brand,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 2,
      ),
      child: loading
          ? const SizedBox(
        width: 22, height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
      )
          : Text(text, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800)),
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

class _KV {
  final String k; final String v;
  const _KV(this.k, this.v);
}

class _ReviewList extends StatelessWidget {
  final List<_KV> rows;
  const _ReviewList({Key? key, required this.rows}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: rows.map((kv) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(kv.k,
                    style: const TextStyle(color: kSubtle, fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  child: Text(kv.v,
                    textAlign: TextAlign.right,
                    style: const TextStyle(color: kText, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          )).toList(),
        ),
      ),
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
        color: Colors.white, borderRadius: BorderRadius.circular(18),
        border: Border.all(color: kLine, width: 1),
        boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0,8))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: child,
      ),
    );
  }
}
