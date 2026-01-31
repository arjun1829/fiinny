import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/ai_message.dart';

class AiChatService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Get or create the latest session
  Future<String> getOrCreateSession(String userId) async {
    try {
      final querySnapshot = await _firestore
          .collection('users')
          .doc(userId)
          .collection('chat_sessions')
          .orderBy('lastUpdated', descending: true)
          .limit(1)
          .get();

      if (querySnapshot.docs.isNotEmpty) {
        return querySnapshot.docs.first.id;
      }

      // Create new session
      final sessionId = 'session_${DateTime.now().millisecondsSinceEpoch}';
      await _firestore
          .collection('users')
          .doc(userId)
          .collection('chat_sessions')
          .doc(sessionId)
          .set({
        'title': 'New Chat',
        'lastMessage': '',
        'lastUpdated': FieldValue.serverTimestamp(),
        'messageCount': 0,
        'createdAt': FieldValue.serverTimestamp(),
      });
      return sessionId;
    } catch (e) {
      // debugPrint('Error getting/creating session: $e');
      // Fallback
      return 'default_session';
    }
  }

  /// Stream messages for a specific session
  Stream<List<AiMessage>> streamMessages(String userId, String sessionId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_sessions')
        .doc(sessionId)
        .collection('messages')
        .orderBy('timestamp', descending: true)
        .limit(50) // Pagination limit matching web
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) {
        return AiMessage.fromMap(doc.id, doc.data());
      }).toList();
    });
  }

  /// Get recent messages (Future, not Stream)
  Future<List<AiMessage>> getRecentMessages(String userId, String sessionId,
      {int limit = 10}) async {
    final snap = await _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_sessions')
        .doc(sessionId)
        .collection('messages')
        .orderBy('timestamp', descending: true)
        .limit(limit)
        .get();

    return snap.docs
        .map((doc) => AiMessage.fromMap(doc.id, doc.data()))
        .toList();
  }

  /// Send a user message to a specific session
  Future<void> sendUserMessage(
      String userId, String sessionId, String text) async {
    await _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_sessions')
        .doc(sessionId)
        .collection('messages')
        .add({
      'text': text,
      'isUser': true,
      'timestamp': FieldValue.serverTimestamp(),
      'status': 'sent',
    });
  }

  /// Add an AI response and update session metadata
  Future<void> addAiResponse(
      String userId, String sessionId, String text) async {
    final sessionRef = _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_sessions')
        .doc(sessionId);

    final messageRef = sessionRef.collection('messages');

    // Add message
    await messageRef.add({
      'text': text,
      'isUser': false,
      'timestamp': FieldValue.serverTimestamp(),
      'status': 'sent',
    });

    // Update session metadata
    final countSnapshot = await messageRef.count().get();
    final count = countSnapshot.count;

    await sessionRef.update({
      'lastMessage': text.length > 100 ? '${text.substring(0, 100)}...' : text,
      'lastUpdated': FieldValue.serverTimestamp(),
      'messageCount': count,
    });
  }

  /// Clear chat history (delete session)
  Future<void> clearChat(String userId, String sessionId) async {
    // Delete all messages in subcollection
    final messages = await _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_sessions')
        .doc(sessionId)
        .collection('messages')
        .get();

    final batch = _firestore.batch();
    for (var doc in messages.docs) {
      batch.delete(doc.reference);
    }

    // Delete session doc
    batch.delete(_firestore
        .collection('users')
        .doc(userId)
        .collection('chat_sessions')
        .doc(sessionId));

    await batch.commit();
  }
}
