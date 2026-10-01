import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/services/location_service.dart';

/// What kind of trade partner this record is. The field team calls on
/// retailers, distributors and manufacturers — the people who actually buy —
/// so a visit list is far easier to work through when it can be filtered by type.
///
/// Stored as an OPTIONAL `type` string. Records created by the web /sales route
/// have no `type` at all, so [DealerType.from] treats a missing value as
/// [retailer] rather than dropping the record, and web edits (which write a
/// fixed field list) leave an existing value untouched.
enum DealerType {
  retailer('Retailer'),
  distributor('Distributor'),
  manufacturer('Manufacturer');

  const DealerType(this.label);
  final String label;

  static DealerType from(dynamic raw) {
    final v = '${raw ?? ''}'.toLowerCase();
    return DealerType.values.firstWhere(
      (t) => t.name == v,
      orElse: () => DealerType.retailer,
    );
  }
}

/// How keen this dealer currently seems on KrishiDukaan — a rep's own read of
/// the conversation, not anything the dealer submits themselves.
///
/// Unlike [DealerType], this is genuinely OPTIONAL with no default: a dealer
/// nobody has assessed yet should show as unset, not silently read as "Low
/// Interest". Stored as an optional `interest` string only when the rep has
/// picked one; absent entirely on every dealer created before this field
/// existed, which [DealerInterest.from] returns as `null` for.
enum DealerInterest {
  low('Low Interest'),
  considering('Considering'),
  veryInterested('Very Interested');

  const DealerInterest(this.label);
  final String label;

  /// Returns null for a missing/unrecognised value — there is no fallback
  /// default, unlike [DealerType.from].
  ///
  /// Compares case-insensitively on BOTH sides: `.name` for a value like
  /// [veryInterested] is camelCase ("veryInterested"), so lowercasing only
  /// the incoming raw value and comparing it against `i.name` verbatim never
  /// matches — every dealer saved with that value would silently read back
  /// as unset. `low` and `considering` have no uppercase letters in their
  /// name, which is why only [veryInterested] was affected.
  static DealerInterest? from(dynamic raw) {
    if (raw == null) return null;
    final v = '$raw'.toLowerCase();
    for (final i in DealerInterest.values) {
      if (i.name.toLowerCase() == v) return i;
    }
    return null;
  }
}

/// Shared dealer master. Same documents as the web /sales/dealers page
/// (app/sales/dealers/dealers-service.ts).
class Dealer {
  final String id;
  final String shopName;
  final String ownerName;
  final String phone;
  final String address;
  final DealerType type;
  final LatLngPoint? geo;
  final bool active;
  final String createdBy;
  final DateTime? createdAt;

  /// Optional shop/dealer photo. Absent on every dealer created before this
  /// field existed and on any the web has not been given an uploader for, so
  /// display code must treat null as the normal case, not an error.
  final String? imageUrl;
  final String? imagePath;

  /// The rep's read of how interested this dealer is. Null means unset —
  /// either nobody has assessed it yet, or the dealer predates this field.
  final DealerInterest? interest;

  const Dealer({
    required this.id,
    required this.shopName,
    required this.ownerName,
    required this.phone,
    required this.address,
    required this.type,
    required this.geo,
    required this.active,
    required this.createdBy,
    this.createdAt,
    this.imageUrl,
    this.imagePath,
    this.interest,
  });

  factory Dealer.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const {};
    final raw = d['geo'];
    return Dealer(
      id: doc.id,
      shopName: '${d['shopName'] ?? ''}',
      ownerName: '${d['ownerName'] ?? ''}',
      phone: '${d['phone'] ?? ''}',
      address: '${d['address'] ?? ''}',
      type: DealerType.from(d['type']),
      geo: raw is GeoPoint ? LatLngPoint(raw.latitude, raw.longitude) : null,
      active: d['active'] != false,
      createdBy: '${d['createdBy'] ?? ''}',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      imageUrl: d['imageUrl'] as String?,
      imagePath: d['imagePath'] as String?,
      interest: DealerInterest.from(d['interest']),
    );
  }

  /// Matches a free-text search across the fields a rep would actually type.
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return shopName.toLowerCase().contains(q) ||
        ownerName.toLowerCase().contains(q) ||
        phone.contains(q) ||
        address.toLowerCase().contains(q);
  }
}

/// Payload for creating/updating a dealer.
class DealerInput {
  final String shopName;
  final String ownerName;
  final String phone;
  final String address;
  final DealerType type;
  final LatLngPoint? geo;

  /// Null when the rep hasn't picked one — creation/edit must succeed either
  /// way, since this is optional.
  final DealerInterest? interest;

  const DealerInput({
    required this.shopName,
    required this.ownerName,
    required this.phone,
    required this.address,
    required this.type,
    required this.geo,
    this.interest,
  });
}
