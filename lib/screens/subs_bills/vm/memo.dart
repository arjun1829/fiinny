// lib/screens/subs_bills/vm/memo.dart
import 'package:collection/collection.dart';
import 'package:lifemap/details/models/shared_item.dart';

class SubsBillsMemo {
  final _eq = const DeepCollectionEquality.unordered();

  List<SharedItem> _last;
  dynamic _kpis, _subs, _bills, _recur, _emis;

  SubsBillsMemo(): _last = const [];

  bool _same(List<SharedItem> a, List<SharedItem> b) => _eq.equals(a, b);

  T ensure<T>(List<SharedItem> items, T Function() compute, T? cache, void Function(T) set) {
    if (cache != null && _same(items, _last)) return cache;
    final v = compute();
    _last = items;
    set(v);
    return v;
  }

  get kpis => _kpis;
  set kpis(v) => _kpis = v;

  get subs => _subs; set subs(v) => _subs = v;
  get bills => _bills; set bills(v) => _bills = v;
  get recur => _recur; set recur(v) => _recur = v;
  get emis  => _emis;  set emis(v)  => _emis  = v;
}
