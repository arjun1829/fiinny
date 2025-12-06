import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/ai_message.dart';

class AiChatService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Stream messages for a specific user
  Stream<List<AiMessage>> streamMessages(String userId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('brain_chat')
        .orderBy('timestamp', descending: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) {
        return AiMessage.fromMap(doc.id, doc.data());
      }).toList();
    });
  }

  /// Send a user message
  Future<void> sendUserMessage(String userId, String text) async {
    await _firestore
        .collection('users')
        .doc(userId)
        .collection('brain_chat')
        .add({
      'text': text,
      'isUser': true,
      'timestamp': FieldValue.serverTimestamp(),
      'status': 'sent',
    });
  }

  /// Add an AI response (called by Cloud Function or local logic)
  Future<void> addAiResponse(String userId, String text) async {
    await _firestore
        .collection('users')
        .doc(userId)
        .collection('brain_chat')
        .add({
      'text': text,
      'isUser': false,
      'timestamp': FieldValue.serverTimestamp(),
      'status': 'sent',
    });
  }

  /// Clear chat history
  Future<void> clearChat(String userId) async {
    final batch = _firestore.batch();
    final docs = await _firestore
        .collection('users')
        .doc(userId)
        .collection('brain_chat')
        .get();
    
    for (var doc in docs.docs) {
      batch.delete(doc.reference);
    }
    await batch.commit();
  }
}
