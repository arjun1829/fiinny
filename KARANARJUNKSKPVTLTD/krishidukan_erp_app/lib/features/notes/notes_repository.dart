import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/tenant_path.dart';
import '../auth/auth_repository.dart';

/// Writes to the exact same retailers/{id}/notes subcollection the web ERP's
/// Customer Profile "Notes" tab reads (CustomerProfilePage.tsx) — a note added
/// here shows up there immediately, and vice versa. Schema is unchanged:
/// {content, addedBy, createdAt}.
class NotesRepository {
  NotesRepository(this._db, this._tenantId);

  final FirebaseFirestore _db;
  final String _tenantId;

  Future<void> addNote({
    required String retailerId,
    required String content,
    required String addedBy,
  }) {
    return tenantCollection(_db, _tenantId, 'retailers')
        .doc(retailerId)
        .collection('notes')
        .add({
      'content': content,
      'addedBy': addedBy,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }
}

final notesRepositoryProvider = Provider<NotesRepository?>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return null;
  return NotesRepository(ref.watch(firestoreProvider), user.tenantId);
});
