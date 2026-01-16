// lib/sharing/services/partner_service.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:lifemap/utils/phone_number_utils.dart';

import '../models/partner_model.dart';

class PartnerService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // -----------------------------
  // Helpers
  // -----------------------------
  bool _looksLikePhone(String s) {
    final t = s.trim();
    return t.startsWith('+') && RegExp(r'^\+\d{8,15}$').hasMatch(t);
  }

  String _normalizePhone(String raw) =>
      normalizeToE164(raw, fallbackCountryCode: kDefaultCountryCode);

  // Resolve a user by identifier (phone/email/phone field/referral)
  Future<DocumentSnapshot<Map<String, dynamic>>?> _resolveUserDoc(String identifier) async {
    final id = identifier.trim();

    if (_looksLikePhone(id)) {
      final doc = await _db.collection('users').doc(id).get();
      if (doc.exists) return doc;
    }

    final emailSnap = await _db.collection('users')
        .where('email', isEqualTo: id.toLowerCase())
        .limit(1)
        .get();
    if (emailSnap.docs.isNotEmpty) return emailSnap.docs.first;

    final phoneSnap = await _db.collection('users')
        .where('phone', isEqualTo: id)
        .limit(1)
        .get();
    if (phoneSnap.docs.isNotEmpty) return phoneSnap.docs.first;

    final refSnap = await _db.collection('users')
        .where('referralCode', isEqualTo: id)
        .limit(1)
        .get();
    if (refSnap.docs.isNotEmpty) return refSnap.docs.first;

    return null;
  }

  // -----------------------------
  // Add partner (creates/rehydrates pending request + local pending link)
  // -----------------------------
  Future<String?> addPartner({
    required String currentUserPhone,
    required String partnerIdentifier,
    String? relation,
    required Map<String, bool> permissions,
  }) async {
    final from = _normalizePhone(currentUserPhone);

    final partnerDoc = await _resolveUserDoc(partnerIdentifier);
    if (partnerDoc == null) return null;

    final partnerId = _normalizePhone(partnerDoc.id);
    if (partnerId == from) throw Exception('You cannot send a request to yourself.');

    final existing = await _db
        .collection('partner_requests')
        .where('fromUserPhone', isEqualTo: from)
        .where('toUserPhone', isEqualTo: partnerId)
        .where('status', isEqualTo: 'pending')
        .limit(1)
        .get();

    String requestId;
    if (existing.docs.isNotEmpty) {
      requestId = existing.docs.first.id;
    } else {
      final reqRef = await _db.collection('partner_requests').add({
        'fromUserPhone': from,
        'toUserPhone': partnerId,
        'relation': relation,
        'permissions': permissions,
        'status': 'pending',
        'createdAt': FieldValue.serverTimestamp(),
      });
      requestId = reqRef.id;
    }

    await _createOrUpdateLocalPendingLink(
      currentUserPhone: from,
      partnerId: partnerId,
      relation: relation,
      permissions: permissions,
      requestId: requestId,
    );

    return partnerId;
  }

  Future<void> _createOrUpdateLocalPendingLink({
    required String currentUserPhone,
    required String partnerId,
    String? relation,
    required Map<String, bool> permissions,
    required String requestId,
  }) async {
    final partnerUser = await _db.collection('users').doc(partnerId).get();
    final partnerData = partnerUser.data() ?? {};
    final partnerName = (partnerData['name'] ?? '').toString();
    final partnerEmail = (partnerData['email'] as String?)?.trim();

    final ref = _db
        .collection('users')
        .doc(currentUserPhone)
        .collection('sharedPartners')
        .doc(partnerId);

    final model = PartnerModel(
      id: partnerId,
      userId: currentUserPhone,
      partnerId: partnerId,
      partnerName: partnerName,
      partnerEmail: partnerEmail,
      relation: relation,
      permissions: permissions,
      status: 'pending',
      addedOn: DateTime.now(),
    );

    await ref.set({
      ...model.toMap(),
      'approvedRequestId': requestId,
    }, SetOptions(merge: true));
  }

  // -----------------------------
  // Approve / Reject / Cancel
  // -----------------------------
  Future<void> approveRequest({
    required String requestId,
    required String approverPhone,
  }) async {
    final approver = _normalizePhone(approverPhone);

    await _db.runTransaction((tx) async {
      final reqRef = _db.collection('partner_requests').doc(requestId);
      final reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw Exception('Request not found');

      final data = reqSnap.data() as Map<String, dynamic>;
      final status = (data['status'] ?? '').toString();
      final from = (data['fromUserPhone'] ?? '').toString();
      final to = (data['toUserPhone'] ?? '').toString();

      if (status != 'pending') return;
      if (to != approver) throw Exception('Forbidden: only the recipient may approve');

      final perms = Map<String, dynamic>.from(data['permissions'] ?? {});
      final now = FieldValue.serverTimestamp();

      // Sender side link
      final senderRef = _db
          .collection('users').doc(from)
          .collection('sharedPartners').doc(to);
      tx.set(senderRef, {
        'partnerPhone': to,
        'status': 'active',
        'permissions': perms,
        'permissionsGrantedBy': to,
        'approvedRequestId': requestId,
        'createdAt': now,
      }, SetOptions(merge: true));

      // Recipient side link
      final recipRef = _db
          .collection('users').doc(to)
          .collection('sharedPartners').doc(from);
      tx.set(recipRef, {
        'partnerPhone': from,
        'status': 'active',
        'permissions': perms,
        'permissionsGrantedBy': to,
        'approvedRequestId': requestId,
        'createdAt': now,
      }, SetOptions(merge: true));

      tx.update(reqRef, {
        'status': 'approved',
        'approvedAt': now,
        'approvedBy': approver,
      });
    });
  }

  Future<void> rejectRequest({
    required String requestId,
    required String approverPhone,
  }) async {
    final approver = _normalizePhone(approverPhone);

    await _db.runTransaction((tx) async {
      final reqRef = _db.collection('partner_requests').doc(requestId);
      final reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw Exception('Request not found');

      final data = reqSnap.data() as Map<String, dynamic>;
      final status = (data['status'] ?? '').toString();
      final to = (data['toUserPhone'] ?? '').toString();
      final from = (data['fromUserPhone'] ?? '').toString();

      if (status != 'pending') return;
      if (to != approver) throw Exception('Forbidden: only the recipient may reject');

      tx.update(reqRef, {
        'status': 'rejected',
        'approvedAt': FieldValue.serverTimestamp(),
        'approvedBy': approver,
      });

      final senderRef = _db
          .collection('users').doc(from)
          .collection('sharedPartners').doc(to);
      tx.set(senderRef, {'status': 'rejected'}, SetOptions(merge: true));
    });
  }

  Future<void> cancelRequest({
    required String requestId,
    required String senderPhone,
  }) async {
    final sender = _normalizePhone(senderPhone);

    await _db.runTransaction((tx) async {
      final reqRef = _db.collection('partner_requests').doc(requestId);
      final reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw Exception('Request not found');

      final data = reqSnap.data() as Map<String, dynamic>;
      final status = (data['status'] ?? '').toString();
      final from = (data['fromUserPhone'] ?? '').toString();
      final to = (data['toUserPhone'] ?? '').toString();

      if (status != 'pending') return;
      if (from != sender) throw Exception('Forbidden: only sender may cancel');

      tx.update(reqRef, {'status': 'cancelled'});

      final senderRef = _db
          .collection('users').doc(from)
          .collection('sharedPartners').doc(to);
      tx.set(senderRef, {'status': 'cancelled'}, SetOptions(merge: true));
    });
  }

  // -----------------------------
  // Remove partner (RECIPROCAL)
  // -----------------------------
  Future<void> removePartner({
    required String currentUserPhone,
    required String partnerPhone,
  }) async {
    final a = _normalizePhone(currentUserPhone);
    final b = _normalizePhone(partnerPhone);

    // 1) Delete both sides’ sharedPartners documents atomically
    await _db.runTransaction((tx) async {
      final aRef = _db.collection('users').doc(a).collection('sharedPartners').doc(b);
      final bRef = _db.collection('users').doc(b).collection('sharedPartners').doc(a);
      tx.delete(aRef);
      tx.delete(bRef);
    });

    // 2) Best-effort: mark any approved request between A<->B as revoked (not required for UI)
    try {
      final q1 = await _db.collection('partner_requests')
          .where('fromUserPhone', isEqualTo: a)
          .where('toUserPhone', isEqualTo: b)
          .where('status', isEqualTo: 'approved')
          .limit(1)
          .get();
      final q2 = await _db.collection('partner_requests')
          .where('fromUserPhone', isEqualTo: b)
          .where('toUserPhone', isEqualTo: a)
          .where('status', isEqualTo: 'approved')
          .limit(1)
          .get();
      final doc = q1.docs.isNotEmpty ? q1.docs.first : (q2.docs.isNotEmpty ? q2.docs.first : null);
      if (doc != null) {
        await doc.reference.update({
          'status': 'revoked',
          'revokedAt': FieldValue.serverTimestamp(),
          'revokedBy': a,
        });
      }
    } catch (_) {
      // ignore best-effort failures
    }
  }

  // -----------------------------
  // Fetch partners for a user (with batch stats) — now RESPECTS PERMS
  // -----------------------------
  Future<List<PartnerModel>> fetchSharedPartnersWithStats(String currentUserPhone) async {
    final userId = _normalizePhone(currentUserPhone);

    final snapshot = await _db
        .collection('users')
        .doc(userId)
        .collection('sharedPartners')
        .get();

    if (snapshot.docs.isEmpty) return [];

    final relationships = snapshot.docs
        .map((doc) => PartnerModel.fromFirestore(doc))
        .toList();

    final partnerIds = relationships.map((r) => r.partnerId).toSet().toList();

    // Batch fetch partner profiles (chunk by 10)
    final usersCol = _db.collection('users');
    final List<QueryDocumentSnapshot<Map<String, dynamic>>> userDocs = [];
    const chunkSize = 10;
    for (var i = 0; i < partnerIds.length; i += chunkSize) {
      final end = (i + chunkSize < partnerIds.length) ? i + chunkSize : partnerIds.length;
      final chunk = partnerIds.sublist(i, end);
      final q = await usersCol.where(FieldPath.documentId, whereIn: chunk).get();
      userDocs.addAll(q.docs);
    }
    final profileMap = {for (var d in userDocs) d.id: d.data()};

    // Today window
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);

    Future<PartnerModel> enrich(PartnerModel rel) async {
      final partnerProfile = profileMap[rel.partnerId];
      final String? avatar = partnerProfile?['avatar'] as String?;

      // Gate reads by status + tx permission (prevents accidental reads + aligns with rules)
      final canReadTx = (rel.status == 'active') && (rel.permissions['tx'] == true);

      double todayCredit = 0.0;
      double todayDebit = 0.0;
      int todayTxCount = 0;

      if (canReadTx) {
        final incomesSnap = await _db
            .collection('users')
            .doc(rel.partnerId)
            .collection('incomes')
            .where('date', isGreaterThanOrEqualTo: todayStart)
            .get();

        final expensesSnap = await _db
            .collection('users')
            .doc(rel.partnerId)
            .collection('expenses')
            .where('date', isGreaterThanOrEqualTo: todayStart)
            .get();

        for (final d in incomesSnap.docs) {
          todayCredit += (d.data()['amount'] as num? ?? 0).toDouble();
          todayTxCount += 1;
        }
        for (final d in expensesSnap.docs) {
          todayDebit += (d.data()['amount'] as num? ?? 0).toDouble();
          todayTxCount += 1;
        }
      }

      final todayTxAmount = todayCredit + todayDebit;

      return rel.copyWith(
        avatar: avatar,
        todayCredit: todayCredit,
        todayDebit: todayDebit,
        todayTxCount: todayTxCount,
        todayTxAmount: todayTxAmount,
      );
    }

    return await Future.wait(relationships.map(enrich));
  }

  // -----------------------------
  // Update partner permissions (kept for compatibility)
  // -----------------------------
  Future<void> updatePartnerPermissions({
    required String currentUserPhone,
    required String partnerPhone,
    required Map<String, bool> permissions,
  }) async {
    final ref = _db
        .collection('users')
        .doc(_normalizePhone(currentUserPhone))
        .collection('sharedPartners')
        .doc(_normalizePhone(partnerPhone));
    await ref.update({'permissions': permissions});
  }

  // -----------------------------
  // Legacy helper (kept)
  // -----------------------------
  Future<void> updateSharingStatus({
    required String currentUserPhone,
    required String partnerPhone,
    required String status,
  }) async {
    final ref = _db
        .collection('users')
        .doc(_normalizePhone(currentUserPhone))
        .collection('sharedPartners')
        .doc(_normalizePhone(partnerPhone));
    await ref.update({'status': status});
  }

  // -----------------------------
  // Streams for inbox/outbox
  // -----------------------------
  Stream<QuerySnapshot<Map<String, dynamic>>> streamIncomingPending(String viewerPhone) {
    final phone = _normalizePhone(viewerPhone);
    return _db
        .collection('partner_requests')
        .where('toUserPhone', isEqualTo: phone)
        .where('status', isEqualTo: 'pending')
        .snapshots();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> streamSentPending(String viewerPhone) {
    final phone = _normalizePhone(viewerPhone);
    return _db
        .collection('partner_requests')
        .where('fromUserPhone', isEqualTo: phone)
        .where('status', isEqualTo: 'pending')
        .snapshots();
  }
}
