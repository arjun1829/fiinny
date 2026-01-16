// lib/screens/friends/friends_controller.dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/expense_item.dart';
import '../../models/friend_model.dart';
import '../../models/group_model.dart';

import '../../services/expense_service.dart';
import '../../services/friend_service.dart';
import '../../services/group_service.dart';

enum FriendsSortMode { recent, amount, az }

class FriendsController extends ChangeNotifier {
  FriendsController(this.userPhone) {
    _bind();
  }

  bool _disposed = false;

  final String userPhone;

  // Raw data
  List<ExpenseItem> _expenses = const [];
  List<FriendModel> _friends = const [];
  List<GroupModel> _groups = const [];

  // Avatars cache (phone -> url?)
  final Map<String, String?> avatarByPhone = {};

  // View settings
  bool openOnly = false;
  FriendsSortMode sortMode = FriendsSortMode.recent;
  String query = '';

  // Subscriptions
  StreamSubscription? _sx;
  StreamSubscription? _sf;
  StreamSubscription? _sg;

  // ---------- Lifecycle ----------
  Future<void> _bind() async {
    _sx = ExpenseService().getExpensesStream(userPhone).listen((v) {
      _expenses = v;
      _rebuild();
    });

    _sf = FriendService().streamFriends(userPhone).listen((v) async {
      _friends = v;
      _primeAvatars();
      _rebuild();
    });

    _sg = GroupService().streamGroups(userPhone).listen((v) {
      _groups = v;
      _primeAvatars();
      _rebuild();
    });
  }

  @override
  void dispose() {
    _sx?.cancel();
    _sf?.cancel();
    _sg?.cancel();
    _disposed = true;
    super.dispose();
  }

  // ---------- Public API ----------
  void setQuery(String q) {
    query = q.trim();
    _rebuild();
  }

  void setOpenOnly(bool v) {
    openOnly = v;
    _rebuild();
  }

  void setSort(FriendsSortMode m) {
    sortMode = m;
    _rebuild();
  }

  List<_FriendVM> get friendsVM => _friendsVM;
  List<_GroupVM> get groupsVM => _groupsVM;
  List<_MixedVM> get allVM => _allVM;

  // ---------- Internal State ----------
  List<_FriendVM> _friendsVM = const [];
  List<_GroupVM> _groupsVM = const [];
  List<_MixedVM> _allVM = const [];

  void _rebuild() {
    _friendsVM = _buildFriendVMs(userPhone, _friends, _expenses,
        query: query, openOnly: openOnly, sort: sortMode);

    _groupsVM = _buildGroupVMs(userPhone, _groups, _expenses,
        query: query, openOnly: openOnly, sort: sortMode);

    _allVM = <_MixedVM>[
      ..._friendsVM.map((f) => _MixedVM.friend(f)),
      ..._groupsVM.map((g) => _MixedVM.group(g)),
    ]..sort((a, b) {
        final aDt = a.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bDt = b.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bDt.compareTo(aDt);
      });

    if (_disposed) return;
    notifyListeners();
  }

  Future<void> _primeAvatars() async {
    final phones = <String>{
      ..._friends.map((f) => f.phone),
      for (final g in _groups) ...g.memberPhones,
    }..removeWhere((p) => p.isEmpty);

    final unknown = phones.where((p) => !avatarByPhone.containsKey(p)).toList();
    if (unknown.isEmpty) return;

    try {
      // Firestore doesn't support multi-get by IDs in one call here,
      // so do a small batch Future.wait (it runs concurrently).
      final futures = unknown.map((phone) async {
        try {
          final doc = await FirebaseFirestore.instance
              .collection('users')
              .doc(phone)
              .get();
          final url = (doc.data()?['avatar'] as String?)?.trim();
          avatarByPhone[phone] = (url != null && url.isNotEmpty) ? url : null;
        } catch (_) {
          avatarByPhone[phone] = null;
        }
      });
      await Future.wait(futures);
      if (_disposed) return;
      notifyListeners();
    } catch (_) {
      // ignore
    }
  }
}

/* ========================== View Models ========================== */

class _FriendVM {
  final FriendModel friend;
  final double net; // + => owes you, - => you owe
  final ExpenseItem? lastTx;
  DateTime? get lastUpdate => lastTx?.date;

  _FriendVM(this.friend, this.net, this.lastTx);
}

class _GroupVM {
  final GroupModel group;
  final double owedToYou;
  final double youOwe;
  final ExpenseItem? lastTx;
  double get net => owedToYou - youOwe;
  DateTime? get lastUpdate => lastTx?.date;

  _GroupVM(this.group, this.owedToYou, this.youOwe, this.lastTx);
}

class _MixedVM {
  final bool isGroup;
  final _FriendVM? f;
  final _GroupVM? g;
  final DateTime? lastUpdate;

  _MixedVM.friend(this.f)
      : isGroup = false,
        g = null,
        lastUpdate = f?.lastUpdate;
  _MixedVM.group(this.g)
      : isGroup = true,
        f = null,
        lastUpdate = g?.lastUpdate;
}

/* ========================== Build helpers ========================== */

bool _matches(String q, String hay) =>
    hay.toLowerCase().contains(q.toLowerCase());

bool _isSettlement(ExpenseItem e) {
  final t = (e.type).toLowerCase();
  final lbl = (e.label ?? '').toLowerCase();
  if (t.contains('settle') || lbl.contains('settle')) return true;
  if ((e.friendIds.length == 1) &&
      (e.customSplits == null || e.customSplits!.isEmpty)) {
    return (e.isBill == true);
  }
  return false;
}

Set<String> _participantsOf(ExpenseItem e) {
  final s = <String>{};
  if (e.payerId.isNotEmpty) s.add(e.payerId);
  s.addAll(e.friendIds);
  if (e.customSplits != null && e.customSplits!.isNotEmpty) {
    s.addAll(e.customSplits!.keys);
  }
  return s;
}

Map<String, double> _splitsOf(ExpenseItem e) {
  if (e.customSplits != null && e.customSplits!.isNotEmpty) {
    return Map<String, double>.from(e.customSplits!);
  }
  final parts = _participantsOf(e).toList();
  if (parts.isEmpty) return const {};
  final each = e.amount / parts.length;
  return {for (final id in parts) id: each};
}

/// Signed pair delta between 'you' and 'other':
/// + => other owes YOU; - => YOU owe other; 0 => no effect.
double _pairSigned(ExpenseItem e, String you, String other) {
  final parts = _participantsOf(e);
  if (!parts.contains(you) || !parts.contains(other)) return 0.0;

  if (_isSettlement(e)) {
    final others = e.friendIds;
    if (others.isEmpty) return 0.0;
    final perOther = e.amount / others.length;
    if (e.payerId == you && others.contains(other)) return perOther;
    if (e.payerId == other && others.contains(you)) return -perOther;
    return 0.0;
  }

  final splits = _splitsOf(e);
  if (e.payerId == you && splits.containsKey(other)) {
    return splits[other] ?? 0.0; // they owe you
  }
  if (e.payerId == other && splits.containsKey(you)) {
    return -(splits[you] ?? 0.0); // you owe them
  }
  return 0.0; // third-party paid
}

List<_FriendVM> _buildFriendVMs(
  String you,
  List<FriendModel> friends,
  List<ExpenseItem> txs, {
  required String query,
  required bool openOnly,
  required FriendsSortMode sort,
}) {
  final out = <_FriendVM>[];

  for (final f in friends) {
    if (query.isNotEmpty &&
        !_matches(query, f.name) &&
        !_matches(query, f.phone)) {
      continue;
    }

    double net = 0.0;
    final affecting = <ExpenseItem>[];
    for (final e in txs) {
      final d = _pairSigned(e, you, f.phone);
      if (d.abs() >= 0.005) {
        affecting.add(e);
        net += d;
      }
    }
    net = double.parse(net.toStringAsFixed(2));
    if (openOnly && net == 0.0) continue;

    affecting.sort((a, b) => b.date.compareTo(a.date));
    final last = affecting.isNotEmpty ? affecting.first : null;

    out.add(_FriendVM(f, net, last));
  }

  switch (sort) {
    case FriendsSortMode.recent:
      out.sort((a, b) {
        final ad = a.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bd = b.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bd.compareTo(ad);
      });
      break;
    case FriendsSortMode.amount:
      out.sort((a, b) => b.net.abs().compareTo(a.net.abs()));
      break;
    case FriendsSortMode.az:
      out.sort((a, b) =>
          a.friend.name.toLowerCase().compareTo(b.friend.name.toLowerCase()));
      break;
  }
  return out;
}

List<_GroupVM> _buildGroupVMs(
  String you,
  List<GroupModel> groups,
  List<ExpenseItem> txs, {
  required String query,
  required bool openOnly,
  required FriendsSortMode sort,
}) {
  final out = <_GroupVM>[];

  for (final g in groups) {
    if (query.isNotEmpty && !_matches(query, g.name)) continue;

    final gtx = txs.where((t) => t.groupId == g.id).toList()
      ..sort((a, b) => b.date.compareTo(a.date));

    double owedToYou = 0.0, youOwe = 0.0;
    final members = g.memberPhones.where((p) => p != you).toList();

    for (final e in gtx) {
      for (final m in members) {
        final d = _pairSigned(e, you, m);
        if (d > 0) {
          owedToYou += d;
        } else if (d < 0) {
          youOwe += (-d);
        }
      }
    }
    owedToYou = double.parse(owedToYou.toStringAsFixed(2));
    youOwe = double.parse(youOwe.toStringAsFixed(2));
    if (openOnly && owedToYou == 0.0 && youOwe == 0.0) continue;

    final last = gtx.isNotEmpty ? gtx.first : null;
    out.add(_GroupVM(g, owedToYou, youOwe, last));
  }

  switch (sort) {
    case FriendsSortMode.recent:
      out.sort((a, b) {
        final ad = a.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bd = b.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bd.compareTo(ad);
      });
      break;
    case FriendsSortMode.amount:
      out.sort((a, b) => b.net.abs().compareTo(a.net.abs()));
      break;
    case FriendsSortMode.az:
      out.sort((a, b) =>
          a.group.name.toLowerCase().compareTo(b.group.name.toLowerCase()));
      break;
  }
  return out;
}
