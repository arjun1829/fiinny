// lib/screens/add_asset_screen.dart
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../core/ads/ads_shell.dart';
import '../models/asset_model.dart';
import '../services/asset_service.dart';

class AddAssetScreen extends StatefulWidget {
  final String userId;
  const AddAssetScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddAssetScreen> createState() => _AddAssetScreenState();
}

class _AddAssetScreenState extends State<AddAssetScreen>
    with SingleTickerProviderStateMixin {
  // ------------ Form + controllers ------------
  final _formKey = GlobalKey<FormState>();

  // Title + "Other"
  final _titleCtrl = TextEditingController();
  String? _titleSelected;

  // Type / SubType
  String _type = 'equity';
  String? _subTypeSelected;
  final _subTypeCtrl = TextEditingController();

  // Institution + "Other"
  String? _instSelected;
  final _instCtrl = TextEditingController();

  // Numbers / Currency
  final _valueCtrl = TextEditingController();
  final _qtyCtrl = TextEditingController();
  final _avgCtrl = TextEditingController();
  final _purchaseValueCtrl = TextEditingController();

  // Dates
  DateTime? _purchaseDate;
  DateTime? _valuationDate = DateTime.now();

  // Meta
  final _currencyCtrl = TextEditingController(text: 'INR');
  final _logoHintCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _tagsCtrl = TextEditingController(); // comma separated input

  // State
  bool _saving = false;
  bool _didPersist = false;

  // Success overlay
  bool _showSuccess = false;
  late final AnimationController _successCtl =
  AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
  late final Animation<double> _successScale =
  CurvedAnimation(parent: _successCtl, curve: Curves.easeOutBack);

  // Formatting
  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  Color get _brand => const Color(0xFF0E9784);

  // Motivational chip rotator
  static const _quotes = [
    "Every rupee should have a job.",
    "Automate investing. Automate winning.",
    "Small SIPs grow big empires.",
    "Make assets work while you sleep.",
  ];
  int _q = 0;
  Timer? _qTimer;

  // ------------ Options ------------
  static const _other = 'Other…';

  static const _titleOptions = [
    'Fixed Deposit',
    'Mutual Fund',
    'ETF',
    'Equity Stock',
    'Gold',
    'Bonds',
    'Crypto',
    'Savings Account',
    'Property',
    _other,
  ];

  // canonical keys used across app
  static const _types = <String, String>{
    'equity': 'Equity',
    'mf_etf': 'MF/ETF',
    'fixed_deposit': 'Fixed Deposit',
    'real_estate': 'Real Estate',
    'gold': 'Gold',
    'bonds': 'Bonds',
    'crypto': 'Crypto',
    'cash_bank': 'Cash/Bank',
    'retirement': 'Retirement',
    'other': 'Other',
  };

  // subtypes per type
  static const Map<String, List<String>> _subTypeMap = {
    'equity': ['Large Cap', 'Mid Cap', 'Small Cap', 'US Stocks', _other],
    'mf_etf': ['Index', 'Active', 'Debt', 'Hybrid', _other],
    'fixed_deposit': ['Bank FD', 'Corporate FD', _other],
    'real_estate': ['Residential', 'Commercial', 'Plot/Land', _other],
    'gold': ['Physical', 'Sovereign Gold Bond', 'Gold ETF', _other],
    'bonds': ['Government', 'Corporate', 'Tax Free', _other],
    'crypto': ['BTC', 'ETH', 'Alt', _other],
    'cash_bank': ['Savings', 'Current', 'Sweep', _other],
    'retirement': ['EPF', 'PPF', 'NPS', _other],
    'other': [_other],
  };

  // sample institutions (extend as you go)
  static const _institutions = {
    'cash_bank': [
      'HDFC Bank',
      'ICICI Bank',
      'SBI',
      'Axis Bank',
      'Kotak',
      'IDFC First',
      _other
    ],
    'fixed_deposit': [
      'HDFC Bank',
      'ICICI Bank',
      'SBI',
      'Axis Bank',
      'Bajaj Finance',
      'HDFC Ltd',
      _other
    ],
    'mf_etf': [
      'SBI Mutual Fund',
      'HDFC AMC',
      'Mirae',
      'Nippon',
      'ICICI Prudential AMC',
      _other
    ],
    'equity': [
      'Zerodha',
      'Upstox',
      'ICICI Direct',
      'HDFC Securities',
      'Groww',
      _other
    ],
    'gold': ['Jeweller', 'Sovereign Gold Bond', 'ETF Provider', _other],
    'bonds': ['G-Sec', 'RBI Retail', 'Corporate Issuer', _other],
    'crypto': ['Binance', 'Coinbase', 'CoinDCX', 'WazirX', _other],
    'real_estate': ['Self', 'Builder', _other],
    'retirement': ['EPFO', 'NPS', 'PPF (Post Office/Bank)', _other],
    'other': [_other],
  };

  @override
  void initState() {
    super.initState();
    _qTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted) return;
      setState(() => _q = (_q + 1) % _quotes.length);
    });
  }

  @override
  void dispose() {
    _qTimer?.cancel();
    _successCtl.dispose();
    _titleCtrl.dispose();
    _subTypeCtrl.dispose();
    _instCtrl.dispose();
    _valueCtrl.dispose();
    _qtyCtrl.dispose();
    _avgCtrl.dispose();
    _purchaseValueCtrl.dispose();
    _currencyCtrl.dispose();
    _logoHintCtrl.dispose();
    _notesCtrl.dispose();
    _tagsCtrl.dispose();
    super.dispose();
  }

  // ------------ Helpers ------------
  String _digitsOnly(String s) => s.replaceAll(RegExp(r'[^0-9.]'), '');

  double _asDouble(TextEditingController c) {
    final t = _digitsOnly(c.text.trim());
    return double.tryParse(t) ?? 0.0;
  }

  void _maybeAutoCalcValue() {
    // Auto-calc value = qty * avg when both present; don’t overwrite if user typed value in the last 1.2s?
    final q = _asDouble(_qtyCtrl);
    final a = _asDouble(_avgCtrl);
    if (q > 0 && a > 0) {
      final v = q * a;
      final old = _asDouble(_valueCtrl);
      if ((old - v).abs() > 0.5) {
        _valueCtrl.text = v.toStringAsFixed(0);
      }
      setState(() {});
    }
  }

  List<String> _instOptionsForType(String type) {
    return _institutions[type] ?? [_other];
  }

  List<String> _subOptionsForType(String type) {
    return _subTypeMap[type] ?? [_other];
  }

  // ------------ Save ------------
  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please fix the highlighted fields.")),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final tags = _tagsCtrl.text
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();

      final model = AssetModel(
        userId: widget.userId,
        title: _titleCtrl.text.trim(),
        value: _asDouble(_valueCtrl),
        assetType: _type,
        subType: _subTypeSelected == _other ? _subTypeCtrl.text.trim() : _subTypeSelected,
        institution: _instSelected == _other ? _instCtrl.text.trim() : _instSelected,
        quantity: _asDouble(_qtyCtrl) > 0 ? _asDouble(_qtyCtrl) : null,
        avgBuyPrice: _asDouble(_avgCtrl) > 0 ? _asDouble(_avgCtrl) : null,
        purchaseValue: _asDouble(_purchaseValueCtrl) > 0 ? _asDouble(_purchaseValueCtrl) : null,
        purchaseDate: _purchaseDate,
        valuationDate: _valuationDate,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        currency: _currencyCtrl.text.trim().isEmpty ? 'INR' : _currencyCtrl.text.trim(),
        logoHint: _logoHintCtrl.text.trim().isEmpty ? null : _logoHintCtrl.text.trim(),
        tags: tags.isEmpty ? null : tags,
        createdAt: DateTime.now(),
      );

      await AssetService().addAsset(model);
      _didPersist = true;

      // show success overlay
      setState(() => _showSuccess = true);
      _successCtl.forward(from: 0);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to save: $e")),
      );
    } finally {
      setState(() => _saving = false);
    }
  }

  // ------------ UI ------------
  @override
  Widget build(BuildContext context) {
    final body = ListView(
      padding: EdgeInsets.fromLTRB(16, 18, 16, context.adsBottomPadding(extra: 28)),
      children: [
        _heroTip("Add Asset / Investment",
            "Pick a type & institution, add value (or qty×avg). We’ll keep it glossy & tidy."),
        const SizedBox(height: 18),

        // Motivational chip line
        Align(
          alignment: Alignment.centerLeft,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 280),
            child: Container(
              key: ValueKey(_q),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: _brand.withOpacity(.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _brand.withOpacity(.16)),
              ),
              child: Text(
                _quotes[_q],
                style: TextStyle(color: _brand, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),

        _bigTitle("Basics"),
        const SizedBox(height: 10),

        // Title (dropdown + Other)
        _DropdownWithOther(
          label: "Asset Title",
          icon: Icons.edit_rounded,
          options: _titleOptions,
          selected: _titleSelected,
          controller: _titleCtrl,
          brand: _brand,
          onChanged: (v) => setState(() => _titleSelected = v),
          validator: (val) =>
          (_titleCtrl.text.trim().isEmpty) ? "Enter a valid title" : null,
        ),
        const SizedBox(height: 12),

        // Type + Subtype
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _type,
                isExpanded: true,
                decoration: _dec("Asset Type", icon: Icons.category_rounded),
                items: _types.entries
                    .map((e) => DropdownMenuItem(
                  value: e.key,
                  child: Text(e.value, overflow: TextOverflow.ellipsis),
                ))
                    .toList(),
                onChanged: (v) {
                  setState(() {
                    _type = v ?? 'equity';
                    _subTypeSelected = null;
                    _subTypeCtrl.clear();
                    _instSelected = null;
                    _instCtrl.clear();
                  });
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SubTypeField(
                typeKey: _type,
                options: _subOptionsForType(_type),
                selected: _subTypeSelected,
                controller: _subTypeCtrl,
                brand: _brand,
                onChanged: (v) => setState(() => _subTypeSelected = v),
              ),
            ),
          ],
        ),

        const SizedBox(height: 12),

        // Institution (dropdown + Other)
        _InstitutionField(
          typeKey: _type,
          options: _instOptionsForType(_type),
          selected: _instSelected,
          controller: _instCtrl,
          brand: _brand,
          onChanged: (v) {
            setState(() => _instSelected = v);
            if (v != null && v != _other) {
              // use institution as default logoHint
              _logoHintCtrl.text = v;
            }
          },
        ),

        const SizedBox(height: 20),
        _bigTitle("Numbers"),
        const SizedBox(height: 10),

        // Value
        TextFormField(
          controller: _valueCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
          decoration: _dec("Current Value (₹)", icon: Icons.currency_rupee_rounded),
          validator: (val) =>
          (_asDouble(_valueCtrl) <= 0) ? "Enter a valid amount" : null,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),

        // Qty + Avg Buy
        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: _qtyCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                decoration: _dec("Quantity", icon: Icons.numbers_rounded, hint: "Optional"),
                onChanged: (_) => setState(_maybeAutoCalcValue),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _avgCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                decoration: _dec("Avg Buy (₹)", icon: Icons.calculate_rounded, hint: "Optional"),
                onChanged: (_) => setState(_maybeAutoCalcValue),
              ),
            ),
          ],
        ),

        const SizedBox(height: 10),

        // Purchase value/date + Valuation date
        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: _purchaseValueCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                decoration: _dec("Purchase Value (₹)", icon: Icons.local_atm_rounded, hint: "Optional"),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _DatePickerField(
                label: "Purchase Date",
                icon: Icons.event_available_rounded,
                date: _purchaseDate,
                brand: _brand,
                onPick: (d) => setState(() => _purchaseDate = d),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _DatePickerField(
          label: "Valuation Date",
          icon: Icons.insights_rounded,
          date: _valuationDate,
          brand: _brand,
          onPick: (d) => setState(() => _valuationDate = d),
        ),

        const SizedBox(height: 20),
        _bigTitle("Meta"),
        const SizedBox(height: 10),

        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: _currencyCtrl,
                decoration: _dec("Currency", icon: Icons.public_rounded, hint: "INR / USD…"),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _logoHintCtrl,
                decoration: _dec("Logo Hint", icon: Icons.image_rounded, hint: "eg. HDFC, Zerodha"),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        TextFormField(
          controller: _tagsCtrl,
          decoration: _dec("Tags", icon: Icons.sell_rounded, hint: "Comma separated (eg. long term, tax)"),
        ),
        const SizedBox(height: 10),

        TextFormField(
          controller: _notesCtrl,
          maxLines: 3,
          decoration: _dec("Notes (optional)", icon: Icons.notes_rounded),
        ),

        const SizedBox(height: 20),

        _saving
            ? const Center(child: CircularProgressIndicator())
            : SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            icon: const Icon(Icons.check_circle_rounded),
            label: const Text("Add Asset"),
            style: ElevatedButton.styleFrom(
              backgroundColor: _brand,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 2,
            ),
            onPressed: _save,
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            _didPersist ? "Saved • You can close this page." : "Tip: qty × avg auto-fills value.",
            style: TextStyle(fontSize: 12, color: Colors.grey[600], fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(64),
        child: _GlassAppBar(
          top: _brand,
          bottom: const Color(0xFF0B3B34),
          child: SafeArea(
            bottom: false,
            child: Column(
              children: const [
                SizedBox(height: 8),
                Text(
                  "Add Asset",
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 20,
                    letterSpacing: -.2,
                    shadows: [Shadow(color: Color(0x33000000), blurRadius: 8, offset: Offset(0, 2))],
                  ),
                ),
                SizedBox(height: 8),
              ],
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          SafeArea(child: body),
          // Success overlay
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
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---------- bits ----------
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
              Text(title, style: TextStyle(color: _brand, fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: -.2)),
              const SizedBox(height: 4),
              Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _bigTitle(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Text(
      text,
      style: TextStyle(
        fontWeight: FontWeight.w900,
        color: _brand,
        fontSize: 18,
        letterSpacing: -.2,
      ),
    ),
  );
}

// ------------------ Sub-widgets ------------------

class _GlassAppBar extends StatelessWidget {
  final Color top;
  final Color bottom;
  final Widget child;
  const _GlassAppBar({Key? key, required this.top, required this.bottom, required this.child}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [top, bottom]),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 4))],
      ),
      child: child,
    );
  }
}

class _DropdownWithOther extends StatelessWidget {
  final String label;
  final IconData icon;
  final List<String> options;
  final String? selected;
  final TextEditingController controller;
  final Color brand;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String?> onChanged;

  const _DropdownWithOther({
    Key? key,
    required this.label,
    required this.icon,
    required this.options,
    required this.selected,
    required this.controller,
    required this.brand,
    required this.onChanged,
    this.validator,
  }) : super(key: key);

  bool get _isOther => selected == _other;

  static const _other = 'Other…';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: selected,
          isExpanded: true,
          items: options.map((o) => DropdownMenuItem(value: o, child: Text(o))).toList(),
          onChanged: (v) {
            onChanged(v);
            if (v != _other && v != null) {
              controller.text = v;
            } else {
              controller.clear();
            }
          },
          validator: validator,
          decoration: InputDecoration(
            labelText: label,
            isDense: true,
            prefixIcon: Icon(icon),
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
            child: TextFormField(
              controller: controller,
              decoration: InputDecoration(
                labelText: "Enter $label",
                isDense: true,
                prefixIcon: Icon(icon),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
              validator: (val) {
                if (_isOther && (controller.text.trim().isEmpty)) {
                  return "Please enter $label";
                }
                return null;
              },
            ),
          )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}

class _SubTypeField extends StatelessWidget {
  final String typeKey;
  final List<String> options;
  final String? selected;
  final TextEditingController controller;
  final Color brand;
  final ValueChanged<String?> onChanged;

  static const _other = 'Other…';

  const _SubTypeField({
    Key? key,
    required this.typeKey,
    required this.options,
    required this.selected,
    required this.controller,
    required this.brand,
    required this.onChanged,
  }) : super(key: key);

  bool get _isOther => selected == _other;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: selected,
          isExpanded: true,
          items: options.map((o) => DropdownMenuItem(value: o, child: Text(o))).toList(),
          onChanged: (v) {
            onChanged(v);
            if (v != _other && v != null) {
              controller.text = v;
            } else {
              controller.clear();
            }
          },
          decoration: InputDecoration(
            labelText: "Sub-type",
            isDense: true,
            prefixIcon: const Icon(Icons.scatter_plot_rounded),
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
          child: _isOther
              ? Padding(
            padding: const EdgeInsets.only(top: 8),
            child: TextFormField(
              controller: controller,
              decoration: InputDecoration(
                labelText: "Enter Sub-type",
                isDense: true,
                prefixIcon: const Icon(Icons.scatter_plot_rounded),
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

class _InstitutionField extends StatelessWidget {
  final String typeKey;
  final List<String> options;
  final String? selected;
  final TextEditingController controller;
  final Color brand;
  final ValueChanged<String?> onChanged;

  static const _other = 'Other…';

  const _InstitutionField({
    Key? key,
    required this.typeKey,
    required this.options,
    required this.selected,
    required this.controller,
    required this.brand,
    required this.onChanged,
  }) : super(key: key);

  bool get _showDropdown => options.isNotEmpty;
  bool get _isOther => selected == _other;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: selected,
          isExpanded: true,
          items: options.map((o) => DropdownMenuItem(value: o, child: Text(o, overflow: TextOverflow.ellipsis))).toList(),
          onChanged: (v) {
            onChanged(v);
            if (v != _other && v != null) {
              controller.text = v;
            } else {
              controller.clear();
            }
          },
          decoration: InputDecoration(
            labelText: "Institution / Provider",
            isDense: true,
            prefixIcon: const Icon(Icons.account_balance_rounded),
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
            child: TextFormField(
              controller: controller,
              decoration: InputDecoration(
                labelText: "Enter Institution",
                isDense: true,
                prefixIcon: const Icon(Icons.account_balance_rounded),
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

class _DatePickerField extends StatelessWidget {
  final String label;
  final IconData icon;
  final DateTime? date;
  final Color brand;
  final ValueChanged<DateTime?> onPick;

  const _DatePickerField({
    Key? key,
    required this.label,
    required this.icon,
    required this.date,
    required this.brand,
    required this.onPick,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final txt = date == null
        ? label
        : DateFormat('d MMM, yyyy').format(date!);

    return OutlinedButton.icon(
      icon: Icon(icon, color: brand),
      label: Text(txt, style: const TextStyle(fontWeight: FontWeight.w700)),
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        side: BorderSide(color: brand.withOpacity(.3)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      onPressed: () async {
        final now = DateTime.now();
        final picked = await showDatePicker(
          context: context,
          initialDate: date ?? now,
          firstDate: DateTime(1990),
          lastDate: DateTime(now.year + 10),
        );
        onPick(picked);
      },
    );
  }
}

class _SuccessCard extends StatelessWidget {
  final Color brand;
  final VoidCallback onDone;
  const _SuccessCard({Key? key, required this.brand, required this.onDone}) : super(key: key);

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
          Text("Your asset has been added.", textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[700], fontWeight: FontWeight.w600)),
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
      ),
    );
  }
}
