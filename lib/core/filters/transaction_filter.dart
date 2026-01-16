import 'dart:collection';

import 'package:intl/intl.dart';

enum TxType { all, expense, income }

enum SortField { date, amount, merchant, category }

enum SortDir { asc, desc }

enum GroupBy { none, day, week, month, merchant, category }

class SortSpec {
  final SortField field;
  final SortDir dir;

  const SortSpec(this.field, this.dir);
}

class TransactionFilter {
  final TxType type;
  final DateTime? from;
  final DateTime? to;
  final double? minAmount;
  final double? maxAmount;
  final String text;
  final String? category;
  final String? subcategory;
  final String? instrument;
  final String? network;
  final String? issuerBank;
  final String? last4;
  final String? counterpartyType;
  final bool? intl;
  final bool? hasFees;
  final bool? billsOnly;
  final bool? withAttachment;
  final bool? subscriptionsOnly;
  final bool? uncategorizedOnly;
  final List<String> friendPhones;
  final String? groupId;
  final List<String> labels;
  final List<String> tags;
  final String? merchant;
  final SortSpec sort;
  final GroupBy groupBy;

  const TransactionFilter({
    this.type = TxType.all,
    this.from,
    this.to,
    this.minAmount,
    this.maxAmount,
    this.text = '',
    this.category,
    this.subcategory,
    this.instrument,
    this.network,
    this.issuerBank,
    this.last4,
    this.counterpartyType,
    this.intl,
    this.hasFees,
    this.billsOnly,
    this.withAttachment,
    this.subscriptionsOnly,
    this.uncategorizedOnly,
    this.friendPhones = const [],
    this.groupId,
    this.labels = const [],
    this.tags = const [],
    this.merchant,
    this.sort = const SortSpec(SortField.date, SortDir.desc),
    this.groupBy = GroupBy.day,
  });

  TransactionFilter copyWith({
    TxType? type,
    DateTime? from,
    DateTime? to,
    double? minAmount,
    double? maxAmount,
    String? text,
    String? category,
    String? subcategory,
    String? instrument,
    String? network,
    String? issuerBank,
    String? last4,
    String? counterpartyType,
    bool? intl,
    bool? hasFees,
    bool? billsOnly,
    bool? withAttachment,
    bool? subscriptionsOnly,
    bool? uncategorizedOnly,
    List<String>? friendPhones,
    String? groupId,
    List<String>? labels,
    List<String>? tags,
    String? merchant,
    SortSpec? sort,
    GroupBy? groupBy,
  }) {
    return TransactionFilter(
      type: type ?? this.type,
      from: from ?? this.from,
      to: to ?? this.to,
      minAmount: minAmount ?? this.minAmount,
      maxAmount: maxAmount ?? this.maxAmount,
      text: text ?? this.text,
      category: category ?? this.category,
      subcategory: subcategory ?? this.subcategory,
      instrument: instrument ?? this.instrument,
      network: network ?? this.network,
      issuerBank: issuerBank ?? this.issuerBank,
      last4: last4 ?? this.last4,
      counterpartyType: counterpartyType ?? this.counterpartyType,
      intl: intl ?? this.intl,
      hasFees: hasFees ?? this.hasFees,
      billsOnly: billsOnly ?? this.billsOnly,
      withAttachment: withAttachment ?? this.withAttachment,
      subscriptionsOnly: subscriptionsOnly ?? this.subscriptionsOnly,
      uncategorizedOnly: uncategorizedOnly ?? this.uncategorizedOnly,
      friendPhones: friendPhones ?? this.friendPhones,
      groupId: groupId ?? this.groupId,
      labels: labels ?? this.labels,
      tags: tags ?? this.tags,
      merchant: merchant ?? this.merchant,
      sort: sort ?? this.sort,
      groupBy: groupBy ?? this.groupBy,
    );
  }

  static TransactionFilter defaults() => const TransactionFilter();
}

bool _ciEq(String a, String b) =>
    a.trim().toLowerCase() == b.trim().toLowerCase();

bool _ciContains(String hay, String needle) =>
    hay.toLowerCase().contains(needle.toLowerCase());

bool txMatches(Map<String, dynamic> tx, TransactionFilter f) {
  if (f.type != TxType.all) {
    final txType = (tx['type'] ?? '').toString().toLowerCase();
    if (f.type == TxType.expense && txType != 'expense') {
      return false;
    }
    if (f.type == TxType.income && txType != 'income') {
      return false;
    }
  }

  final txDate = _asDate(tx['date']);
  if (f.from != null && (txDate == null || txDate.isBefore(f.from!))) {
    return false;
  }
  if (f.to != null && (txDate == null || txDate.isAfter(f.to!))) {
    return false;
  }

  final amount = _toDouble(tx['amount']);
  if (f.minAmount != null && (amount == null || amount < f.minAmount!)) {
    return false;
  }
  if (f.maxAmount != null && (amount == null || amount > f.maxAmount!)) {
    return false;
  }

  if (f.text.trim().isNotEmpty) {
    final q = f.text.trim().toLowerCase();
    var matched = false;
    final merchant = tx['merchant'];
    if (merchant is String && _ciContains(merchant, q)) {
      matched = true;
    }
    final category = tx['category'];
    if (!matched && category is String && _ciContains(category, q)) {
      matched = true;
    }
    final title = tx['title'];
    if (!matched && title is String && _ciContains(title, q)) {
      matched = true;
    }
    final note = tx['note'];
    if (!matched && note is String && _ciContains(note, q)) {
      matched = true;
    }
    final labels = tx['labels'];
    if (!matched && labels is Iterable) {
      final joined = labels.whereType<String>().join(' ');
      if (joined.isNotEmpty && _ciContains(joined, q)) {
        matched = true;
      }
    }
    if (!matched) {
      return false;
    }
  }

  if (f.category != null && f.category!.trim().isNotEmpty) {
    final txCategory = tx['category'];
    if (txCategory is! String || !_ciEq(txCategory, f.category!)) {
      return false;
    }
  }

  if (f.subcategory != null && f.subcategory!.trim().isNotEmpty) {
    final txSubcategory = tx['subcategory'];
    if (txSubcategory is! String || !_ciEq(txSubcategory, f.subcategory!)) {
      return false;
    }
  }

  if (f.instrument != null && f.instrument!.trim().isNotEmpty) {
    final value = tx['instrument'];
    if (value is! String || !_ciEq(value, f.instrument!)) {
      return false;
    }
  }

  if (f.network != null && f.network!.trim().isNotEmpty) {
    final value = tx['network'];
    if (value is! String || !_ciEq(value, f.network!)) {
      return false;
    }
  }

  if (f.issuerBank != null && f.issuerBank!.trim().isNotEmpty) {
    final value = tx['issuerBank'];
    if (value is! String || !_ciEq(value, f.issuerBank!)) {
      return false;
    }
  }

  if (f.last4 != null && f.last4!.trim().isNotEmpty) {
    final value = tx['cardLast4'] ?? tx['last4'];
    if (value is! String || !_ciEq(value, f.last4!)) {
      return false;
    }
  }

  if (f.counterpartyType != null && f.counterpartyType!.trim().isNotEmpty) {
    final value = tx['counterpartyType'];
    if (value is! String || !_ciEq(value, f.counterpartyType!)) {
      return false;
    }
  }

  if (f.intl != null) {
    final isIntl = tx['isInternational'];
    if (isIntl is! bool || isIntl != f.intl) {
      return false;
    }
  }

  if (f.hasFees != null) {
    final value = tx['hasFees'];
    if (value is! bool || value != f.hasFees) {
      return false;
    }
  }

  final raw = tx['raw'];

  if (f.billsOnly == true && !_isBill(raw)) {
    return false;
  }

  if (f.withAttachment == true && !_hasAttachment(raw)) {
    return false;
  }

  if (f.subscriptionsOnly == true) {
    final tags = tx['tags'];
    final hasTag =
        tags is String && tags.toLowerCase().contains('subscription');
    final recurringKey = _extractRecurringKey(raw);
    if (!(hasTag || recurringKey != null)) {
      return false;
    }
  }

  if (f.uncategorizedOnly == true) {
    final category = tx['category'];
    if (category is String && category.trim().isNotEmpty) {
      if (!_ciEq(category, 'Uncategorized')) {
        return false;
      }
    } else if (category != null) {
      return false;
    }
  }

  if (f.friendPhones.isNotEmpty) {
    final friendIds = _extractFriendIds(raw);
    final matchesFriend = friendIds.any(
      (id) => f.friendPhones.any((phone) => _ciEq(id, phone)),
    );
    if (!matchesFriend) {
      return false;
    }
  }

  if (f.groupId != null && f.groupId!.trim().isNotEmpty) {
    final gid = _extractGroupId(raw);
    if (gid is! String || !_ciEq(gid, f.groupId!)) {
      return false;
    }
  }

  if (f.labels.isNotEmpty) {
    final labels = tx['labels'];
    final txLabels = labels is Iterable
        ? labels.whereType<String>().toList(growable: false)
        : const <String>[];
    final hasLabel = txLabels.any(
        (label) => f.labels.any((filterLabel) => _ciEq(label, filterLabel)));
    if (!hasLabel) {
      return false;
    }
  }

  if (f.tags.isNotEmpty) {
    final tagsValue = tx['tags'];
    final txTags = <String>[];
    if (tagsValue is Iterable) {
      txTags.addAll(tagsValue.whereType<String>());
    } else if (tagsValue is String) {
      txTags.add(tagsValue);
    }
    final hasTag = txTags
        .any((tag) => f.tags.any((filterTag) => _ciContains(tag, filterTag)));
    if (!hasTag) {
      return false;
    }
  }

  if (f.merchant != null && f.merchant!.trim().isNotEmpty) {
    final merchant = tx['merchant'];
    if (merchant is! String || !_ciEq(merchant, f.merchant!)) {
      return false;
    }
  }

  return true;
}

double? _toDouble(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  if (value is String) {
    return double.tryParse(value);
  }
  return null;
}

DateTime? _asDate(dynamic value) {
  if (value is DateTime) {
    return value;
  }
  if (value is String) {
    return DateTime.tryParse(value);
  }
  return null;
}

bool _isBill(dynamic raw) {
  if (raw == null) {
    return false;
  }
  if (raw is Map) {
    if (raw['isBill'] == true) {
      return true;
    }
    final type = raw['type'];
    if (type is String && _ciEq(type, 'Credit Card Bill')) {
      return true;
    }
    return false;
  }
  try {
    if (raw.isBill == true) {
      return true;
    }
  } catch (_) {}
  try {
    final type = raw.type;
    if (type is String && _ciEq(type, 'Credit Card Bill')) {
      return true;
    }
  } catch (_) {}
  return false;
}

bool _hasAttachment(dynamic raw) {
  if (raw == null) {
    return false;
  }
  if (raw is Map) {
    final attachmentUrl = raw['attachmentUrl'];
    if (attachmentUrl is String && attachmentUrl.trim().isNotEmpty) {
      return true;
    }
    final attachments = raw['attachments'];
    if (attachments is Iterable && attachments.isNotEmpty) {
      return true;
    }
    final billUrl = raw['billUrl'];
    if (billUrl is String && billUrl.trim().isNotEmpty) {
      return true;
    }
    return false;
  }
  try {
    final attachmentUrl = raw.attachmentUrl;
    if (attachmentUrl is String && attachmentUrl.trim().isNotEmpty) {
      return true;
    }
  } catch (_) {}
  try {
    final attachments = raw.attachments;
    if (attachments is Iterable && attachments.isNotEmpty) {
      return true;
    }
  } catch (_) {}
  try {
    final billUrl = raw.billUrl;
    if (billUrl is String && billUrl.trim().isNotEmpty) {
      return true;
    }
  } catch (_) {}
  return false;
}

List<String> _extractFriendIds(dynamic raw) {
  if (raw == null) {
    return const <String>[];
  }
  if (raw is Map) {
    return _extractStringList(raw['friendIds']);
  }
  try {
    final value = raw.friendIds;
    return _extractStringList(value);
  } catch (_) {
    return const <String>[];
  }
}

String? _extractGroupId(dynamic raw) {
  if (raw == null) {
    return null;
  }
  if (raw is Map) {
    final value = raw['groupId'];
    if (value is String) {
      return value;
    }
    return value?.toString();
  }
  try {
    final value = raw.groupId;
    if (value is String) {
      return value;
    }
    return value?.toString();
  } catch (_) {
    return null;
  }
}

dynamic _extractRecurringKey(dynamic raw) {
  if (raw == null) {
    return null;
  }
  if (raw is Map) {
    final brainMeta = raw['brainMeta'];
    if (brainMeta is Map) {
      return brainMeta['recurringKey'];
    }
  }
  try {
    final brainMeta = raw.brainMeta;
    if (brainMeta is Map) {
      return brainMeta['recurringKey'];
    }
    try {
      return brainMeta.recurringKey;
    } catch (_) {}
  } catch (_) {}
  return null;
}

List<String> _extractStringList(dynamic value) {
  if (value is Iterable) {
    return value.whereType<String>().toList(growable: false);
  }
  if (value is String) {
    return <String>[value];
  }
  return const <String>[];
}

List<Map<String, dynamic>> applyFilterAndSort(
  List<Map<String, dynamic>> all,
  TransactionFilter f,
) {
  final filtered = all.where((tx) => txMatches(tx, f)).toList(growable: false);
  final sorted = List<Map<String, dynamic>>.of(filtered);

  int compareStrings(String? a, String? b) {
    if (a == null && b == null) {
      return 0;
    }
    if (a == null) {
      return 1;
    }
    if (b == null) {
      return -1;
    }
    return a.toLowerCase().compareTo(b.toLowerCase());
  }

  sorted.sort((a, b) {
    int result;
    switch (f.sort.field) {
      case SortField.date:
        final aDate = _asDate(a['date']);
        final bDate = _asDate(b['date']);
        if (aDate == null && bDate == null) {
          result = 0;
        } else if (aDate == null) {
          result = 1;
        } else if (bDate == null) {
          result = -1;
        } else {
          result = aDate.compareTo(bDate);
        }
        break;
      case SortField.amount:
        final aAmount = _toDouble(a['amount']);
        final bAmount = _toDouble(b['amount']);
        if (aAmount == null && bAmount == null) {
          result = 0;
        } else if (aAmount == null) {
          result = 1;
        } else if (bAmount == null) {
          result = -1;
        } else {
          result = aAmount.compareTo(bAmount);
        }
        break;
      case SortField.merchant:
        result = compareStrings(
          a['merchant'] as String?,
          b['merchant'] as String?,
        );
        break;
      case SortField.category:
        result = compareStrings(
          a['category'] as String?,
          b['category'] as String?,
        );
        break;
    }
    if (f.sort.dir == SortDir.desc) {
      result = -result;
    }
    return result;
  });

  return sorted;
}

Map<String, List<Map<String, dynamic>>> groupTx(
  List<Map<String, dynamic>> list,
  GroupBy g,
) {
  if (g == GroupBy.none) {
    final result = LinkedHashMap<String, List<Map<String, dynamic>>>();
    result['All'] = List<Map<String, dynamic>>.of(list);
    return result;
  }

  final result = LinkedHashMap<String, List<Map<String, dynamic>>>();
  for (final tx in list) {
    final key = _groupKey(tx, g);
    result.putIfAbsent(key, () => <Map<String, dynamic>>[]).add(tx);
  }
  return result;
}

String _groupKey(Map<String, dynamic> tx, GroupBy g) {
  final date = _asDate(tx['date']);
  switch (g) {
    case GroupBy.none:
      return 'All';
    case GroupBy.day:
      if (date == null) {
        return 'Unknown';
      }
      return DateFormat('d MMM, yyyy').format(date);
    case GroupBy.week:
      if (date == null) {
        return 'Unknown';
      }
      final monday = date.subtract(Duration(days: date.weekday - 1));
      final label = DateFormat('d MMM').format(monday);
      return 'Week of $label';
    case GroupBy.month:
      if (date == null) {
        return 'Unknown';
      }
      return DateFormat('MMM yyyy').format(date);
    case GroupBy.merchant:
      final merchant = tx['merchant'];
      if (merchant is String && merchant.trim().isNotEmpty) {
        return merchant;
      }
      return '—';
    case GroupBy.category:
      final category = tx['category'];
      if (category is String && category.trim().isNotEmpty) {
        return category;
      }
      return '—';
  }
}
