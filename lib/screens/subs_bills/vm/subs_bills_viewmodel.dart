import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/services/subscriptions/subscriptions_service.dart';

/// Produces view-ready aggregates for the four SKU cards.
/// Same output shape as before (Map with keys your screen already uses),
/// but with lightweight memoization to avoid recomputing on tiny changes.
class SubsBillsViewModel {
  final SubscriptionsService svc;
  SubsBillsViewModel(this.svc);

  // ---------- tiny memo ----------
  int? _lastSig;
  Map<String, dynamic>? _subsCache;
  Map<String, dynamic>? _billsCache;
  Map<String, dynamic>? _recurCache;
  Map<String, dynamic>? _emisCache;

  int _signature(List<SharedItem> items) {
    // Cheap-ish content signature: length + rolling hash of stable fields we use.
    int h = items.length * 31;
    for (final e in items) {
      h = 0x1fffffff & (h + (e.id.hashCode ^ (e.nextDueAt?.millisecondsSinceEpoch ?? 0)));
      h = 0x1fffffff & (h + (e.type?.hashCode ?? 0) + (e.rule.status.hashCode));
    }
    return h;
  }

  void _invalidateIfChanged(List<SharedItem> items) {
    final s = _signature(items);
    if (_lastSig != s) {
      _lastSig = s;
      _subsCache = _billsCache = _recurCache = _emisCache = null;
    }
  }

  // ---------- filters / utils ----------
  List<SharedItem> _active(Iterable<SharedItem> list) =>
      list.where((e) => e.rule.status != 'ended').toList(growable: false);

  List<SharedItem> _byType(List<SharedItem> items, String type) =>
      items.where((e) => (e.type ?? '') == type).toList(growable: false);

  /// Sort by nearest due (nulls last)
  List<SharedItem> _sortByNextDue(Iterable<SharedItem> list) {
    final arr = list.toList(growable: false);
    arr.sort((a, b) {
      final da = a.nextDueAt;
      final db = b.nextDueAt;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da.compareTo(db);
    });
    return arr;
  }

  double _sumAmounts(Iterable<SharedItem> list) =>
      list.fold<double>(0, (s, it) => s + (it.rule.amount ?? 0).toDouble());

  // ---------- Subscriptions ----------
  Map<String, dynamic> subscriptions(List<SharedItem> all) {
    _invalidateIfChanged(all);
    if (_subsCache != null) return _subsCache!;

    final subs = _active(_byType(all, 'subscription'));
    final subsSorted = _sortByNextDue(subs);
    final monthlyTotal = _sumAmounts(subs);
    final top = subsSorted.take(3).toList(growable: false);

    _subsCache = {
      'items': subs,
      'monthlyTotal': monthlyTotal,
      'top': top,
      'nextDue': svc.minDue(subs),
    };
    return _subsCache!;
  }

  // ---------- Bills (using 'recurring' for now; refine via meta if needed) ----------
  Map<String, dynamic> bills(List<SharedItem> all) {
    _invalidateIfChanged(all);
    if (_billsCache != null) return _billsCache!;

    final recurring = _active(_byType(all, 'recurring'));
    final sorted = _sortByNextDue(recurring);

    final totalThisMonth = _sumDueInCurrentMonth(recurring);
    final top = sorted.take(2).toList(growable: false);

    // If you later store per-bill "paid" info for the month, compute real ratio here.
    final paidRatio = recurring.isEmpty ? 0.0 : 0.7;

    _billsCache = {
      'items': recurring,
      'totalThisMonth': totalThisMonth,
      'top': top,
      'paidRatio': paidRatio,
      'nextDue': svc.minDue(recurring),
    };
    return _billsCache!;
  }

  // ---------- Recurring (non-monthly: yearly/weekly/custom) ----------
  Map<String, dynamic> recurringNonMonthly(List<SharedItem> all) {
    _invalidateIfChanged(all);
    if (_recurCache != null) return _recurCache!;

    final rec = _active(_byType(all, 'recurring'));
    final nonMonthly = rec.where((e) {
      final f = (e.rule.frequency ?? 'monthly').toLowerCase();
      return f != 'monthly';
    }).toList(growable: false);

    final sorted = _sortByNextDue(nonMonthly);
    final annualized = _annualize(nonMonthly);
    final top = sorted.take(3).toList(growable: false);

    _recurCache = {
      'items': nonMonthly,
      'annualTotal': annualized,
      'top': top,
      'nextDue': svc.minDue(nonMonthly),
    };
    return _recurCache!;
  }

  // ---------- EMIs / Loans ----------
  Map<String, dynamic> emis(List<SharedItem> all) {
    _invalidateIfChanged(all);
    if (_emisCache != null) return _emisCache!;

    final emi = _active(_byType(all, 'emi'));
    final sorted = _sortByNextDue(emi);

    final nextTotal = _sumAmounts(emi);
    final top = sorted.take(3).toList(growable: false);

    _emisCache = {
      'items': emi,
      'nextTotal': nextTotal,
      'top': top,
      'nextDue': svc.minDue(emi),
    };
    return _emisCache!;
  }

  // ---------- helpers ----------

  double _sumDueInCurrentMonth(List<SharedItem> items) {
    final now = DateTime.now();
    return items.fold<double>(0.0, (sum, it) {
      final due = it.nextDueAt;
      if (due == null) return sum;
      if (due.year == now.year && due.month == now.month) {
        return sum + (it.rule.amount ?? 0).toDouble();
      }
      return sum;
    });
  }

  /// Annualize to a single comparable metric:
  /// daily*365, weekly*52, monthly*12, quarterly*4, yearly*1, custom≈365/intervalDays.
  double _annualize(List<SharedItem> items) {
    double sum = 0.0;
    for (final it in items) {
      final amt = (it.rule.amount ?? 0).toDouble();
      final f = (it.rule.frequency ?? 'monthly').toLowerCase();
      switch (f) {
        case 'daily':     sum += amt * 365; break;
        case 'weekly':    sum += amt * 52;  break;
        case 'monthly':   sum += amt * 12;  break;
        case 'quarterly': sum += amt * 4;   break;
        case 'yearly':    sum += amt;       break;
        case 'custom':
          final n = (it.rule.intervalDays ?? 30).clamp(1, 365);
          sum += (365 / n) * amt;
          break;
        default:          sum += amt * 12;  // assume monthly
      }
    }
    return sum;
  }
}
