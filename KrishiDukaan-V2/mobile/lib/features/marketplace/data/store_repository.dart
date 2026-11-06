import 'dart:developer' as dev;

import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/models/store_model.dart';
import '../../../core/services/perf_trace.dart';

class StoreRepository {
  final _db = FirebaseFirestore.instance;

  Future<List<StoreModel>> fetchStores() async {
    // Every collection that holds store/retailer/manufacturer profiles —
    // profiles/{phone} (the primary new-schema source) and the legacy/parallel
    // retailers/, manufacturers/ and stores/ — plus storeReviews totals per
    // phone, read from the 1–2 storeDirectory docs Cloud Functions keep current
    // (functions/src/stores/directory.ts) instead of every doc of all five.
    final directory = await traced(
        'load_store_directory', () => _db.collection('storeDirectory').get());
    final parsed =
        parseStoreDirectory(directory.docs.map((d) => d.data()).toList());

    // storePhone → (sum, count)
    final ratingAgg = {
      for (final e in parsed.ratings.entries)
        e.key: _RatingAgg(e.value.sum, e.value.count),
    };
    final profilesSnap      = _DirectorySnapshot(parsed.recordsOf('profiles'));
    final retailersSnap     = _DirectorySnapshot(parsed.recordsOf('retailers'));
    final manufacturersSnap = _DirectorySnapshot(parsed.recordsOf('manufacturers'));
    final storesSnap        = _DirectorySnapshot(parsed.recordsOf('stores'));

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
        onlineDelivery: _onlineDeliveryOf(d),
        score: 10 + (lat != null && lat != 0.0 ? 1 : 0),
      ));
    }

    // ── 2. retailers/{id} — legacy / web dashboard ───────────────────────
    for (final doc in retailersSnap.docs) {
      try {
        final d = doc.data();

        // Explicit deactivation by an admin/manufacturer is the ONLY reason to
        // hide a store from search/count — mirrors app/firebase.ts's fetchStores
        // exactly. Deliberately NOT gating on `active`/`assignedSeat`: that was
        // tried on web and rejected 294 of 423 retailers, most of whom DO have
        // sellable products — `active: false` there is just the un-activated
        // default (onboardingStatus: 'pending'), not a deactivation signal.
        final onboardingStatus = (d['onboardingStatus'] ?? '').toString();
        if (onboardingStatus == 'removed' || onboardingStatus == 'inactive') {
          continue;
        }

        final phone = d['phone']?.toString() ??
            (_isPhoneId(doc.id) ? doc.id : null);
        final geoRaw = d['geo'];
        final geo = geoRaw is Map ? geoRaw : null;
        final geoPoint = geoRaw is GeoPoint ? geoRaw : null;
        final locRaw = d['location'];
        final loc = locRaw is Map ? locRaw : null;

        upsert(_TempStore(
          id: doc.id,
          // Web falls back to the literal placeholder 'Retailer' rather than
          // dropping a nameless doc (app/firebase.ts fetchStores:
          // `data.shopName || data.ownerName || 'Retailer'`). Mobile's
          // upsert() below skips any entry with an EMPTY name, so without
          // this fallback these retailers silently vanished from mobile's
          // count while still showing on web — confirmed live: 2 retailers
          // with no shopName/ownerName were the entire 450-vs-448 gap.
          name: (d['shopName'] ?? d['ownerName'] ?? 'Retailer').toString(),
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
          onlineDelivery: _onlineDeliveryOf(d),
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
          onlineDelivery: _onlineDeliveryOf(d),
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
          onlineDelivery: _onlineDeliveryOf(d),
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
        onlineDelivery: ts.onlineDelivery,
        averageRating: (agg != null && agg.count > 0) ? agg.sum / agg.count : null,
        totalReviews: (agg != null && agg.count > 0) ? agg.count : null,
      );
    }).toList();
  }

  bool _isPhoneId(String id) =>
      RegExp(r'^\+?\d{10,13}$').hasMatch(id);

  /// Reads `onlineDelivery` as a TRI-STATE: true / false / null-when-absent.
  /// Absence must stay distinguishable from false — see
  /// StoreModel.onlineDelivery for why absence cannot mean "off".
  static bool? _onlineDeliveryOf(Map<String, dynamic> d) {
    final v = d['onlineDelivery'];
    return v is bool ? v : null;
  }

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
  /// Tri-state account-level online-selling switch — see StoreModel.onlineDelivery.
  final bool? onlineDelivery;
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
    this.onlineDelivery,
    required this.score,
  });
}

/// One record from storeDirectory, shaped like a query document so the merge
/// reads it exactly as it read the source collections.
class StoreDirectoryRecord {
  final String id;
  final Map<String, dynamic> _data;
  const StoreDirectoryRecord(this.id, this._data);
  Map<String, dynamic> data() => _data;
}

class _DirectorySnapshot {
  final List<StoreDirectoryRecord> docs;
  const _DirectorySnapshot(this.docs);
}

/// The store directory's chunks (functions/src/stores/directory.ts) turned
/// back into per-collection records and per-phone review totals.
class StoreDirectory {
  final Map<String, List<StoreDirectoryRecord>> _records;
  final Map<String, ({double sum, int count})> ratings;
  const StoreDirectory(this._records, this.ratings);

  List<StoreDirectoryRecord> recordsOf(String collection) =>
      _records[collection] ?? const [];
}

StoreDirectory parseStoreDirectory(List<Map<String, dynamic>> chunkDocs) {
  final chunks = [...chunkDocs]
    ..sort((a, b) => ((a['chunkIndex'] as num?) ?? 0)
        .compareTo((b['chunkIndex'] as num?) ?? 0));
  if (chunks.isEmpty ||
      chunks.map((c) => c['buildId']).toSet().length != 1 ||
      chunks.length != (chunks.first['chunkCount'] as num?)?.toInt()) {
    throw StateError('store directory unavailable or incomplete');
  }

  final records = <String, List<StoreDirectoryRecord>>{};
  final ratings = <String, ({double sum, int count})>{};
  for (final chunk in chunks) {
    for (final raw in (chunk['entries'] as List? ?? const [])) {
      final e = Map<String, dynamic>.from(raw as Map);
      (records[e['c'].toString()] ??= []).add(StoreDirectoryRecord(
        e['id'].toString(),
        Map<String, dynamic>.from(e['d'] as Map),
      ));
    }
    (chunk['ratings'] as Map?)?.forEach((phone, agg) {
      final a = agg as Map;
      ratings[phone.toString()] = (
        sum: (a['sum'] as num?)?.toDouble() ?? 0,
        count: (a['count'] as num?)?.toInt() ?? 0,
      );
    });
  }
  return StoreDirectory(records, ratings);
}
