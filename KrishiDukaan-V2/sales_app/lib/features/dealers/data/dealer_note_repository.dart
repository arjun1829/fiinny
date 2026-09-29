import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/constants/firestore_keys.dart';
import 'dealer_note.dart';

class DealerNoteRepository {
  DealerNoteRepository({FirebaseFirestore? db})
    : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.dealerNotes);

  /// A dealer's notes, oldest first — a running log of the conversation.
  Future<List<DealerNote>> forDealer(String dealerId) async {
    final snap = await _col
        .where('dealerId', isEqualTo: dealerId)
        .orderBy('createdAt')
        .get();
    return snap.docs.map(DealerNote.fromDoc).toList();
  }

  Future<String> add(String uid, String dealerId, String note) async {
    final ref = await _col.add({
      'dealerId': dealerId,
      'salesExecutiveId': uid,
      'note': note.trim(),
      'createdAt': FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  Future<void> delete(String noteId) => _col.doc(noteId).delete();
}
