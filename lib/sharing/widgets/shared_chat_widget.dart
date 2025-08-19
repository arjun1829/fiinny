import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Phone-based 1:1 chat between currentUserId and partnerId.
/// - Thread path: conversations/{threadId}/messages
/// - threadId is a stable key made from the two ids (sorted + joined with "__").
/// - A parent doc is created with participants & lastMessage for future listing.
class SharedChatWidget extends StatefulWidget {
  final String partnerId;      // phone (or legacy doc id)
  final String currentUserId;  // phone (or legacy doc id)
  const SharedChatWidget({
    Key? key,
    required this.partnerId,
    required this.currentUserId,
  }) : super(key: key);

  @override
  State<SharedChatWidget> createState() => _SharedChatWidgetState();
}

class _SharedChatWidgetState extends State<SharedChatWidget> {
  final _msgCtrl = TextEditingController();
  final _db = FirebaseFirestore.instance;

  String get _threadId {
    final a = widget.currentUserId.trim();
    final b = widget.partnerId.trim();
    final sorted = [a, b]..sort();
    return "${sorted[0]}__${sorted[1]}";
  }

  CollectionReference<Map<String, dynamic>> get _messagesCol =>
      _db.collection('conversations').doc(_threadId).collection('messages');

  DocumentReference<Map<String, dynamic>> get _threadDoc =>
      _db.collection('conversations').doc(_threadId);

  Future<void> _ensureThreadDoc() async {
    final doc = await _threadDoc.get();
    if (!doc.exists) {
      await _threadDoc.set({
        'participants': [widget.currentUserId, widget.partnerId],
        'createdAt': FieldValue.serverTimestamp(),
        'lastMessage': null,
        'lastMessageAt': null,
      });
    }
  }

  Future<void> _sendMessage() async {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;

    await _ensureThreadDoc();

    final now = FieldValue.serverTimestamp();
    await _messagesCol.add({
      'from': widget.currentUserId,
      'to': widget.partnerId,
      'text': text,
      'timestamp': now,
      'read': false,
      'type': 'text',
    });

    // Update thread summary for list views (optional but handy)
    await _threadDoc.update({
      'lastMessage': text,
      'lastMessageAt': now,
      'lastMessageFrom': widget.currentUserId,
    });

    _msgCtrl.clear();
  }

  @override
  void dispose() {
    _msgCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _messagesCol
                .orderBy('timestamp', descending: true)
                .limit(200)
                .snapshots(),
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (!snap.hasData || snap.data!.docs.isEmpty) {
                return const Center(child: Text("No messages yet. Say hi!"));
              }
              final docs = snap.data!.docs;

              return ListView.builder(
                reverse: true,
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: docs.length,
                itemBuilder: (context, i) {
                  final data = docs[i].data();
                  final isMe = data['from'] == widget.currentUserId;
                  final text = (data['text'] ?? '').toString();

                  return Align(
                    alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      constraints: const BoxConstraints(maxWidth: 280),
                      decoration: BoxDecoration(
                        color: isMe
                            ? Colors.teal.withOpacity(0.15)
                            : Colors.grey.withOpacity(0.15),
                        borderRadius: BorderRadius.only(
                          topLeft: const Radius.circular(14),
                          topRight: const Radius.circular(14),
                          bottomLeft: Radius.circular(isMe ? 14 : 4),
                          bottomRight: Radius.circular(isMe ? 4 : 14),
                        ),
                      ),
                      child: Text(
                        text,
                        style: TextStyle(
                          color: isMe ? Colors.teal[900] : Colors.grey[900],
                          fontSize: 15,
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
        const Divider(height: 1),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _msgCtrl,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _sendMessage(),
                    decoration: InputDecoration(
                      hintText: "Type a message…",
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      filled: true,
                      fillColor: Colors.grey.withOpacity(0.10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(18),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send_rounded, color: Colors.teal),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
