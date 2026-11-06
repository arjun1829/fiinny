import 'package:cloud_firestore/cloud_firestore.dart';

import '../features/auth/auth_repository.dart';
import 'tenant_path.dart';

/// logAudit() from src/utils/auditLog.ts — same auditLogs schema, so actions
/// taken in the app show up in the web Audit Log. Fire-and-forget: a failed
/// audit write must never fail the sale or payment it describes.
void logAudit(
  FirebaseFirestore db,
  AppUser user, {
  required String module,
  required String action,
  required String entityName,
  String? entityId,
  String? description,
  String? remarks,
  Map<String, dynamic>? after,
}) {
  final entry = <String, dynamic>{
    'timestamp': FieldValue.serverTimestamp(),
    'userId': user.uid,
    'userName': user.name.isNotEmpty ? user.name : user.email,
    'userRole': user.role,
    'module': module,
    'action': action,
    'entityName': entityName,
    if (entityId != null) 'entityId': entityId,
    if (description != null) 'description': description,
    if (remarks != null) 'remarks': remarks,
    if (after != null) 'after': after,
  };
  // Non-fatal by design (the web logs a console warning and moves on).
  tenantCollection(db, user.tenantId, 'auditLogs')
      .add(entry)
      .then((_) {}, onError: (_) {});
}
