import 'dart:developer' as dev;

import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/models/store_model.dart';

class StoreRepository {
  final _db = FirebaseFirestore.instance;

  Future<List<StoreModel>> fetchStores() async {
    // Query all collections that hold store/retailer/manufacturer profiles.
    // profiles/{phone} is the primary new-schema source (allow read: if true).
    // retailers/, manufacturers/, stores/ are legacy/parallel sources.
    // storeReviews/ is optional — failure silently gives zero ratings.

    final results = await Future.wait([
      _db.collection('profiles').get(),
      _db.collection('retailers').get(),
      _db.collection('manufacturers').get(),
      _db.collection('stores').get(),
      _db.collection('storeReviews').get().catchError((_) {
        return _EmptyQuerySnapshot() as QuerySnapshot<Map<String, dynamic>>;
      }),
    ]);

    final profilesSnap     = results[0];
    final retailersSnap    = results[1];
    final manufacturersSnap = results[2];
    final storesSnap       = results[3];
    final reviewsSnap      = results[4];

    // ── Build ratings map: storePhone → (sum, count) ────────────────────
    final ratingAgg = <String, _RatingAgg>{};
    for (final doc in reviewsSnap.docs) {
      final data = doc.data();
      final phone = (data['storePhone'] ?? '').toString();
      final rating = (data['rating'] as num?)?.toDouble() ?? 0.0;
      if (phone.isEmpty || rating <= 0) continue;
      final cur = ratingAgg[phone] ?? _RatingAgg(0, 0);
      ratingAgg[phone] = _RatingAgg(cur.sum + rating, cur.count + 1);
    }

    // ── Global deduplication map: key → _TempStore ───────────────────────
    // Key is phone (preferred) or doc.id. Higher-scored entries win.
    final globalMap = <String, _TempStore>{};

    void upsert(_TempStore ts) {
      if (ts.name.isEmpty) return; // skip nameless entries
      final key = (ts.phone != null && ts.phone!.isNotEmpty) ? ts.phone! : ts.id;
      final existing = globalMap[key];
      if (existing == null || ts.score > existing.score) {
        globalMap[key] = ts;
      }
    }

    // ── 1. profiles/{phone} — primary new schema ─────────────────────────
    for (final doc in profilesSnap.docs) {
      final d = doc.data();
      final role = d['role'] as String? ?? '';
      // Only include retailers and manufacturers
      if (!['retailer', 'manufacturer'].contains(role)) continue;

      final phone = d['phone'] as String? ??
          (_isPhoneId(doc.id) ? doc.id : null);
      final addr = d['address'];
      String? addrStr;
      String? city;
      String? state;
      String? pincode;
      if (addr is Map) {
        addrStr  = addr['line1']?.toString();
        city     = addr['city']?.toString();
        state    = addr['state']?.toString();
        pincode  = addr['pincode']?.toString();
      } else if (addr is String) {
        addrStr = addr;
      }

      final geo = d['geo'];
      double? lat;
      double? lng;
      if (geo is GeoPoint) {
        lat = geo.latitude;
        lng = geo.longitude;
      } else if (geo is Map) {
        lat = _num(geo['latitude'] ?? geo['lat']);
        lng = _num(geo['longitude'] ?? geo['lng']);
      }

      upsert(_TempStore(
        id: doc.id,
        name: (d['shopName'] ?? d['businessName'] ?? d['ownerName'] ?? '').toString(),
        ownerName: d['ownerName']?.toString(),
        phone: phone,
        uid: d['uid']?.toString(),
        logo: d['logo']?.toString(),
        address: addrStr,
        city: city,
        state: state,
        pincode: pincode,
        lat: (lat != null && lat != 0.0) ? lat : null,
        lng: (lng != null && lng != 0.0) ? lng : null,
        role: role,
        googleMapsUrl: _mapsUrl(d),
        score: 10 + (lat != null && lat != 0.0 ? 1 : 0),
      ));
    }

    // ── 2. retailers/{id} — legacy / web dashboard ───────────────────────
    for (final doc in retailersSnap.docs) {
      try {
        final d = doc.data();
        final phone = d['phone']?.toString() ??
            (_isPhoneId(doc.id) ? doc.id : null);
        final geoRaw = d['geo'];
        final geo = geoRaw is Map ? geoRaw : null;
        final geoPoint = geoRaw is GeoPoint ? geoRaw : null;
        final locRaw = d['location'];
        final loc = locRaw is Map ? locRaw : null;

        upsert(_TempStore(
          id: doc.id,
          name: (d['shopName'] ?? d['ownerName'] ?? '').toString(),
          ownerName: d['ownerName']?.toString(),
          phone: phone,
          uid: d['uid']?.toString(),
          logo: d['logo']?.toString(),
          address: d['address']?.toString(),
          city: d['city']?.toString(),
          state: d['state']?.toString(),
          pincode: d['pincode']?.toString(),
          lat: geoPoint?.latitude ?? _num(geo?['latitude'] ?? loc?['latitude'] ?? loc?['lat'] ?? d['lat']),
          lng: geoPoint?.longitude ?? _num(geo?['longitude'] ?? loc?['longitude'] ?? loc?['lng'] ?? d['lng']),
          role: 'retailer',
          googleMapsUrl: _mapsUrl(d),
          score: 5,
        ));
      } catch (_) {}
    }

    // ── 3. manufacturers/{id} ────────────────────────────────────────────
    for (final doc in manufacturersSnap.docs) {
      try {
        final d = doc.data();
        if (d['businessName'] == null && d['ownerName'] == null) continue;

        final phone = d['phone']?.toString() ??
            (_isPhoneId(doc.id) ? doc.id : null);
        final geoRaw = d['geo'];
        final geo = geoRaw is Map ? geoRaw : null;
        final geoPoint = geoRaw is GeoPoint ? geoRaw : null;
        final locRaw = d['location'];
        final loc = locRaw is Map ? locRaw : null;
        final addr = d['address'];
        String? city;
        String? state;
        String? pincode;
        if (addr is Map) {
          city    = addr['city']?.toString();
          state   = addr['state']?.toString();
          pincode = addr['pincode']?.toString();
        }

        upsert(_TempStore(
          id: doc.id,
          name: (d['businessName'] ?? d['ownerName'] ?? '').toString(),
          ownerName: d['ownerName']?.toString(),
          phone: phone,
          uid: d['uid']?.toString(),
          logo: d['logo']?.toString(),
          address: addr is String ? addr : null,
          city: city ?? d['city']?.toString(),
          state: state ?? d['state']?.toString(),
          pincode: pincode ?? d['pincode']?.toString(),
          lat: geoPoint?.latitude ?? _num(geo?['latitude'] ?? loc?['latitude'] ?? loc?['lat'] ?? d['lat']),
          lng: geoPoint?.longitude ?? _num(geo?['longitude'] ?? loc?['longitude'] ?? loc?['lng'] ?? d['lng']),
          role: 'manufacturer',
          googleMapsUrl: _mapsUrl(d),
          score: 5,
        ));
      } catch (_) {}
    }

    // ── 4. stores/{id} — legacy ──────────────────────────────────────────
    for (final doc in storesSnap.docs) {
      try {
        final d = doc.data();
        final phone = d['phone']?.toString();
        final locRaw = d['location'];
        final loc = locRaw is Map ? locRaw : null;
        final geoRaw = d['geo'];
        final geo = geoRaw is Map ? geoRaw : null;
        final geoPoint = geoRaw is GeoPoint ? geoRaw : null;

        upsert(_TempStore(
          id: doc.id,
          name: (d['name'] ?? d['shopName'] ?? '').toString(),
          ownerName: d['ownerName']?.toString(),
          phone: phone,
          uid: d['uid']?.toString() ?? d['userId']?.toString(),
          logo: d['logo']?.toString(),
          address: d['address']?.toString(),
          city: d['city']?.toString(),
          state: d['state']?.toString(),
          pincode: d['pincode']?.toString(),
          lat: geoPoint?.latitude ?? _num(geo?['latitude'] ?? loc?['latitude'] ?? loc?['lat'] ?? d['lat']),
          lng: geoPoint?.longitude ?? _num(geo?['longitude'] ?? loc?['longitude'] ?? loc?['lng'] ?? d['lng']),
          googleMapsUrl: _mapsUrl(d),
          score: 3,
        ));
      } catch (_) {}
    }

    dev.log('StoreRepository: found ${globalMap.length} stores '
        '(profiles:${profilesSnap.docs.length}, '
        'retailers:${retailersSnap.docs.length}, '
        'manufacturers:${manufacturersSnap.docs.length}, '
        'stores:${storesSnap.docs.length})');

    // ── Convert to StoreModel and attach ratings ─────────────────────────
    return globalMap.values.map((ts) {
      final phone = ts.phone ?? (ts.id.isNotEmpty ? ts.id : null);
      final agg = phone != null ? ratingAgg[phone] : null;
      return StoreModel(
        id: ts.id,
        name: ts.name,
        ownerName: ts.ownerName,
        phone: ts.phone,
        userId: ts.uid,
        address: ts.address,
        logo: ts.logo,
        lat: ts.lat,
        lng: ts.lng,
        city: ts.city,
        state: ts.state,
        pincode: ts.pincode,
        role: ts.role,
        googleMapsUrl: ts.googleMapsUrl,
        averageRating: (agg != null && agg.count > 0) ? agg.sum / agg.count : null,
        totalReviews: (agg != null && agg.count > 0) ? agg.count : null,
      );
    }).toList();
  }

  bool _isPhoneId(String id) =>
      RegExp(r'^\+?\d{10,13}$').hasMatch(id);

  /// Seller's Google Maps / Business listing URL under any of the key names
  /// the web + mobile profile editors have used.
  String? _mapsUrl(Map<String, dynamic> d) {
    final raw = (d['googleMapsUrl'] ?? d['googleBusinessUrl'] ?? d['mapsLink'])
        ?.toString()
        .trim();
    return (raw != null && raw.startsWith('http')) ? raw : null;
  }

  double? _num(dynamic v) {
    if (v == null) return null;
    if (v is num) {
      final d = v.toDouble();
      return d == 0.0 ? null : d;
    }
    if (v is String) return double.tryParse(v);
    return null;
  }
}

class _RatingAgg {
  final double sum;
  final int count;
  const _RatingAgg(this.sum, this.count);
}

class _TempStore {
  final String id;
  final String name;
  final String? ownerName;
  final String? phone;
  final String? uid;
  final String? logo;
  final String? address;
  final String? city;
  final String? state;
  final String? pincode;
  final double? lat;
  final double? lng;
  final String role;
  final String? googleMapsUrl;
  final int score;

  const _TempStore({
    required this.id,
    required this.name,
    this.ownerName,
    this.phone,
    this.uid,
    this.logo,
    this.address,
    this.city,
    this.state,
    this.pincode,
    this.lat,
    this.lng,
    this.role = '',
    this.googleMapsUrl,
    required this.score,
  });
}

class _EmptyQuerySnapshot implements QuerySnapshot<Map<String, dynamic>> {
  @override
  List<QueryDocumentSnapshot<Map<String, dynamic>>> get docs => [];
  @override
  List<DocumentChange<Map<String, dynamic>>> get docChanges => [];
  @override
  SnapshotMetadata get metadata => throw UnimplementedError();
  @override
  int get size => 0;
}
