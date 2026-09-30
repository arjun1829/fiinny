import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/store_commercial.dart';

/// Resolves a store's GST + delivery settings for a product from the same
/// sources, in the same order, the server uses when it prices the cart:
///
///   1. the seller's own product COPY (the source of truth — what the seller
///      edited),
///   2. the store's `availability[]` entry on the canonical product,
///   3. the canonical product itself (the manufacturer's own listing).
///
/// Customers cannot read `inventory`, so that step of the server's chain is
/// skipped; the copy carries the same values.
///
/// This is read when an item is added to the cart and when an older cart line
/// with no stored settings is loaded. The server re-derives everything at
/// payment, so a stale answer here can only mis-display an estimate, never
/// mis-charge — and create-cart-order's figure is what the customer confirms.
class CommercialRepository {
  final FirebaseFirestore _db;
  CommercialRepository({FirebaseFirestore? db})
      : _db = db ?? FirebaseFirestore.instance;

  /// "+91…" and bare forms of a seller phone, as they appear across the schema.
  static List<String> phoneForms(String phone) {
    final p = phone.trim();
    final digits = p.replaceAll(RegExp(r'\D'), '');
    final tail = digits.length >= 10 ? digits.substring(digits.length - 10) : '';
    return {p, if (tail.isNotEmpty) ...[tail, '+91$tail']}
        .where((s) => s.isNotEmpty)
        .toList();
  }

  static String _tail(String v) {
    final d = v.replaceAll(RegExp(r'\D'), '');
    return d.length >= 10 ? d.substring(d.length - 10) : '';
  }

  /// [catalogId] is the canonical product id the cart line carries.
  /// [canonical] / [availability] may be passed when the caller already read
  /// them, to save a read.
  /// Null when NO source carries any settings — callers then keep whatever the
  /// item already has instead of overwriting it with "no GST, no extras".
  Future<StoreCommercial?> resolve({
    required String catalogId,
    required String sellerPhone,
    Map<String, dynamic>? canonical,
    Map<String, dynamic>? availabilityEntry,
  }) async {
    Map<String, dynamic>? copy;
    final forms = phoneForms(sellerPhone);
    if (forms.isNotEmpty) {
      try {
        for (final field in const ['manufacturerProductId', 'originalProductId']) {
          final snap = await _db
              .collection('products')
              .where(field, isEqualTo: catalogId)
              .where('retailerPhone', whereIn: forms.take(10).toList())
              .limit(1)
              .get();
          if (snap.docs.isNotEmpty) {
            copy = snap.docs.first.data();
            break;
          }
        }
      } catch (_) {
        /* unreadable → fall through to the next source */
      }
    }

    var canon = canonical;
    if (canon == null && !StoreCommercial.hasAny(copy)) {
      try {
        canon = (await _db.collection('products').doc(catalogId).get()).data();
      } catch (_) {}
    }

    var entry = availabilityEntry;
    if (entry == null && canon != null) {
      final av = canon['availability'];
      if (av is List) {
        final tail = _tail(sellerPhone);
        for (final e in av.whereType<Map>()) {
          final m = Map<String, dynamic>.from(e);
          if (tail.isNotEmpty &&
              (_tail('${m['storePhone'] ?? ''}') == tail ||
                  _tail('${m['storeId'] ?? ''}') == tail)) {
            entry = m;
            break;
          }
        }
      }
    }

    final sources = [copy, entry, canon];
    if (!sources.any(StoreCommercial.hasAny)) return null;
    return StoreCommercial.firstOf(sources);
  }
}
