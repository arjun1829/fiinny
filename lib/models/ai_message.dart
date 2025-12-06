import 'package:cloud_firestore/cloud_firestore.dart';

class AiMessage {
  final String id;
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final String status; // 'sending', 'sent', 'error'

  AiMessage({
    required this.id,
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.status = 'sent',
  });

  factory AiMessage.fromMap(String id, Map<String, dynamic> data) {
    return AiMessage(
      id: id,
      text: data['text'] ?? '',
      isUser: data['isUser'] ?? false,
      timestamp: (data['timestamp'] as Timestamp?)?.toDate() ?? DateTime.now(),
      status: data['status'] ?? 'sent',
    );
  }
}
