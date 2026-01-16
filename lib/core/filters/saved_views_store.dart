import 'package:cloud_firestore/cloud_firestore.dart';

import 'transaction_filter.dart';

/// Cloud-backed store for Saved Views (per user).
/// Collection shape:
/// users/{userPhone}/saved_views/{id} {
///   name: string,
///   payload: map (TransactionFilter serialized),
///   updatedAt: Timestamp,
/// }
class SavedViewsStore {
  final FirebaseFirestore _db;
  final String userPhone;

  SavedViewsStore({required this.userPhone, FirebaseFirestore? db})
      : _db = db ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection('users').doc(userPhone).collection('saved_views');

  /// Create/update a view with a human name. Name uniqueness enforced by slug id.
  Future<void> save(String name, TransactionFilter f) async {
    final id = _slug(name);
    final map = _toMap(f);
    await _col.doc(id).set({
      'name': name.trim(),
      'payload': map,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> delete(String name) async {
    final id = _slug(name);
    await _col.doc(id).delete();
  }

  /// Loads all saved views for this user, ordered by name (ci).
  Future<List<(String, TransactionFilter)>> loadAll() async {
    final snap = await _col.get();
    final out = <(String, TransactionFilter)>[];
    for (final d in snap.docs) {
      try {
        final data = d.data();
        final name = (data['name'] ?? d.id).toString();
        final payload = Map<String, dynamic>.from(data['payload'] ?? const {});
        out.add((name, _fromMap(payload)));
      } catch (_) {
        // ignore bad rows
      }
    }
    out.sort((a, b) => a.$1.toLowerCase().compareTo(b.$1.toLowerCase()));
    return out;
  }

  // ---------- mappers (kept local; TransactionFilter stays clean) ----------
  Map<String, dynamic> _toMap(TransactionFilter f) => {
        'type': f.type.name,
        'from': f.from?.millisecondsSinceEpoch,
        'to': f.to?.millisecondsSinceEpoch,
        'minAmount': f.minAmount,
        'maxAmount': f.maxAmount,
        'text': f.text,
        'category': f.category,
        'subcategory': f.subcategory,
        'instrument': f.instrument,
        'network': f.network,
        'issuerBank': f.issuerBank,
        'last4': f.last4,
        'counterpartyType': f.counterpartyType,
        'intl': f.intl,
        'hasFees': f.hasFees,
        'billsOnly': f.billsOnly,
        'withAttachment': f.withAttachment,
        'subscriptionsOnly': f.subscriptionsOnly,
        'uncategorizedOnly': f.uncategorizedOnly,
        'friendPhones': f.friendPhones,
        'groupId': f.groupId,
        'labels': f.labels,
        'tags': f.tags,
        'merchant': f.merchant,
        'sortField': f.sort.field.name,
        'sortDir': f.sort.dir.name,
        'groupBy': f.groupBy.name,
      };

  TransactionFilter _fromMap(Map<String, dynamic> m) {
    String? _s(String k) =>
        (m[k] is String && (m[k] as String).trim().isNotEmpty)
            ? m[k] as String
            : null;
    List<String> _ls(String k) =>
        (m[k] is List) ? List<String>.from(m[k]) : const [];
    double? _d(String k) => (m[k] is num) ? (m[k] as num).toDouble() : null;
    bool? _b(String k) => (m[k] is bool) ? m[k] as bool : null;
    DateTime? _dt(String k) => (m[k] is num)
        ? DateTime.fromMillisecondsSinceEpoch((m[k] as num).toInt())
        : null;

    final type = switch ((m['type'] ?? 'all') as String) {
      'expense' => TxType.expense,
      'income' => TxType.income,
      _ => TxType.all,
    };
    final sortField = switch ((m['sortField'] ?? 'date') as String) {
      'amount' => SortField.amount,
      'merchant' => SortField.merchant,
      'category' => SortField.category,
      _ => SortField.date,
    };
    final sortDir = ((m['sortDir'] ?? 'desc') as String) == 'asc'
        ? SortDir.asc
        : SortDir.desc;
    final groupBy = switch ((m['groupBy'] ?? 'day') as String) {
      'none' => GroupBy.none,
      'week' => GroupBy.week,
      'month' => GroupBy.month,
      'merchant' => GroupBy.merchant,
      'category' => GroupBy.category,
      _ => GroupBy.day,
    };

    return TransactionFilter.defaults().copyWith(
      type: type,
      from: _dt('from'),
      to: _dt('to'),
      minAmount: _d('minAmount'),
      maxAmount: _d('maxAmount'),
      text: (m['text'] as String?) ?? '',
      category: _s('category'),
      subcategory: _s('subcategory'),
      instrument: _s('instrument'),
      network: _s('network'),
      issuerBank: _s('issuerBank'),
      last4: _s('last4'),
      counterpartyType: _s('counterpartyType'),
      intl: _b('intl'),
      hasFees: _b('hasFees'),
      billsOnly: _b('billsOnly'),
      withAttachment: _b('withAttachment'),
      subscriptionsOnly: _b('subscriptionsOnly'),
      uncategorizedOnly: _b('uncategorizedOnly'),
      friendPhones: _ls('friendPhones'),
      groupId: _s('groupId'),
      labels: _ls('labels'),
      tags: _ls('tags'),
      merchant: _s('merchant'),
      sort: SortSpec(sortField, sortDir),
      groupBy: groupBy,
    );
  }

  /// Slugify name -> document id (lowercase, dash-separated, 1..120 chars)
  String _slug(String name) {
    var s = name.trim().toLowerCase();
    s = s
        .replaceAll(RegExp(r'[^a-z0-9_-]+'), '-')
        .replaceAll(RegExp(r'-+'), '-');
    s = s.replaceAll(RegExp(r'^-+|-+$'), '');
    if (s.isEmpty) {
      s = 'view';
    }
    if (s.length > 120) {
      s = s.substring(0, 120);
    }
    return s;
  }
}
