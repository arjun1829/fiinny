import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/constants/firestore_keys.dart';
import '../../expenses/data/bill_image.dart';
import 'dealer.dart';

class DealerRepository {
  DealerRepository({FirebaseFirestore? db, FirebaseStorage? storage})
    : _db = db ?? FirebaseFirestore.instance,
      _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFirestore _db;
  final FirebaseStorage _storage;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.dealers);

  /// The whole active dealer master — shared across the field team, not scoped
  /// to the signed-in rep (the Firestore rules allow any sales exec to read it).
  /// Sorted newest-first, then by name, matching the web list order.
  Future<List<Dealer>> active() async {
    final snap = await _col.where('active', isEqualTo: true).get();
    final list = snap.docs.map(Dealer.fromDoc).toList();
    list.sort((a, b) {
      final ta = a.createdAt?.millisecondsSinceEpoch ?? 0;
      final tb = b.createdAt?.millisecondsSinceEpoch ?? 0;
      if (ta != tb) return tb.compareTo(ta);
      return a.shopName.toLowerCase().compareTo(b.shopName.toLowerCase());
    });
    return list;
  }

  /// A single dealer by id, or null when it doesn't exist — used by the
  /// detail page, which links here from a list item that already has this id.
  Future<Dealer?> byId(String dealerId) async {
    final doc = await _col.doc(dealerId).get();
    return doc.exists ? Dealer.fromDoc(doc) : null;
  }

  /// Creates the dealer first, then uploads the photo under the new document's
  /// id — same ordering as expense bills, so a failed upload still leaves a
  /// usable dealer behind instead of losing what the rep typed.
  Future<String> create(
    String uid,
    DealerInput input, {
    BillImage? image,
  }) async {
    final now = FieldValue.serverTimestamp();
    final ref = await _col.add({
      'shopName': input.shopName.trim(),
      'ownerName': input.ownerName.trim(),
      'phone': input.phone.trim(),
      'address': input.address.trim(),
      'type': input.type.name,
      'geo': input.geo == null
          ? null
          : GeoPoint(input.geo!.lat, input.geo!.lng),
      'active': true,
      'createdBy': uid,
      'createdAt': now,
      'updatedAt': now,
      if (input.interest != null) 'interest': input.interest!.name,
    });

    if (image != null) {
      await attachImage(uid: uid, dealerId: ref.id, image: image);
    }
    return ref.id;
  }

  Future<void> update(String dealerId, DealerInput input) async {
    await _col.doc(dealerId).update({
      'shopName': input.shopName.trim(),
      'ownerName': input.ownerName.trim(),
      'phone': input.phone.trim(),
      'address': input.address.trim(),
      'type': input.type.name,
      'geo': input.geo == null
          ? null
          : GeoPoint(input.geo!.lat, input.geo!.lng),
      'updatedAt': FieldValue.serverTimestamp(),
      // Omitted (not written as null) when unset, so leaving the picker
      // untouched on an edit never clobbers a previously recorded interest.
      if (input.interest != null) 'interest': input.interest!.name,
    });
  }

  /// Soft delete — the rules only allow a hard delete for admins, and past
  /// visits still reference the dealer, so deactivating is the correct removal.
  Future<void> deactivate(String dealerId) async {
    await _col.doc(dealerId).update({
      'active': false,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Uploads the dealer photo and patches the doc with its URL/path. The
  /// filename is fixed per dealer (not per-upload), so replacing a photo on
  /// edit overwrites the same Storage object instead of leaving the old one
  /// orphaned. The Firestore doc is only touched after the upload succeeds, so
  /// a failed upload never disturbs an existing photo reference.
  Future<void> attachImage({
    required String uid,
    required String dealerId,
    required BillImage image,
  }) async {
    final path = 'dealers/$dealerId/photo${image.extension}';
    final ref = _storage.ref(path);
    await ref.putData(
      image.bytes,
      SettableMetadata(contentType: image.contentType),
    );
    final url = await ref.getDownloadURL();
    await _col.doc(dealerId).update({
      'imageUrl': url,
      'imagePath': path,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
