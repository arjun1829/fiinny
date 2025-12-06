// lib/screens/add_asset_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../core/ads/ads_shell.dart';
import '../models/asset_model.dart';
import '../models/stock_ticker_model.dart'; // New Import
import '../services/asset_service.dart';
import '../services/stock_search_service.dart'; // New Service
import '../themes/tokens.dart'; // For tokens if needed, though we use custom brand color here

class AddAssetScreen extends StatefulWidget {
  final String userId;
  const AddAssetScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddAssetScreen> createState() => _AddAssetScreenState();
}

class _AddAssetScreenState extends State<AddAssetScreen> with TickerProviderStateMixin {
  // Mode: 'search' or 'manual'
  bool _isSearchMode = true; 

  // ------------ Search Logic ------------
  final _searchCtrl = TextEditingController();
  List<StockTickerModel> _searchResults = [];
  bool _searching = false;
  Timer? _debounce;

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
  bool _loadingPrice = false; // New state for RT price fetch
  bool _didPersist = false;

  // Success overlay
  bool _showSuccess = false;
  late final AnimationController _successCtl =
  AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
  late final Animation<double> _successScale =
  CurvedAnimation(parent: _successCtl, curve: Curves.easeOutBack);

  // Formatting
  Color get _brand => const Color(0xFF0E9784);

  // ------------ Options ------------
  static const _other = 'Other…';

  static const _titleOptions = [
    'Fixed Deposit', 'Mutual Fund', 'ETF', 'Equity Stock', 'Gold', 
    'Bonds', 'Crypto', 'Savings Account', 'Property', _other,
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
    'cash_bank': ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak', 'IDFC First', _other],
    'fixed_deposit': ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Bajaj Finance', 'HDFC Ltd', _other],
    'mf_etf': ['SBI Mutual Fund', 'HDFC AMC', 'Mirae', 'Nippon', 'ICICI Prudential AMC', _other],
    'equity': ['Zerodha', 'Upstox', 'ICICI Direct', 'HDFC Securities', 'Groww', _other],
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
    // Start with empty search results or popular ones
    _onSearchChanged(''); 
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _successCtl.dispose();
    _searchCtrl.dispose();
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
    // Auto-calc value = qty * avg when both present
    final q = _asDouble(_qtyCtrl);
    final a = _asDouble(_avgCtrl);
    if (q > 0 && a > 0) {
      final v = q * a;
      _valueCtrl.text = v.toStringAsFixed(2);
    }
  }

  List<String> _instOptionsForType(String type) => _institutions[type] ?? [_other];
  List<String> _subOptionsForType(String type) => _subTypeMap[type] ?? [_other];

  void _onSearchChanged(String query) {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    setState(() => _searching = true);
    
    _debounce = Timer(const Duration(milliseconds: 600), () async {
      // If empty, maybe show popular? For now just empty or logic in service
      final results = await StockSearchService().search(query);
      if (!mounted) return;
      setState(() {
          _searchResults = results;
          _searching = false;
      });
    });
  }

  Future<void> _selectStock(StockTickerModel partial) async {
      // 1. Show loading overlay
      setState(() => _loadingPrice = true);

      // 2. Fetch real-time price & details
      StockTickerModel stock;
      try {
         stock = await StockSearchService().enrich(partial);
      } catch (e) {
         // Fallback to partial if fetch fails
         stock = partial;
         print("Enrich failed: $e");
      }

      if (!mounted) return;

      // 3. Auto-fill form and switch to manual mode
      setState(() {
          _loadingPrice = false;
          _isSearchMode = false;
          
          // Title
          _titleCtrl.text = stock.name;
          _titleSelected = _other; // Custom title
          
          // Type/Subtype
          if (stock.sector.contains('Mutual Fund')) {
              _type = 'mf_etf';
          } else if (stock.sector.contains('ETF')) {
              _type = 'mf_etf';
          } else if (stock.sector.contains('Gold')) {
              _type = 'gold';
          } else if (stock.sector.contains('Crypto')) {
              _type = 'crypto';
          } else {
              _type = 'equity';
          }
           
          // Price
          if (stock.price > 0) {
              _avgCtrl.text = stock.price.toStringAsFixed(2);
          } else {
             _avgCtrl.clear();
          }

          // Clear value so user inputs qty to calc
          _valueCtrl.text = ''; 
          _qtyCtrl.text = '';

          // Logo / Tags
          // Use symbol for logo hint
          _logoHintCtrl.text = stock.symbol; 
          _tagsCtrl.text = "${stock.exchange}, ${stock.sector}";
      });
  }

  // ------------ Save ------------
  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please fix the highlighted fields.")));
      return;
    }

    setState(() => _saving = true);
    try {
      final tags = _tagsCtrl.text.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();

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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Failed to save: $e")));
    } finally {
      setState(() => _saving = false);
    }
  }

  // ------------ UI ------------
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50], // Match new design
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(60),
        child: Container(
          decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset:const  Offset(0, 2))]),
          child: SafeArea(
              bottom: false,
              child: Row(
                  children: [
                      IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.arrow_back_rounded, color: Colors.black)),
                      const Text("Add Asset", style: TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontSize: 18)),
                      const Spacer(),
                      if (!_isSearchMode)
                        TextButton(
                            onPressed: () => setState(() => _isSearchMode = true), 
                            child: Text("Search Mode", style: TextStyle(color: _brand, fontWeight: FontWeight.w600))
                        )
                  ],
              )
          ),
        ),
      ),
      body: Stack(
        children: [
            // Content
            _isSearchMode ? _buildSearchScreen() : _buildManualForm(),

            // Loading Price Overlay
            if (_loadingPrice)
               Container(
                   color: Colors.white.withOpacity(0.8),
                   child: const Center(
                       child: Column(
                           mainAxisSize: MainAxisSize.min,
                           children: [
                               CircularProgressIndicator(),
                               SizedBox(height: 16),
                               Text("Fetching Live Price...", style: TextStyle(fontWeight: FontWeight.w600))
                           ],
                       )
                   )
               ),

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

  // ------------ Search Screen ------------
  Widget _buildSearchScreen() {
      return Column(
          children: [
              // Search Bar
              Container(
                  padding: const EdgeInsets.all(16),
                  color: Colors.white,
                  child: TextField(
                      controller: _searchCtrl,
                      autofocus: true,
                      decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.search_rounded, color: Colors.grey),
                          hintText: "Search Stocks (e.g. RELIANCE, GOLD)",
                          filled: true,
                          fillColor: Colors.grey[100],
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      ),
                      onChanged: _onSearchChanged,
                  ),
              ),
              
              // Import CAS Banner
              GestureDetector(
                onTap: () {
                   // Placeholder for CAS Import Flow
                   ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Coming Soon: Import from CAS PDF!")));
                },
                child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [Colors.blue.shade50, Colors.white]),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.blue.shade100)
                    ),
                    child: Row(
                        children: [
                            Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(color: Colors.blue.withOpacity(0.1), shape: BoxShape.circle),
                                child: const Icon(Icons.cloud_upload_rounded, color: Colors.blue, size: 20),
                            ),
                            const SizedBox(width: 12),
                            const Expanded(child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                    Text("Auto-Import from Email/CAS", style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Colors.black87)),
                                    Text("The fastest way to track portfolio.", style: TextStyle(fontSize: 11, color: Colors.grey)),
                                ],
                            )),
                            const Icon(Icons.chevron_right_rounded, color: Colors.blue),
                        ],
                    ),
                ),
              ),

              const Divider(height: 1),

              // Results
              Expanded(
                  child: _searching 
                    ? const Center(child: CircularProgressIndicator()) 
                    : _searchResults.isEmpty 
                        ? _buildEmptySearchState()
                        : ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: _searchResults.length,
                            separatorBuilder: (_,__) => const Divider(height: 1),
                            itemBuilder: (ctx, i) {
                                final stock = _searchResults[i];
                                return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: Container(
                                        width: 40, height: 40,
                                        decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(8)),
                                        alignment: Alignment.center,
                                        child: Text(stock.symbol.isNotEmpty ? stock.symbol[0] : '?', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                                    ),
                                    title: Text(stock.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    subtitle: Text("${stock.exchange} • ${stock.sector}"),
                                    // Don't show price in list if we don't have it yet, keeps it clean
                                    trailing: const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Colors.grey),
                                    onTap: () => _selectStock(stock),
                                );
                            },
                        ),
              ),
              
              // Manual Override
              Padding(
                  padding: const EdgeInsets.all(16),
                  child: TextButton(
                      onPressed: () => setState(() => _isSearchMode = false),
                      child: const Text("Can't find it? Add Manually", style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w600)),
                  ),
              )
          ],
      );
  }

  Widget _buildEmptySearchState() {
      // Suggest top searches or categories if query is empty
      if (_searchCtrl.text.isEmpty) {
          return Center(
             child: Column(
                 mainAxisAlignment: MainAxisAlignment.center,
                 children: [
                     const Icon(Icons.trending_up_rounded, size: 48, color: Colors.grey),
                     const SizedBox(height: 12),
                     const Text("Start typing to search stocks...", style: TextStyle(color: Colors.grey)),
                     const SizedBox(height: 24),
                     Wrap(
                         spacing: 8,
                         children: ["HDFC", "Reliance", "Gold", "Nifty"].map((s) => ActionChip(
                             label: Text(s),
                             onPressed: () { 
                                 _searchCtrl.text = s;
                                 _onSearchChanged(s);
                             },
                         )).toList()
                     )
                 ],
             ),  
          );
      }
      return const Center(child: Text("No results found. Try adding manually.", style: TextStyle(color: Colors.grey)));
  }


  // ------------ Manual Form (Refactored from original) ------------
  Widget _buildManualForm() {
    return Form(
      key: _formKey,
      child: ListView(
      padding: EdgeInsets.fromLTRB(16, 18, 16, context.adsBottomPadding(extra: 28)),
      children: [
        _heroTip(
            _titleCtrl.text.isNotEmpty ? "Completing details for ${_titleCtrl.text}" : "Add Custom Asset",
            "Fill in the details. Use the Qty × Avg fields to auto-calculate current value."
        ),
        const SizedBox(height: 18),

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
          validator: (val) => (_titleCtrl.text.trim().isEmpty) ? "Enter a valid title" : null,
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
                items: _types.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis))).toList(),
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
              _logoHintCtrl.text = v;
            }
          },
        ),

        const SizedBox(height: 20),
        _bigTitle("Numbers"),
        const SizedBox(height: 10),

        // Qty + Avg Buy (Moved up for better flow in stock mode)
        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: _qtyCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                decoration: _dec("Quantity", icon: Icons.numbers_rounded, hint: "eg. 10"),
                onChanged: (_) => setState(_maybeAutoCalcValue),
                 validator: (val) {
                    // Make Qty required if Avg is entered or generally for stocks
                    if (_type == 'equity' && _asDouble(_qtyCtrl) <=0 && _asDouble(_valueCtrl) <= 0) return "Req.";
                    return null;
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _avgCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                decoration: _dec("Avg Price / Unit", icon: Icons.trending_up, hint: "Current Price"),
                onChanged: (_) => setState(_maybeAutoCalcValue),
              ),
            ),
          ],
        ),
         const SizedBox(height: 10),

        // Value
        TextFormField(
          controller: _valueCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
          decoration: _dec("Total Value (₹)", icon: Icons.currency_rupee_rounded),
          validator: (val) => (_asDouble(_valueCtrl) <= 0) ? "Enter a valid amount" : null,
          onChanged: (_) => setState(() {}),
        ),
        
        const SizedBox(height: 10),

        // Purchase info
        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: _purchaseValueCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                decoration: _dec("Invested Amt (₹)", icon: Icons.local_atm_rounded, hint: "Optional"),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _DatePickerField(
                label: "Date",
                icon: Icons.event_available_rounded,
                date: _purchaseDate,
                brand: _brand,
                onPick: (d) => setState(() => _purchaseDate = d),
              ),
            ),
          ],
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
          decoration: _dec("Tags", icon: Icons.sell_rounded, hint: "Comma separated"),
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
      ],
    )
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
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: _brand)),
      labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
    );
  }

  Widget _heroTip(String title, String text) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: _brand.withOpacity(0.1), shape: BoxShape.circle),
            child: Icon(Icons.auto_awesome, color: _brand, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(color: Colors.black87, fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 2),
              Text(text, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _bigTitle(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Text(text, style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black87, fontSize: 16)),
  );
}

// ------------------ Sub-widgets (Reusable) ------------------

class _DropdownWithOther extends StatelessWidget {
  final String label;
  final IconData icon;
  final List<String> options;
  final String? selected;
  final TextEditingController controller;
  final Color brand;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String?> onChanged;

  const _DropdownWithOther({Key? key, required this.label, required this.icon, required this.options, required this.selected, required this.controller, required this.brand, required this.onChanged, this.validator}) : super(key: key);

  bool get _isOther => selected == 'Other…';

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
            if (v != 'Other…' && v != null) { controller.text = v; } else { controller.clear(); }
          },
          validator: validator,
          decoration: InputDecoration(
            labelText: label,
            isDense: true,
            prefixIcon: Icon(icon),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
          ),
        ),
        if (_isOther)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: TextFormField(
              controller: controller,
              decoration: InputDecoration(
                labelText: "Enter $label",
                isDense: true,
                prefixIcon: Icon(icon),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
              ),
            ),
          )
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

  const _SubTypeField({Key? key, required this.typeKey, required this.options, required this.selected, required this.controller, required this.brand, required this.onChanged}) : super(key: key);

  @override
  Widget build(BuildContext context) {
      return _DropdownWithOther(
          label: "Sub-Type",
          icon: Icons.bookmark_border_rounded,
          options: options,
          selected: selected,
          controller: controller,
          brand: brand,
          onChanged: onChanged
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

  const _InstitutionField({Key? key, required this.typeKey, required this.options, required this.selected, required this.controller, required this.brand, required this.onChanged}) : super(key: key);

  @override
  Widget build(BuildContext context) {
      return _DropdownWithOther(
          label: "Institution",
          icon: Icons.account_balance_rounded,
          options: options,
          selected: selected,
          controller: controller,
          brand: brand,
          onChanged: onChanged
      );
  }
}

class _DatePickerField extends StatelessWidget {
  final String label;
  final IconData icon;
  final DateTime? date;
  final Color brand;
  final ValueChanged<DateTime> onPick;

  const _DatePickerField({Key? key, required this.label, required this.icon, required this.date, required this.brand, required this.onPick}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        final d = await showDatePicker(
          context: context,
          initialDate: date ?? DateTime.now(),
          firstDate: DateTime(2000),
          lastDate: DateTime(2030),
        );
        if (d != null) onPick(d);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: Colors.grey[600]),
            const SizedBox(width: 12),
            Text(
              date == null ? label : DateFormat("dd MMM yyyy").format(date!),
              style: TextStyle(fontSize: 14, color: date == null ? Colors.grey[600] : Colors.black87),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuccessCard extends StatelessWidget {
  final Color brand;
  final VoidCallback onDone;
  const _SuccessCard({required this.brand, required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 280,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: brand.withOpacity(0.1), shape: BoxShape.circle),
            child: Icon(Icons.check_rounded, color: brand, size: 48),
          ),
          const SizedBox(height: 16),
          const Text("Asset Added!", style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20)),
          const SizedBox(height: 8),
          const Text("Your portfolio has been updated.", textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onDone,
              style: ElevatedButton.styleFrom(backgroundColor: brand, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30))),
              child: const Text("Done"),
            ),
          )
        ],
      ),
    );
  }
}
