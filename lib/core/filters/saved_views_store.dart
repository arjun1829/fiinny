import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'transaction_filter.dart';

class SavedViewsStore {
  static const _k = 'tx_saved_views_v1';

  Future<void> save(String name, TransactionFilter f) async {
    final key = name.trim();
    if (key.isEmpty) {
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final payload = _readPayload(prefs);
    payload[key] = _toMap(f);
    await prefs.setString(_k, jsonEncode(payload));
  }

  Future<void> delete(String name) async {
    final key = name.trim();
    if (key.isEmpty) {
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final payload = _readPayload(prefs);
    if (payload.remove(key) != null) {
      if (payload.isEmpty) {
        await prefs.remove(_k);
      } else {
        await prefs.setString(_k, jsonEncode(payload));
      }
    }
  }

  Future<List<(String, TransactionFilter)>> loadAll() async {
    final prefs = await SharedPreferences.getInstance();
    final payload = _readPayload(prefs);
    final List<(String, TransactionFilter)> result = [];
    payload.forEach((key, value) {
      if (value is Map<String, dynamic>) {
        result.add((key, _fromMap(value)));
      } else if (value is Map) {
        result.add((key, _fromMap(value.cast<String, dynamic>())));
      } else {
        result.add((key, TransactionFilter.defaults()));
      }
    });
    result.sort((a, b) => a.$1.toLowerCase().compareTo(b.$1.toLowerCase()));
    return result;
  }

  Map<String, dynamic> _readPayload(SharedPreferences prefs) {
    final raw = prefs.getString(_k);
    if (raw == null || raw.isEmpty) {
      return <String, dynamic>{};
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return decoded.map((key, value) => MapEntry(key.toString(), value));
      }
    } catch (_) {}
    return <String, dynamic>{};
  }

  Map<String, dynamic> _toMap(TransactionFilter f) {
    return <String, dynamic>{
      'type': f.type.name,
      'from': f.from?.toIso8601String(),
      'to': f.to?.toIso8601String(),
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
      'friendPhones': List<String>.of(f.friendPhones),
      'groupId': f.groupId,
      'labels': List<String>.of(f.labels),
      'tags': List<String>.of(f.tags),
      'merchant': f.merchant,
      'sort': <String, dynamic>{
        'field': f.sort.field.name,
        'dir': f.sort.dir.name,
      },
      'groupBy': f.groupBy.name,
    };
  }

  TransactionFilter _fromMap(Map<String, dynamic> map) {
    TxType parseType(String? value) {
      return TxType.values.firstWhere(
        (t) => t.name == value,
        orElse: () => TxType.all,
      );
    }

    SortField parseSortField(String? value) {
      return SortField.values.firstWhere(
        (f) => f.name == value,
        orElse: () => SortField.date,
      );
    }

    SortDir parseSortDir(String? value) {
      return SortDir.values.firstWhere(
        (d) => d.name == value,
        orElse: () => SortDir.desc,
      );
    }

    GroupBy parseGroup(String? value) {
      return GroupBy.values.firstWhere(
        (g) => g.name == value,
        orElse: () => GroupBy.day,
      );
    }

    DateTime? parseDate(dynamic value) {
      if (value is String && value.isNotEmpty) {
        return DateTime.tryParse(value);
      }
      return null;
    }

    double? parseDouble(dynamic value) {
      if (value is num) {
        return value.toDouble();
      }
      if (value is String) {
        return double.tryParse(value);
      }
      return null;
    }

    bool? parseBool(dynamic value) {
      if (value is bool) {
        return value;
      }
      if (value is String) {
        if (value == 'true') return true;
        if (value == 'false') return false;
      }
      return null;
    }

    List<String> parseList(dynamic value) {
      if (value is List) {
        return value.whereType<String>().toList();
      }
      if (value is String && value.isNotEmpty) {
        return <String>[value];
      }
      return <String>[];
    }

    final sortMap = map['sort'];
    final sortField = sortMap is Map
        ? parseSortField(sortMap['field'] as String?)
        : SortField.date;
    final sortDir = sortMap is Map
        ? parseSortDir(sortMap['dir'] as String?)
        : SortDir.desc;

    return TransactionFilter(
      type: parseType(map['type'] as String?),
      from: parseDate(map['from']),
      to: parseDate(map['to']),
      minAmount: parseDouble(map['minAmount']),
      maxAmount: parseDouble(map['maxAmount']),
      text: (map['text'] as String?) ?? '',
      category: map['category'] as String?,
      subcategory: map['subcategory'] as String?,
      instrument: map['instrument'] as String?,
      network: map['network'] as String?,
      issuerBank: map['issuerBank'] as String?,
      last4: map['last4'] as String?,
      counterpartyType: map['counterpartyType'] as String?,
      intl: parseBool(map['intl']),
      hasFees: parseBool(map['hasFees']),
      billsOnly: parseBool(map['billsOnly']),
      withAttachment: parseBool(map['withAttachment']),
      subscriptionsOnly: parseBool(map['subscriptionsOnly']),
      uncategorizedOnly: parseBool(map['uncategorizedOnly']),
      friendPhones: parseList(map['friendPhones']),
      groupId: map['groupId'] as String?,
      labels: parseList(map['labels']),
      tags: parseList(map['tags']),
      merchant: map['merchant'] as String?,
      sort: SortSpec(sortField, sortDir),
      groupBy: parseGroup(map['groupBy'] as String?),
    );
  }
}
