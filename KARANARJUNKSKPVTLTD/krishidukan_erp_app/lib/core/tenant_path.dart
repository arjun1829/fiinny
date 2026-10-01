import 'package:cloud_firestore/cloud_firestore.dart';

/// Mirrors src/utils/tenantPath.ts — the 'master' tenant reads root-level
/// collections, every other tenant is scoped under /tenants/{id}/.
CollectionReference<Map<String, dynamic>> tenantCollection(
  FirebaseFirestore db,
  String tenantId,
  String name,
) {
  if (tenantId.isEmpty) {
    throw StateError('No tenantId while resolving "$name"');
  }
  return tenantId == 'master'
      ? db.collection(name)
      : db.collection('tenants').doc(tenantId).collection(name);
}
