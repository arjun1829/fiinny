// lib/widgets/unified_transaction_list.dart
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/friend_model.dart';
import '../themes/custom_card.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/user_overrides.dart';

// ✅ for inline ads inside the details sheet
import '../core/ads/ads_banner_card.dart';
import '../core/filters/transaction_filter.dart';

class UnifiedTransactionList extends StatefulWidget {
  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final int previewCount;
  final String filterType; // "All", "Income", "Expense"
  final Map<String, FriendModel> friendsById;

  final Function(dynamic tx)? onEdit;
  final Function(dynamic tx)? onDelete;
  final Function(dynamic tx)? onSplit;
  final bool showBillIcon;
  final String userPhone;

  // Multi-select
  final bool multiSelectEnabled;
  final Set<String> selectedIds;
  final void Function(String txId, bool selected)? onSelectTx;

  // Optional unified docs
  final List<Map<String, dynamic>>? unifiedDocs;

  // Category dropdown options
  final List<String> categoryOptions;

  // ✅ tell parent when a modal/sheet/dialog opens/closes (so it can hide the anchored banner)
  final VoidCallback? onBeginModal;
  final VoidCallback? onEndModal;

  // Optional persistor
  final Future<void> Function({
    required String txId,
    required String newCategory,
    required dynamic payload,
  })? onChangeCategory;

  final TransactionFilter? filter;
  final SortSpec? sort;
  final GroupBy? groupBy;
  final void Function(List<Map<String, dynamic>> normalized)? onNormalized;

  // ---------- NEW (all optional, back-compat defaults) ----------
  /// Override currency symbol (default: ₹)
  final String? currencySymbol;

  /// Allow/disallow swipe edit/delete (default: true)
  final bool enableSwipeActions;

  /// Show category dropdown in each row (default: true)
  final bool showCategoryDropdown;

  /// Open details sheet on tap (default: true)
  final bool enableDetailsSheet;

  /// Inject inline ad inside each group after Nth row (default: 2 → 3rd row, same as old behavior)
  final int inlineAdAfterIndex;

  /// Show top banner ad (default: true)
  final bool showTopBannerAd;

  /// Show bottom banner ad (default: true)
  final bool showBottomBannerAd;

  /// Increment when user taps "Show More" (default: 10)
  final int showMoreStep;

  /// Custom empty-state builder; fallback to simple text when null
  final Widget Function(BuildContext context)? emptyBuilder;

  /// Intercept row tap; return true to mark as handled (no default sheet)
  final bool Function(Map<String, dynamic> normalized)? onRowTapIntercept;

  /// Enable/disable inline ad injection (default: true)
  final bool enableInlineAds;

  const UnifiedTransactionList({
    Key? key,
    required this.expenses,
    required this.incomes,
    required this.friendsById,
    required this.userPhone,
    this.previewCount = 10,
    this.filterType = "All",
    this.onEdit,
    this.onDelete,
    this.onSplit,
    this.showBillIcon = false,
    this.multiSelectEnabled = false,
    this.selectedIds = const {},
    this.onSelectTx,
    this.unifiedDocs,
    this.categoryOptions = const [
      "General",
      "Fuel",
      "Groceries",
      "Food",
      "Travel",
      "Shopping",
      "Bills",
      "Recharge",
      "Subscriptions",
      "Healthcare",
      "Education",
      "Entertainment",
      "Loan EMI",
      "Fees/Charges",
      "Income",
      "Other",
    ],
    this.onChangeCategory,
    this.onBeginModal,
    this.onEndModal,
    this.filter,
    this.sort,
    this.groupBy,
    this.onNormalized,

    // NEW optional args (safe defaults)
    this.currencySymbol,
    this.enableSwipeActions = true,
    this.showCategoryDropdown = true,
    this.enableDetailsSheet = true,
    this.inlineAdAfterIndex = 2, // same visual position as old i == 2
    this.showTopBannerAd = true,
    this.showBottomBannerAd = true,
    this.showMoreStep = 10,
    this.emptyBuilder,
    this.onRowTapIntercept,
    this.enableInlineAds = true,
  }) : super(key: key);

  @override
  State<UnifiedTransactionList> createState() => _UnifiedTransactionListState();
}

class _UnifiedTransactionListState extends State<UnifiedTransactionList> {
  // Normalized item (per row) with enriched fields:
  // {'mode':'legacy'|'unified', 'type':'expense'|'income', 'id':String, 'date':DateTime,
  //  'amount':double, 'category':String, 'note':String, 'raw':dynamic,
  //  'merchant':String?, 'bankLogo':String?, 'schemeLogo':String?, 'cardLast4':String?, 'channel':String?,
  //  'instrument':String?, 'network':String?, 'issuerBank':String?, 'counterparty':String?,
  //  'isInternational':bool, 'hasFees':bool,
  //  'tags':String?, 'labels': List<String>, 'title': String?}
  late List<Map<String, dynamic>> allTx;
  int shownCount = 10;
  TransactionFilter _activeFilter = TransactionFilter.defaults();

  late NumberFormat _inCurrency;

  @override
  void initState() {
    super.initState();
    shownCount = widget.previewCount;
    _inCurrency = NumberFormat.currency(
      locale: 'en_IN',
      symbol: widget.currencySymbol ?? '₹',
      decimalDigits: 2,
    );
    _combine();
  }

  @override
  void didUpdateWidget(covariant UnifiedTransactionList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (shownCount < widget.previewCount) {
      shownCount = widget.previewCount;
    }
    final bool changed =
        oldWidget.unifiedDocs != widget.unifiedDocs ||
            oldWidget.expenses != widget.expenses ||
            oldWidget.incomes != widget.incomes ||
            oldWidget.filterType != widget.filterType ||
            oldWidget.previewCount != widget.previewCount ||
            oldWidget.filter != widget.filter ||
            oldWidget.sort != widget.sort ||
            oldWidget.groupBy != widget.groupBy ||
            oldWidget.currencySymbol != widget.currencySymbol;

    if (oldWidget.currencySymbol != widget.currencySymbol) {
      _inCurrency = NumberFormat.currency(
        locale: 'en_IN',
        symbol: widget.currencySymbol ?? '₹',
        decimalDigits: 2,
      );
    }

    if (changed) {
      _combine();
    }
  }

  // -------------------- DYNAMIC READ HELPERS --------------------
  T? _dyn<T>(dynamic obj, String field) {
    try {
      final v = (obj as dynamic)?.toJson?.call();
      if (v is Map<String, dynamic> && v.containsKey(field)) {
        final val = v[field];
        if (val is T) return val;
        if (val == null) return null;
        if (T == String) return val.toString() as T;
        if (T == double && val is num) return val.toDouble() as T;
        if (T == int && val is num) return val.toInt() as T;
      }
    } catch (_) {}
    try {
      if (obj is Map) {
        final val = obj[field];
        if (val is T) return val;
        if (val == null) return null;
        if (T == String) return val.toString() as T;
        if (T == double && val is num) return val.toDouble() as T;
        if (T == int && val is num) return val.toInt() as T;
      }
    } catch (_) {}
    try {
      final v = (obj as dynamic);
      switch (field) {
        case 'category':
          return (v.category as T?);
        case 'subcategory':
          return (v.subcategory as T?);
        case 'merchant':
          return (v.merchant as T?);
        case 'tags':
          return (v.tags as T?);
        case 'cardLast4':
          return (v.cardLast4 as T?);
        case 'title':
          return (v.title as T?);
        case 'comments':
          return (v.comments as T?);
        case 'labels':
          return (v.labels as T?);
        case 'counterparty':
          return (v.counterparty as T?);
        case 'instrument':
          return (v.instrument as T?);
        case 'instrumentNetwork':
          return (v.instrumentNetwork as T?);
        case 'issuerBank':
          return (v.issuerBank as T?);
        case 'isInternational':
          return (v.isInternational as T?);
        case 'fees':
          return (v.fees as T?);
        default:
          return null;
      }
    } catch (_) {}
    return null;
  }

  String _legacyResolvedCategory(dynamic item, {required bool isIncome}) {
    final String? cat =
        _dyn<String>(item, 'category') ?? _dyn<String>(item, 'subcategory');
    if (cat != null && cat.trim().isNotEmpty) return cat.trim();

    try {
      final json = (item as dynamic).toJson?.call();
      if (json is Map<String, dynamic>) {
        final c = (json['category'] ?? json['subcategory'])?.toString();
        if (c != null && c.trim().isNotEmpty) return c.trim();
      }
    } catch (_) {}

    final String t = (item is ExpenseItem || item is IncomeItem)
        ? (item as dynamic).type?.toString() ?? ''
        : '';
    if (t.isNotEmpty) return t;
    return isIncome ? 'Income' : 'General';
  }

  String _legacyMerchant(dynamic item) {
    final m = _dyn<String>(item, 'merchant') ??
        (() {
          try {
            final j = (item as dynamic).toJson?.call();
            if (j is Map<String, dynamic> && j['merchant'] != null) {
              return j['merchant'].toString();
            }
          } catch (_) {}
          return null;
        })();
    return (m ?? '').trim();
  }

  String _legacyTags(dynamic item) {
    try {
      final j = (item as dynamic).toJson?.call();
      if (j is Map<String, dynamic>) {
        final t = j['tags'];
        if (t is Map && t['type'] != null) return t['type'].toString();
        if (t is String) return t;
      }
    } catch (_) {}
    final direct = _dyn<String>(item, 'tags');
    return (direct ?? '').toString();
  }

  double _legacyCategoryConfidence(dynamic item) {
    final direct = _dyn<double>(item, 'categoryConfidence');
    if (direct != null) return direct;
    try {
      final json = (item as dynamic).toJson?.call();
      if (json is Map<String, dynamic>) {
        final num? raw = json['categoryConfidence'] as num?;
        if (raw != null) return raw.toDouble();
      }
    } catch (_) {}
    return 0.0;
  }

  String _legacyCategorySource(dynamic item) {
    final direct = _dyn<String>(item, 'categorySource');
    if (direct != null && direct.trim().isNotEmpty) return direct.trim();
    try {
      final json = (item as dynamic).toJson?.call();
      if (json is Map<String, dynamic>) {
        final v = json['categorySource'];
        if (v is String && v.trim().isNotEmpty) return v.trim();
      }
    } catch (_) {}
    return '';
  }

  String _legacyMerchantKey(dynamic item, String merchant) {
    final direct = _dyn<String>(item, 'merchantKey');
    if (direct != null && direct.trim().isNotEmpty) {
      return direct.trim().toUpperCase();
    }
    try {
      final json = (item as dynamic).toJson?.call();
      if (json is Map<String, dynamic>) {
        final mk = json['merchantKey'];
        if (mk is String && mk.trim().isNotEmpty) {
          return mk.trim().toUpperCase();
        }
      }
    } catch (_) {}
    return merchant.trim().isEmpty ? '' : merchant.trim().toUpperCase();
  }

  String _legacyCardLast4(dynamic item) {
    final s = _dyn<String>(item, 'cardLast4');
    return (s ?? '').trim();
  }

  String? _legacyCounterparty(dynamic item) => _dyn<String>(item, 'counterparty');
  String? _legacyInstrument(dynamic item) => _dyn<String>(item, 'instrument');
  String? _legacyNetwork(dynamic item) => _dyn<String>(item, 'instrumentNetwork');
  String? _legacyIssuer(dynamic item) => _dyn<String>(item, 'issuerBank');
  bool _legacyIsIntl(dynamic item) => (_dyn<bool>(item, 'isInternational') ?? false);
  bool _legacyHasFees(dynamic item) {
    final f = _dyn<Map<String, dynamic>>(item, 'fees');
    return f != null && f.isNotEmpty;
  }

  List<String> _legacyLabels(dynamic item) {
    final labels = <String>[];
    try {
      final arr = _dyn<List<dynamic>>(item, 'labels');
      if (arr != null) {
        labels.addAll(arr.whereType<String>());
      }
    } catch (_) {}
    final legacySingle = _dyn<String>(item, 'label');
    if (legacySingle != null && legacySingle.trim().isNotEmpty) {
      labels.add(legacySingle.trim());
    }
    final seen = <String>{};
    return labels
        .where((l) => l.trim().isNotEmpty && seen.add(l.toLowerCase()))
        .toList();
  }

  String? _legacyTitle(dynamic item) => _dyn<String>(item, 'title');

  String _billUrlFromUnified(Map<String, dynamic> raw) {
    final a = (raw['billImageUrl'] ?? raw['attachmentUrl']);
    return (a == null) ? '' : a.toString();
  }

  String _billUrlFromLegacy(dynamic raw) {
    try {
      final json = (raw as dynamic).toJson?.call();
      if (json is Map<String, dynamic>) {
        final v = json['billImageUrl'] ?? json['attachmentUrl'];
        return (v == null) ? '' : v.toString();
      }
      final v = (raw.billImageUrl ?? raw.attachmentUrl);
      return (v == null) ? '' : v.toString();
    } catch (_) {
      return '';
    }
  }

  Future<void> _saveOverrideIfPossible(String category, Map<String, dynamic> normalized) async {
    final mk = _normalizedMerchantKey(normalized);
    if (mk.isEmpty) return;
    try {
      await UserOverrides.setCategoryForMerchant(widget.userPhone, mk, category);
    } catch (_) {}
  }

  String _normalizedMerchantKey(Map<String, dynamic> tx) {
    final mk = (tx['merchantKey'] ?? '').toString().trim();
    if (mk.isNotEmpty) return mk.toUpperCase();
    final merchant = (tx['merchant'] ?? '').toString().trim();
    if (merchant.isNotEmpty) return merchant.toUpperCase();
    final counterparty = (tx['counterparty'] ?? '').toString().trim();
    if (counterparty.isNotEmpty) return counterparty.toUpperCase();
    return '';
  }

  void _combine() {
    if (widget.unifiedDocs != null) {
      allTx = _fromUnified(widget.unifiedDocs!);
    } else {
      allTx = _fromLegacy(widget.expenses, widget.incomes);
    }

    if (widget.filterType == "Income") {
      allTx = allTx.where((t) => t['type'] == 'income').toList();
    } else if (widget.filterType == "Expense") {
      allTx = allTx.where((t) => t['type'] == 'expense').toList();
    }
    final base = List<Map<String, dynamic>>.from(allTx);
    widget.onNormalized?.call(base);

    var f = widget.filter ?? TransactionFilter.defaults();
    if (widget.sort != null && widget.sort != f.sort) {
      f = f.copyWith(sort: widget.sort);
    }
    if (widget.groupBy != null && widget.groupBy != f.groupBy) {
      f = f.copyWith(groupBy: widget.groupBy);
    }
    _activeFilter = f;
    allTx = applyFilterAndSort(base, f);
  }

  List<Map<String, dynamic>> _fromLegacy(
    List<ExpenseItem> expenses,
    List<IncomeItem> incomes,
  ) {
    final tx = <Map<String, dynamic>>[];

    tx.addAll(expenses.map((e) {
      final cat = _legacyResolvedCategory(e, isIncome: false);
      final merchant = _legacyMerchant(e);
      final tags = _legacyTags(e);
      final last4 = _legacyCardLast4(e);
      final labels = _legacyLabels(e);
      final title = _legacyTitle(e);
      final double confidence = _legacyCategoryConfidence(e);
      final String categorySource = _legacyCategorySource(e);
      final String merchantKey = _legacyMerchantKey(e, merchant);

      return {
        'mode': 'legacy',
        'type': 'expense',
        'id': e.id,
        'date': e.date,
        'amount': (e.amount is num) ? (e.amount as num).toDouble() : 0.0,
        'category': cat,
        'note': e.note,
        'raw': e,
        'merchant': merchant.isEmpty ? null : merchant,
        'bankLogo': e.bankLogo,
        'schemeLogo': null,
        'cardLast4': last4.isEmpty ? null : last4,
        'channel': null,
        'instrument': _legacyInstrument(e),
        'network': _legacyNetwork(e),
        'issuerBank': _legacyIssuer(e),
        'counterparty': _legacyCounterparty(e),
        'isInternational': _legacyIsIntl(e),
        'hasFees': _legacyHasFees(e),
        'tags': tags.isEmpty ? null : tags,
        'labels': labels,
        'categoryConfidence': confidence,
        'categorySource': categorySource,
        'merchantKey': merchantKey.isEmpty ? null : merchantKey,
        'title': (title != null && title.trim().isNotEmpty) ? title.trim() : null,
      };
    }));

    tx.addAll(incomes.map((i) {
      final cat = _legacyResolvedCategory(i, isIncome: true);
      final merchant = _legacyMerchant(i);
      final tags = _legacyTags(i);
      final labels = _legacyLabels(i);
      final title = _legacyTitle(i);
      final double confidence = _legacyCategoryConfidence(i);
      final String categorySource = _legacyCategorySource(i);
      final String merchantKey = _legacyMerchantKey(i, merchant);

      return {
        'mode': 'legacy',
        'type': 'income',
        'id': i.id,
        'date': i.date,
        'amount': (i.amount is num) ? (i.amount as num).toDouble() : 0.0,
        'category': cat,
        'note': i.note,
        'raw': i,
        'merchant': merchant.isEmpty ? null : merchant,
        'bankLogo': i.bankLogo,
        'schemeLogo': null,
        'cardLast4': null,
        'channel': null,
        'instrument': _legacyInstrument(i),
        'network': _legacyNetwork(i),
        'issuerBank': _legacyIssuer(i),
        'counterparty': _legacyCounterparty(i),
        'isInternational': _legacyIsIntl(i),
        'hasFees': _legacyHasFees(i),
        'tags': tags.isEmpty ? null : tags,
        'labels': labels,
        'categoryConfidence': confidence,
        'categorySource': categorySource,
        'merchantKey': merchantKey.isEmpty ? null : merchantKey,
        'title': (title != null && title.trim().isNotEmpty) ? title.trim() : null,
      };
    }));

    return tx;
  }

  DateTime _asDate(dynamic v) {
    if (v == null) return DateTime.now();
    if (v is DateTime) return v;
    try {
      if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
      if (v is double) return DateTime.fromMillisecondsSinceEpoch(v.toInt());
      if (v is String) {
        final parsed = DateTime.tryParse(v);
        if (parsed != null) return parsed;
      }
      final dyn = v as dynamic;
      if (dyn.toDate != null) return dyn.toDate() as DateTime;
    } catch (_) {}
    return DateTime.now();
  }

  double _asDouble(dynamic v) {
    if (v == null) return 0.0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0.0;
  }

  String? _readString(Map<String, dynamic> map, List<String> path) {
    dynamic cur = map;
    for (final key in path) {
      if (cur is Map<String, dynamic> && cur.containsKey(key)) {
        cur = cur[key];
      } else {
        return null;
      }
    }
    if (cur == null) return null;
    return cur.toString();
  }

  bool _readBool(Map<String, dynamic> map, String key) {
    final v = map[key];
    if (v is bool) return v;
    if (v == null) return false;
    final s = v.toString().toLowerCase();
    return s == 'true' || s == '1';
  }

  bool _mapHasFees(Map<String, dynamic> map) {
    final f = map['fees'];
    if (f is Map) {
      return f.isNotEmpty;
    }
    return false;
  }

  List<Map<String, dynamic>> _fromUnified(List<Map<String, dynamic>> docs) {
    final tx = <Map<String, dynamic>>[];

    for (final doc in docs) {
      final channel = _readString(doc, ['meta', 'channel']);
      if (channel == 'CreditCardBill') continue;

      final bool isDebit = (doc['isDebit'] == true);
      final String type = isDebit ? 'expense' : 'income';

      String? _pick(String? s) => (s == null || s.trim().isEmpty) ? null : s.trim();
      final resolvedCat = _pick(doc['category']?.toString()) ??
          _pick(doc['subcategory']?.toString()) ??
          (isDebit ? 'General' : 'Income');

      final labelsArr = <String>[];
      final rawLabels = doc['labels'];
      if (rawLabels is List) {
        for (final x in rawLabels) {
          if (x is String && x.trim().isNotEmpty) labelsArr.add(x.trim());
        }
      }
      final seen = <String>{};
      final labels = labelsArr.where((l) => seen.add(l.toLowerCase())).toList();

      final title = _pick(doc['title']?.toString());
      final double categoryConfidence = _asDouble(doc['categoryConfidence']);
      final String categorySource = (doc['categorySource'] ?? '').toString();
      final String merchantKey = (() {
        final mk = _pick(doc['merchantKey']?.toString());
        if (mk != null && mk.isNotEmpty) return mk.toUpperCase();
        final merch = _pick(doc['merchant']?.toString());
        if (merch != null && merch.isNotEmpty) return merch.toUpperCase();
        return '';
      })();

      tx.add({
        'mode': 'unified',
        'type': type,
        'id': (doc['fingerprint'] ?? doc['id'] ?? '').toString(),
        'date': _asDate(doc['date']),
        'amount': _asDouble(doc['amount']),
        'category': resolvedCat,
        'note': (doc['note'] ?? '').toString(),
        'raw': doc,
        'merchant': (doc['merchant'] ?? '').toString(),
        'bankLogo': _readString(doc, ['badges', 'bankLogo']),
        'schemeLogo': _readString(doc, ['badges', 'schemeLogo']),
        'cardLast4': _readString(doc, ['meta', 'cardLast4']),
        'channel': channel,
        'instrument': _pick(doc['instrument']?.toString()) ?? channel,
        'network': _pick(doc['instrumentNetwork']?.toString()),
        'issuerBank': _pick(doc['issuerBank']?.toString()),
        'counterparty': _pick(doc['counterparty']?.toString()),
        'isInternational': _readBool(doc, 'isInternational'),
        'hasFees': _mapHasFees(doc),
        'tags': (() {
          final t = doc['tags'];
          if (t is Map && t['type'] != null) return t['type'].toString();
          if (t is String) return t;
          return null;
        })(),
        'labels': labels,
        'categoryConfidence': categoryConfidence,
        'categorySource': categorySource,
        'merchantKey': merchantKey.isEmpty ? null : merchantKey,
        'title': title,
      });
    }

    return tx;
  }

  String getDateLabel(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d = DateTime(date.year, date.month, date.day);
    if (d == today) return "Today";
    if (d == today.subtract(const Duration(days: 1))) return "Yesterday";
    return DateFormat('d MMM, yyyy').format(date);
  }

  String _displayGroupLabel(String raw) {
    if (raw.isEmpty) return '';
    if (_activeFilter.groupBy == GroupBy.day) {
      try {
        final parsed = DateFormat('d MMM, yyyy').parse(raw);
        return getDateLabel(parsed);
      } catch (_) {
        return raw;
      }
    }
    return raw;
  }

  IconData getCategoryIcon(String type, {bool isIncome = false}) {
    final t = type.toLowerCase();
    if (isIncome) {
      if (t.contains("salary")) return Icons.account_balance_wallet_rounded;
      if (t.contains("refund")) return Icons.replay_rounded;
      if (t.contains("interest")) return Icons.savings_rounded;
      if (t.contains("reward") || t.contains("cashback")) return Icons.card_giftcard_rounded;
      if (t.contains("cash") || t.contains("credit")) return Icons.attach_money_rounded;
      if (t.contains("bonus")) return Icons.emoji_events_rounded;
      if (t.contains("investment")) return Icons.trending_up_rounded;
      if (t.contains("business")) return Icons.business_center_rounded;
      return Icons.add_circle_outline_rounded;
    } else {
      if (t.contains("food") || t.contains("restaurant")) return Icons.restaurant_rounded;
      if (t.contains("grocery")) return Icons.shopping_cart_rounded;
      if (t.contains("rent")) return Icons.home_rounded;
      if (t.contains("fuel") || t.contains("petrol")) return Icons.local_gas_station_rounded;
      if (t.contains("shopping")) return Icons.shopping_bag_rounded;
      if (t.contains("health") || t.contains("medicine")) return Icons.local_hospital_rounded;
      if (t.contains("travel") || t.contains("flight") || t.contains("train")) return Icons.flight_takeoff_rounded;
      if (t.contains("entertainment") || t.contains("movie")) return Icons.movie_rounded;
      if (t.contains("education")) return Icons.school_rounded;
      if (t.contains("loan")) return Icons.account_balance_rounded;
      if (t.contains("credit card")) return Icons.credit_card_rounded;
      if (t.contains("upi")) return Icons.currency_rupee_rounded;
      return Icons.remove_circle_outline_rounded;
    }
  }

  Widget _logo(String path, {double w = 22, double h = 22}) {
    if (path.startsWith('http')) {
      return Image.network(path, width: w, height: h, errorBuilder: (_, __, ___) => const SizedBox());
    }
    return Image.asset(path, width: w, height: h);
  }

  Future<void> _showBillImage(BuildContext context, String imageUrl) async {
    widget.onBeginModal?.call();
    await showDialog(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        backgroundColor: Colors.transparent,
        child: GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: Stack(
            children: [
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: Colors.black87,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: InteractiveViewer(
                    child: Image.network(
                      imageUrl,
                      fit: BoxFit.contain,
                      loadingBuilder: (context, child, progress) =>
                          progress == null ? child : const Center(child: CircularProgressIndicator()),
                      errorBuilder: (context, error, stackTrace) =>
                          const Center(child: Text("Could not load attachment", style: TextStyle(color: Colors.white))),
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 12,
                top: 12,
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white, size: 32),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    widget.onEndModal?.call();
  }

  Future<void> _showDetailsScreenFromUnified(Map<String, dynamic> doc, BuildContext context) async {
    widget.onBeginModal?.call();

    final isIncome = (doc['type'] == 'income');
    final amount = (doc['amount'] is num) ? (doc['amount'] as num).toDouble() : 0.0;
    final category = (doc['category'] ?? (isIncome ? 'Income' : 'Expense')).toString();
    final date = (doc['date'] as DateTime);
    final note = (doc['note'] ?? '').toString();
    final bankLogo = doc['bankLogo'] as String?;
    final schemeLogo = doc['schemeLogo'] as String?;
    final last4 = doc['cardLast4'] as String?;
    final channel = doc['channel'] as String?;
    final billUrl = (doc['billImageUrl'] ?? doc['attachmentUrl'] ?? '').toString();

    final instrument = (doc['instrument'] ?? channel)?.toString();
    final network = doc['network']?.toString();
    final issuer = doc['issuerBank']?.toString();
    final counterparty = doc['counterparty']?.toString();
    final isIntl = (doc['isInternational'] == true);
    final hasFees = (doc['hasFees'] == true);

    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(18.0),
          child: ListView(
            shrinkWrap: true,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (bankLogo != null && bankLogo.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _logo(bankLogo, w: 28, h: 28),
                    ),
                  Icon(
                    getCategoryIcon(category, isIncome: isIncome),
                    size: 40,
                    color: isIncome ? Colors.green : Colors.pink,
                  ),
                  if (schemeLogo != null && schemeLogo.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: _logo(schemeLogo, w: 26, h: 26),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                "${isIncome ? 'Income' : 'Expense'} - $category",
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 19),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              if (counterparty != null && counterparty.isNotEmpty)
                Text(isIncome ? "From: $counterparty" : "Paid to: $counterparty"),
              if (instrument != null && instrument.isNotEmpty)
                Text("Instrument: $instrument"),
              if (issuer != null && issuer.isNotEmpty)
                Text("Bank: $issuer"),
              if (network != null && network.isNotEmpty)
                Text("Network: $network"),
              if (last4 != null && last4.isNotEmpty)
                Text("Card: ****$last4"),
              if (isIntl) const Text("International: Yes"),
              if (hasFees) const Text("Fees Detected: Yes"),
              const SizedBox(height: 12),
              Text("Amount: ${_inCurrency.format(amount)}", style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text("Date: ${DateFormat('d MMM yyyy, h:mm a').format(date)}"),
              if (note.trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Note:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(note),
              ],
              const SizedBox(height: 16),
              _inlineAdCard('txn_detail_sheet'),
              const SizedBox(height: 12),
              if (widget.showBillIcon && billUrl.isNotEmpty)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    icon: const Icon(Icons.receipt_long_rounded, color: Colors.brown),
                    label: const Text("View bill/attachment"),
                    onPressed: () => _showBillImage(context, billUrl),
                  ),
                ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (!isIncome && widget.onSplit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.group, color: Colors.deepPurple, size: 21),
                      label: const Text("Split"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onSplit?.call(doc);
                      },
                    ),
                  if (widget.onEdit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.edit, color: Colors.blue, size: 21),
                      label: const Text("Edit"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onEdit?.call(doc);
                      },
                    ),
                  if (widget.onDelete != null)
                    TextButton.icon(
                      icon: const Icon(Icons.delete, color: Colors.red, size: 21),
                      label: const Text("Delete"),
                      onPressed: () async {
                        final confirmed = await _confirmDeleteTransaction(
                          context,
                          doc,
                          triggerAnchoredCallbacks: false,
                        );
                        if (!confirmed) return;
                        Navigator.pop(context);
                        widget.onDelete?.call(doc);
                      },
                    ),
                  TextButton(child: const Text("Close"), onPressed: () => Navigator.pop(context)),
                ],
              ),
            ],
          ),
        );
      },
    ).whenComplete(() => widget.onEndModal?.call());
  }

  Future<void> _showDetailsScreenLegacy(dynamic item, bool isIncome, BuildContext context) async {
    widget.onBeginModal?.call();

    final counterparty = _legacyCounterparty(item);
    final instrument = _legacyInstrument(item);
    final issuer = _legacyIssuer(item);
    final network = _legacyNetwork(item);
    final last4 = _legacyCardLast4(item);
    final isIntl = _legacyIsIntl(item);
    final hasFees = _legacyHasFees(item);

    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(18.0),
          child: ListView(
            shrinkWrap: true,
            children: [
              Center(
                child: Icon(
                  getCategoryIcon(_legacyResolvedCategory(item, isIncome: isIncome), isIncome: isIncome),
                  size: 40,
                  color: isIncome ? Colors.green : Colors.pink,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                "${isIncome ? 'Income' : 'Expense'} - ${_legacyResolvedCategory(item, isIncome: isIncome)}",
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 19),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              if ((counterparty ?? '').toString().trim().isNotEmpty)
                Text(isIncome ? "From: $counterparty" : "Paid to: $counterparty"),
              if ((instrument ?? '').toString().trim().isNotEmpty)
                Text("Instrument: $instrument"),
              if ((issuer ?? '').toString().trim().isNotEmpty)
                Text("Bank: $issuer"),
              if ((network ?? '').toString().trim().isNotEmpty)
                Text("Network: $network"),
              if ((last4 ?? '').toString().trim().isNotEmpty)
                Text("Card: ****$last4"),
              if (isIntl) const Text("International: Yes"),
              if (hasFees) const Text("Fees Detected: Yes"),
              const SizedBox(height: 12),
              Text(
                "Amount: ${_inCurrency.format((item.amount is num) ? (item.amount as num).toDouble() : 0.0)}",
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Text("Date: ${DateFormat('d MMM yyyy, h:mm a').format(item.date)}"),
              if ((item.note ?? '').toString().trim().isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Note:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(item.note ?? ''),
              ],
              if (!isIncome && (item.friendIds != null) && item.friendIds.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Split with:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(item.friendIds.map((id) => widget.friendsById[id]?.name ?? "Friend").join(', ')),
              ],
              if (isIncome && (item.source ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Source:", style: TextStyle(fontWeight: FontWeight.bold)),
                Text(item.source ?? ''),
              ],
              const SizedBox(height: 16),
              _inlineAdCard('txn_detail_sheet_modern'),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (!isIncome && widget.onSplit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.group, color: Colors.deepPurple, size: 21),
                      label: const Text("Split"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onSplit?.call(item);
                      },
                    ),
                  if (widget.onEdit != null)
                    TextButton.icon(
                      icon: const Icon(Icons.edit, color: Colors.blue, size: 21),
                      label: const Text("Edit"),
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onEdit?.call(item);
                      },
                    ),
                  if (widget.onDelete != null)
                    TextButton.icon(
                      icon: const Icon(Icons.delete, color: Colors.red, size: 21),
                      label: const Text("Delete"),
                      onPressed: () async {
                        final confirmed = await _confirmDeleteTransaction(
                          context,
                          item,
                          triggerAnchoredCallbacks: false,
                        );
                        if (!confirmed) return;
                        Navigator.pop(context);
                        widget.onDelete?.call(item);
                      },
                    ),
                  TextButton(child: const Text("Close"), onPressed: () => Navigator.pop(context)),
                ],
              ),
            ],
          ),
        );
      },
    ).whenComplete(() => widget.onEndModal?.call());
  }

  // PATCH: dedupe & map tags to readable chips
  static const Set<String> _kMethodTags = {
    'upi',
    'imps',
    'neft',
    'rtgs',
    'pos',
    'atm',
    'card',
    'credit_card',
    'debit_card',
    'wallet',
    'netbanking'
  };

  List<String> _parseRawTags(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return const [];
    if (s.startsWith('[') && s.endsWith(']')) {
      s = s.substring(1, s.length - 1);
    }
    // split by comma or pipe
    final parts = s
        .split(RegExp(r'[,\|]'))
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    if (parts.isNotEmpty) return parts;
    // fallback: whitespace split
    return s.split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
  }

  String _normTag(String t) {
    return t
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'_+'), '_')
        .trim();
  }

  String? _displayFromTag(String k) {
    switch (k) {
      case 'loan_emi':
      case 'emi':
        return 'EMI';
      case 'autopay':
      case 'auto_debit':
      case 'mandate':
      case 'nach':
        return 'Autopay';
      case 'subscription':
      case 'subscriptions':
        return 'Subscription';
      case 'fuel':
        return 'Fuel';
      case 'international':
      case 'intl':
      case 'forex':
        return 'Intl';
      case 'charges':
      case 'charge':
      case 'fee':
      case 'fees':
        return 'Charges';
      default:
        return null; // ignore unknowns for now to avoid noise
    }
  }

  /// Turn raw "tags" string into extra chips, avoiding duplicates with existing chips
  List<Widget> _meaningfulTagChips({
    required String rawTags,
    required bool isInternational,
    required bool hasFees,
    required String? instrument,
  }) {
    final tokens = _parseRawTags(rawTags).map(_normTag).toList();
    final out = <String>{};
    final inst = (instrument ?? '').toLowerCase();

    for (final k in tokens) {
      if (k.isEmpty) continue;

      // Drop instrument duplicates (already shown as a chip)
      if (_kMethodTags.contains(k)) continue;
      if (k == inst) continue; // e.g., "imps" tag when instrument is IMPS

      // If sheet already shows INTL or FEES, skip those duplicates
      if ((k == 'international' || k == 'intl' || k == 'forex') && isInternational) {
        continue;
      }
      if ((k == 'charges' || k == 'fee' || k == 'fees') && hasFees) {
        continue;
      }

      final disp = _displayFromTag(k);
      if (disp != null) out.add(disp);
    }

    // Make chips in a stable order
    final order = ['EMI', 'Autopay', 'Subscription', 'Fuel', 'Charges', 'Intl'];
    final sorted = order.where(out.contains).toList();

    return sorted.map((t) => _chip(t)).toList();
  }

  Widget _categoryDropdown({
    required String txId,
    required String current,
    required bool isIncome,
    required dynamic payload,
    required Map<String, dynamic> normalized,
  }) {
    final String value = (current.isEmpty ? (isIncome ? "Income" : "General") : current);
    List<String> options = List<String>.from(widget.categoryOptions);
    if (!options.contains(value)) {
      options = [value, ...options];
    }

    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        value: value,
        items: options
            .map((c) => DropdownMenuItem(
                  value: c,
                  child: Text(
                    c,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15.3,
                      color: Color(0xFF0F1E1C),
                    ),
                  ),
                ))
            .toList(),
        onChanged: (newVal) async {
          if (newVal == null || newVal == value) return;

          setState(() {
            final idx = allTx.indexWhere((t) => (t['id'] ?? '').toString() == txId);
            if (idx != -1) allTx[idx]['category'] = newVal;
          });

          if (widget.onChangeCategory != null) {
            try {
              await widget.onChangeCategory!(
                txId: txId,
                newCategory: newVal,
                payload: payload,
              );
              await _saveOverrideIfPossible(newVal, normalized);
              return;
            } catch (_) {}
          } else {
            try {
              if (payload is ExpenseItem) {
                final e = payload as ExpenseItem;
                final updated = e.copyWith(type: newVal, category: newVal);
                await ExpenseService().updateExpense(widget.userPhone, updated);
                await _saveOverrideIfPossible(newVal, normalized);
                return;
              } else if (payload is IncomeItem) {
                final i = payload as IncomeItem;
                final updated = i.copyWith(type: newVal, category: newVal);
                await IncomeService().updateIncome(widget.userPhone, updated);
                await _saveOverrideIfPossible(newVal, normalized);
                return;
              }
              throw Exception('Unsupported payload for default saver');
            } catch (_) {}
          }

          setState(() {
            final idx = allTx.indexWhere((t) => (t['id'] ?? '').toString() == txId);
            if (idx != -1) allTx[idx]['category'] = value;
          });
        },
        isDense: true,
        icon: const Icon(Icons.expand_more_rounded, size: 18),
        borderRadius: BorderRadius.circular(12),
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 15.3,
          color: Color(0xFF0F1E1C),
        ),
        menuMaxHeight: 300,
      ),
    );
  }

  Widget _amountPill(double amount, bool isIncome) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 92, maxWidth: 108),
      child: Align(
        alignment: Alignment.centerRight,
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Semantics(
            label: "${isIncome ? 'Income' : 'Expense'} ${_inCurrency.format(amount)}",
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: (isIncome ? Colors.green[50] : Colors.red[50])?.withOpacity(0.9),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                _inCurrency.format(amount),
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 14.5,
                  color: isIncome ? Colors.green[800] : Colors.red[800],
                  letterSpacing: 0.1,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _adBanner(String placement) {
    return AdsBannerCard(
      placement: placement,
      inline: true,
      inlineMaxHeight: 120,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      minHeight: 96,
      placeholder: _adPlaceholderRow(placement),
    );
  }

  Widget _inlineAdCard(String placement) {
    return AdsBannerCard(
      placement: placement,
      inline: true,
      inlineMaxHeight: 120,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      minHeight: 96,
      placeholder: _adPlaceholderRow(placement),
    );
  }

  Widget _adPlaceholderRow(String placement) {
    final caption = Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: const Color(0xFF6B7280),
        );

    final placementLabel = placement.replaceAll('_', ' ');

    return Row(
      children: [
        const CircleAvatar(radius: 22, backgroundColor: Color(0xFFE5E7EB)),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            'Sponsored • $placementLabel',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: caption,
          ),
        ),
        const SizedBox(width: 8),
        const Icon(Icons.open_in_new_rounded, color: Color(0xFF9CA3AF)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final groupedMap = groupTx(allTx.take(shownCount).toList(), _activeFilter.groupBy);
    final groupedEntries = groupedMap.entries.toList();

    if (allTx.isEmpty) {
      if (widget.emptyBuilder != null) return widget.emptyBuilder!(context);
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: Text("No transactions found.")),
      );
    }

    final groupCount = groupedEntries.length;

    return CustomDiamondCard(
      padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 0),
      borderRadius: 21,
      child: ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: groupCount + (shownCount < allTx.length ? 1 : 0),
        itemBuilder: (context, idx) {
          if (idx >= groupCount) {
            return Column(
              children: [
                Center(
                  child: TextButton(
                    child: const Text("Show More"),
                    onPressed: () {
                      setState(() {
                        shownCount += widget.showMoreStep;
                      });
                    },
                  ),
                ),
                if (widget.showBottomBannerAd)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _adBanner('txn_list_bottom'),
                  ),
              ],
            );
          }

          final entry = groupedEntries[idx];
          final rawLabel = entry.key;
          final txs = entry.value;
          final dateLabel = _displayGroupLabel(rawLabel);

          final rows = <Widget>[];

          if (idx == 0 && widget.showTopBannerAd) {
            rows.add(Padding(
              padding: const EdgeInsets.only(left: 10, right: 10, top: 10, bottom: 6),
              child: _adBanner('txn_list_top'),
            ));
          }

          if (dateLabel.isNotEmpty)
            rows.add(
              Container(
                margin: const EdgeInsets.only(left: 14, right: 8, top: 11, bottom: 4),
                padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
                decoration: BoxDecoration(
                  color: Colors.grey[200],
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Text(
                  dateLabel,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: Color(0xFF0F1E1C),
                  ),
                ),
              ),
            );

          for (int i = 0; i < txs.length; i++) {
            final tx = txs[i];
            final bool isIncome = tx['type'] == 'income';
            final String id = (tx['id'] ?? '').toString();
            final String category = (tx['category'] ?? (isIncome ? 'Income' : 'General')).toString();
            final String note = (tx['note'] ?? '').toString();
            final String? title = (tx['title'] as String?);
            final List<String> labels = (tx['labels'] is List)
                ? List<String>.from(tx['labels'])
                : const <String>[];
            final double amount = (tx['amount'] is num) ? (tx['amount'] as num).toDouble() : 0.0;

            final String? bankLogo = tx['bankLogo'] as String?;
            final String? schemeLogo = tx['schemeLogo'] as String?;
            final String? merchant = (tx['merchant'] as String?)?.trim();
            final String? cardLast4 = tx['cardLast4'] as String?;
            final String? channel = tx['channel'] as String?;
            final String? instrument = (tx['instrument'] as String?) ?? channel;
            final String? network = tx['network'] as String?;
            final String? issuerBank = tx['issuerBank'] as String?;
            final String? counterparty = tx['counterparty'] as String?;
            final bool isInternational = (tx['isInternational'] == true);
            final bool hasFees = (tx['hasFees'] == true);
            final String? tags = (tx['tags'] as String?);
            final double categoryConfidence = (tx['categoryConfidence'] is num)
                ? (tx['categoryConfidence'] as num).toDouble()
                : 0.0;
            final String categorySource = (tx['categorySource'] ?? '').toString();

            final raw = tx['raw'];

            String? friendsStr;
            try {
              if (tx['mode'] == 'legacy' && !isIncome && (raw.friendIds != null) && raw.friendIds.isNotEmpty) {
                friendsStr = raw.friendIds
                    .map((fid) => widget.friendsById[fid]?.name ?? "Friend")
                    .join(', ');
              }
            } catch (_) {
              friendsStr = null;
            }

            final String showLine2 = () {
              if (title != null && title.trim().isNotEmpty) return title.trim();
              if ((counterparty ?? '').toString().trim().isNotEmpty) {
                return isIncome ? "From ${counterparty!.trim()}" : "Paid to ${counterparty!.trim()}";
              }
              if (merchant != null && merchant.isNotEmpty) return merchant;
              if (note.isNotEmpty) return note.length > 40 ? "${note.substring(0, 40)}..." : note;
              return '';
            }();

            final bool isSelectable = widget.multiSelectEnabled && widget.onSelectTx != null;
            final bool isSelected = isSelectable && widget.selectedIds.contains(id);

            final dynamic payload = tx['mode'] == 'unified' ? tx : raw;

            String billUrl = '';
            if (widget.showBillIcon) {
              if (tx['mode'] == 'unified') {
                final rawMap = (tx['raw'] is Map<String, dynamic>) ? tx['raw'] as Map<String, dynamic> : <String, dynamic>{};
                billUrl = _billUrlFromUnified(rawMap);
              } else {
                billUrl = _billUrlFromLegacy(raw);
              }
            }

            final chipWidgets = <Widget>[];
            if ((instrument ?? '').isNotEmpty) {
              chipWidgets.add(_chip(instrument!));
            } else if ((channel ?? '').isNotEmpty) {
              chipWidgets.add(_chip(channel!));
            }
            if ((cardLast4 ?? '').isNotEmpty) chipWidgets.add(_chip("****$cardLast4"));
            if ((network ?? '').isNotEmpty) chipWidgets.add(_chip(network!));
            if (isInternational) chipWidgets.add(_chip("INTL"));
            if (hasFees) chipWidgets.add(_chip("Fees"));
            if ((tags ?? '').isNotEmpty) {
              chipWidgets.addAll(
                _meaningfulTagChips(
                  rawTags: tags!,
                  isInternational: isInternational,
                  hasFees: hasFees,
                  instrument: instrument,
                ),
              );
            }
            final sourceLabel = () {
              final s = categorySource.toLowerCase();
              if (s == 'llm') return 'LLM';
              if (s == 'rules') return 'Rules';
              if (s == 'user_override') return 'Manual';
              if (s.isNotEmpty) return s.toUpperCase();
              return null;
            }();
            if (sourceLabel != null) chipWidgets.add(_chip(sourceLabel));
            if (categorySource == 'llm' && categoryConfidence > 0 && categoryConfidence < 0.6) {
              chipWidgets.add(_chip('Review'));
            }

            final canSwipe = widget.onDelete != null || widget.onEdit != null;
            rows.add(
              Dismissible(
                key: ValueKey('dismiss_${id}_${tx.hashCode}_$i'),
                direction: (canSwipe && widget.enableSwipeActions)
                    ? DismissDirection.horizontal
                    : DismissDirection.none,
                background: (widget.enableSwipeActions && widget.onEdit != null)
                    ? _buildSwipeBackground(
                        alignment: Alignment.centerLeft,
                        icon: Icons.edit,
                        label: 'Edit',
                        color: Colors.blue.withOpacity(0.15),
                      )
                    : const SizedBox(),
                secondaryBackground: (widget.enableSwipeActions && widget.onDelete != null)
                    ? _buildSwipeBackground(
                        alignment: Alignment.centerRight,
                        icon: Icons.delete,
                        label: 'Delete',
                        color: Colors.red.withOpacity(0.15),
                      )
                    : const SizedBox(),
                confirmDismiss: (direction) async {
                  if (direction == DismissDirection.startToEnd) {
                    if (widget.onEdit != null) {
                      widget.onEdit!(payload);
                    }
                    return false;
                  }
                  if (direction == DismissDirection.endToStart) {
                    if (widget.onDelete == null) return false;
                    return _confirmDeleteTransaction(context, payload);
                  }
                  return false;
                },
                onDismissed: (direction) {
                  if (direction == DismissDirection.endToStart && widget.onDelete != null) {
                    final indexInAll = allTx.indexOf(tx);
                    if (indexInAll >= 0) {
                      _handleDelete(tx, indexInAll, payload);
                    }
                  }
                },
                child: GestureDetector(
                  key: ValueKey(id),
                  behavior: HitTestBehavior.opaque,
                  onTap: isSelectable
                      ? () => widget.onSelectTx!(id, !isSelected)
                      : () {
                          if (widget.onRowTapIntercept != null) {
                            final handled = widget.onRowTapIntercept!(tx);
                            if (handled == true) return;
                          }
                          if (!widget.enableDetailsSheet) return;

                          if (tx['mode'] == 'unified') {
                            _showDetailsScreenFromUnified(tx, context);
                          } else {
                            _showDetailsScreenLegacy(raw, isIncome, context);
                          }
                        },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    constraints: const BoxConstraints(minHeight: 58),
                    margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? Colors.deepPurple.withOpacity(0.09)
                          : Colors.white.withOpacity(0.93),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.grey.withOpacity(0.028),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                      border: isSelected
                          ? Border.all(color: Colors.deepPurple, width: 1.4)
                          : null,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        if (isSelectable)
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Checkbox(
                              value: isSelected,
                              onChanged: (val) => widget.onSelectTx!(id, val ?? false),
                              activeColor: Colors.deepPurple,
                              visualDensity: VisualDensity.compact,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(7),
                              ),
                            ),
                          ),
                        if (bankLogo != null && bankLogo.isNotEmpty) ...[
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: _logo(bankLogo, w: 22, h: 22),
                          ),
                        ],
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: isIncome ? Colors.green[50] : Colors.pink[50],
                          child: Icon(
                            getCategoryIcon(category, isIncome: isIncome),
                            color: isIncome ? Colors.green[700] : Colors.pink[700],
                            size: 18,
                          ),
                        ),
                        if (schemeLogo != null && schemeLogo.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: _logo(schemeLogo, w: 18, h: 18),
                          ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (widget.showCategoryDropdown)
                                SizedBox(
                                  height: 28,
                                  child: _categoryDropdown(
                                    txId: id,
                                    current: category,
                                    isIncome: isIncome,
                                    payload: payload,
                                    normalized: tx,
                                  ),
                                )
                              else
                                Text(
                                  category,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15.3,
                                    color: Color(0xFF0F1E1C),
                                  ),
                                ),
                              if (showLine2.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2.0),
                                  child: Text(
                                    showLine2,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      color: Colors.black.withOpacity(0.75),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              if (labels.isNotEmpty || chipWidgets.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4.0),
                                  child: Wrap(
                                    spacing: 6,
                                    runSpacing: -6,
                                    children: [
                                      ...labels.take(3).map((l) => Chip(
                                            label: Text(
                                              '#$l',
                                              style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                                color: Colors.black87,
                                              ),
                                            ),
                                            backgroundColor: Colors.teal.withOpacity(0.10),
                                            visualDensity: VisualDensity.compact,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                          )),
                                      if (labels.length > 3)
                                        Chip(
                                          label: Text(
                                            '+${labels.length - 3}',
                                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                                          ),
                                          backgroundColor: Colors.teal.withOpacity(0.08),
                                          visualDensity: VisualDensity.compact,
                                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                        ),
                                      ...chipWidgets,
                                    ],
                                  ),
                                ),
                              if (tx['mode'] == 'legacy')
                                Padding(
                                  padding: const EdgeInsets.only(top: 2.0),
                                  child: Row(
                                    children: [
                                      if (friendsStr != null) ...[
                                        Icon(Icons.person_2_rounded, size: 15, color: Colors.deepPurple[500]),
                                        Flexible(
                                          child: Text(
                                            " $friendsStr",
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              color: Colors.deepPurple[700],
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ),
                                      ],
                                      if (tx['type'] == 'income' &&
                                          (raw.source ?? '').toString().isNotEmpty) ...[
                                        const SizedBox(width: 8),
                                        Icon(Icons.input_rounded, size: 15, color: Colors.teal[600]),
                                        Flexible(
                                          child: Text(
                                            " ${raw.source}",
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              color: Colors.teal[700],
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            _amountPill(amount, isIncome),
                            const SizedBox(height: 10),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (widget.showBillIcon && billUrl.isNotEmpty)
                                  IconButton(
                                    icon: const Icon(Icons.receipt_long_rounded, size: 18, color: Colors.brown),
                                    tooltip: 'View bill',
                                    visualDensity: VisualDensity.compact,
                                    onPressed: () => _showBillImage(context, billUrl),
                                  ),
                                if (tx['mode'] == 'legacy' && !isIncome && widget.onSplit != null)
                                  IconButton(
                                    icon: const Icon(Icons.group, size: 18, color: Colors.deepPurple),
                                    tooltip: 'Split',
                                    visualDensity: VisualDensity.compact,
                                    onPressed: () => widget.onSplit?.call(payload),
                                  ),
                                if (widget.onEdit != null)
                                  IconButton(
                                    icon: const Icon(Icons.edit, size: 18, color: Colors.blue),
                                    tooltip: 'Edit',
                                    visualDensity: VisualDensity.compact,
                                    onPressed: () => widget.onEdit?.call(payload),
                                  ),
                                if (widget.onDelete != null)
                                  IconButton(
                                    icon: const Icon(Icons.delete, size: 18, color: Colors.red),
                                    tooltip: 'Delete',
                                    visualDensity: VisualDensity.compact,
                                    onPressed: () async {
                                      if (widget.onDelete == null) return;
                                      final confirmed = await _confirmDeleteTransaction(context, payload);
                                      if (confirmed) widget.onDelete!(payload);
                                    },
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
            );

            if (widget.enableInlineAds && i == widget.inlineAdAfterIndex) {
              rows.add(
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: _inlineAdCard('txn_list_inline'),
                ),
              );
            }
          }

          rows.add(const SizedBox(height: 4));

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: rows,
          );
        },
      ),
    );
  }

  Widget _chip(String label) {
    return Chip(
      label: Text(label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black87)),
      backgroundColor: Colors.blueGrey.withOpacity(0.12),
      visualDensity: VisualDensity.compact,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }

  String? _resolveDeleteLabel(dynamic payload) {
    String? normalize(String? value) {
      if (value == null) return null;
      final trimmed = value.trim();
      return trimmed.isEmpty ? null : trimmed;
    }

    if (payload is ExpenseItem) {
      return normalize(payload.title) ??
          normalize(payload.label) ??
          normalize(payload.counterparty) ??
          normalize(payload.note);
    }
    if (payload is IncomeItem) {
      return normalize(payload.title) ??
          normalize(payload.label) ??
          normalize(payload.source) ??
          normalize(payload.note);
    }
    if (payload is Map<String, dynamic>) {
      for (final key in ['title', 'label', 'counterparty', 'merchant', 'note', 'description']) {
        final value = payload[key];
        if (value is String) {
          final normalized = normalize(value);
          if (normalized != null) return normalized;
        }
      }
      final raw = payload['raw'];
      final fallback = _resolveDeleteLabel(raw);
      if (fallback != null) return fallback;
    }
    return null;
  }

  Future<bool> _confirmDeleteTransaction(
    BuildContext context,
    dynamic payload, {
    bool triggerAnchoredCallbacks = true,
  }) async {
    final theme = Theme.of(context);
    final isIncomePayload = payload is IncomeItem ||
        (payload is Map<String, dynamic> &&
            ((payload['type']?.toString().toLowerCase() == 'income') ||
                (payload['isIncome'] == true)));
    final isExpensePayload = payload is ExpenseItem ||
        (payload is Map<String, dynamic> &&
            ((payload['type']?.toString().toLowerCase() == 'expense') ||
                (payload['isIncome'] == false)));

    final typeLabel = isIncomePayload
        ? 'income'
        : isExpensePayload
            ? 'expense'
            : 'transaction';
    final title = 'Delete ${typeLabel == 'transaction' ? 'transaction' : typeLabel}?';
    final fallbackSubject = isIncomePayload
        ? 'this income transaction'
        : isExpensePayload
            ? 'this expense transaction'
            : 'this transaction';
    final target = _resolveDeleteLabel(payload);
    final message = target != null
        ? 'Are you sure you want to delete "$target"? This cannot be undone.'
        : 'Are you sure you want to delete $fallbackSubject? This cannot be undone.';

    if (triggerAnchoredCallbacks) widget.onBeginModal?.call();
    bool confirmed = false;
    try {
      final result = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
              child: const Text('Delete'),
            ),
          ],
        ),
      );
      confirmed = result ?? false;
    } finally {
      if (triggerAnchoredCallbacks) widget.onEndModal?.call();
    }
    return confirmed;
  }

  Widget _buildSwipeBackground({
    required Alignment alignment,
    required IconData icon,
    required String label,
    required Color color,
  }) {
    final isLeft = alignment == Alignment.centerLeft;
    return Container(
      alignment: alignment,
      color: color,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: isLeft ? MainAxisAlignment.start : MainAxisAlignment.end,
        children: [
          if (!isLeft) ...[
            Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.black87),
            ),
            const SizedBox(width: 8),
            Icon(icon, color: Colors.black87),
          ] else ...[
            Icon(icon, color: Colors.black87),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.black87),
            ),
          ],
        ],
      ),
    );
  }

  void _handleDelete(Map<String, dynamic> tx, int index, dynamic payload) {
    final previousShown = shownCount;
    setState(() {
      if (index >= 0 && index < allTx.length) {
        allTx.removeAt(index);
      }
      if (allTx.isEmpty) {
        shownCount = 0;
      } else {
        shownCount = math.min(previousShown, allTx.length);
      }
    });

    bool undone = false;
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger
        .showSnackBar(
      SnackBar(
        content: const Text('Deleted • UNDO'),
        action: SnackBarAction(
          label: 'UNDO',
          onPressed: () {
            undone = true;
            setState(() {
              final insertIndex = math.min(index, allTx.length);
              allTx.insert(insertIndex, tx);
              shownCount = math.min(
                math.max(previousShown, insertIndex + 1),
                allTx.length,
              );
            });
          },
        ),
      ),
    )
        .closed
        .then((reason) {
      if (!undone && reason != SnackBarClosedReason.action) {
        widget.onDelete?.call(payload);
      }
    });
  }
}

// Old bespoke ad widgets replaced by reusable [AdsBannerCard].

