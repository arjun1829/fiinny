import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/retailer_brand_model.dart';

class RetailerBrandRepository {
  final FirebaseFirestore _db;
  final FirebaseStorage _storage;

  RetailerBrandRepository({FirebaseFirestore? db, FirebaseStorage? storage})
      : _db = db ?? FirebaseFirestore.instance,
        _storage = storage ?? FirebaseStorage.instance;

  DocumentReference<Map<String, dynamic>> _doc(String phone) =>
      _db.collection('retailerBrandPages').doc(phone);

  /// The brand page for [phone], or null when there is none — or, for anyone
  /// but the owner, when it is switched off (the rules deny that read).
  Future<({RetailerBrandModel brand, bool exists})?> fetch(String phone) async {
    try {
      final snap = await _doc(phone).get();
      return (
        brand: RetailerBrandModel.fromMap(snap.data()),
        exists: snap.exists,
      );
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') return null;
      rethrow;
    }
  }

  Future<void> save(String phone, RetailerBrandModel brand,
      {required bool isNew}) {
    return _doc(phone).set({
      ...brand.toMap(),
      'updatedAt': FieldValue.serverTimestamp(),
      if (isNew) 'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// One shop photo, under the storage-rules-allowed `profile-images/` prefix
  /// (web's uploader uses the same folder).
  Future<String> uploadPhoto(File file, String phone) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final ref = _storage.ref().child(
          'profile-images/gallery/${DateTime.now().millisecondsSinceEpoch}-$digits.jpg',
        );
    final task = await ref.putFile(
      file,
      SettableMetadata(
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      ),
    );
    return task.ref.getDownloadURL();
  }
}

final retailerBrandRepositoryProvider =
    Provider<RetailerBrandRepository>((_) => RetailerBrandRepository());

/// A shop's VISIBLE brand page (null when off or missing) — for shoppers.
final publicRetailerBrandProvider =
    FutureProvider.family<RetailerBrandModel?, String>((ref, phone) async {
  if (phone.isEmpty) return null;
  final r = await ref.read(retailerBrandRepositoryProvider).fetch(phone);
  final brand = r?.brand;
  return (brand != null && brand.enabled) ? brand : null;
});
