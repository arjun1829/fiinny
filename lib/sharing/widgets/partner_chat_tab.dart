import 'dart:io' show File;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

class PartnerChatTab extends StatefulWidget {
  final String partnerUserId; // phone-based id
  final String currentUserId; // phone-based id
  const PartnerChatTab({
    super.key,
    required this.partnerUserId,
    required this.currentUserId,
  });

  @override
  State<PartnerChatTab> createState() => PartnerChatTabState();
}

class PartnerChatTabState extends State<PartnerChatTab> {
  final _msgController = TextEditingController();
  final _scrollController = ScrollController();
  final _imagePicker = ImagePicker();

  final List<Map<String, dynamic>> _attachedTxs = [];

  bool _pickingEmoji = false;
  bool _pickingSticker = false;
  bool _uploading = false;

  String? _mimeFromExtension(String? ext) {
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'txt':
        return 'text/plain';
      case 'csv':
        return 'text/csv';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt':
        return 'application/vnd.ms-powerpoint';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      default:
        return null;
    }
  }

  String get _threadId {
    final a = widget.currentUserId.trim();
    final b = widget.partnerUserId.trim();
    return (a.compareTo(b) <= 0) ? '${a}_$b' : '${b}_$a';
  }

  DocumentReference<Map<String, dynamic>> get _threadRef =>
      FirebaseFirestore.instance.collection('chats').doc(_threadId);

  CollectionReference<Map<String, dynamic>> get _messagesRef =>
      _threadRef.collection('messages');

  @override
  void initState() {
    super.initState();
    _ensureThreadDoc();
  }

  void attachTransactions(List<Map<String, dynamic>> txs) {
    setState(() {
      for (final tx in txs) {
        // avoid duplicates
        final id = tx['date'].toString(); // ideally use a real ID if available
        if (!_attachedTxs.any((e) => e['date'].toString() == id)) {
          _attachedTxs.add(tx);
        }
      }
    });
  }

  Future<void> _ensureThreadDoc() async {
    final doc = await _threadRef.get();
    if (!doc.exists) {
      await _threadRef.set({
        'participants': [widget.currentUserId, widget.partnerUserId],
        'createdAt': FieldValue.serverTimestamp(),
        'lastMessage': null,
        'lastFrom': null,
        'lastAt': FieldValue.serverTimestamp(),
        'lastType': null,
      });
    } else {
      await _threadRef.set({
        'participants': FieldValue.arrayUnion(
          [widget.currentUserId, widget.partnerUserId],
        ),
      }, SetOptions(merge: true));
    }
  }

  Future<void> _sendMessage({
    required String text,
    String type = 'text',
    Map<String, dynamic> extra = const {},
  }) async {
    final msg = text.trim();
    if (type == 'text' && msg.isEmpty) {
      return;
    }

    final now = FieldValue.serverTimestamp();

    await _messagesRef.add({
      'from': widget.currentUserId,
      'to': widget.partnerUserId,
      'message': msg,
      'timestamp': now,
      'type': type, // 'text' | 'sticker' | 'image' | 'file' | 'discussion'
      'edited': false,
      ...extra,
    });

    final lastPreview = switch (type) {
      'image' => '[photo]',
      'file' => extra['fileName'] ?? '[file]',
      'sticker' => msg,
      'discussion' => 'Discussing transactions',
      _ => msg,
    };

    await _threadRef.set({
      'lastMessage': lastPreview,
      'lastFrom': widget.currentUserId,
      'lastAt': now,
      'lastType': type,
    }, SetOptions(merge: true));

    if (type == 'text' || type == 'discussion') {
      _msgController.clear();
      setState(() {
        _attachedTxs.clear();
      });
    }

    await Future.delayed(const Duration(milliseconds: 50));
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  // ---------- Attachments ----------
  Future<void> _pickFromCamera() async {
    try {
      final shot = await _imagePicker.pickImage(
          source: ImageSource.camera, imageQuality: 85);
      if (shot == null) {
        return;
      }
      await _uploadImageXFile(shot);
    } catch (e) {
      _toast('Camera unavailable');
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final img = await _imagePicker.pickImage(
          source: ImageSource.gallery, imageQuality: 85);
      if (img == null) {
        return;
      }
      await _uploadImageXFile(img);
    } catch (e) {
      _toast('Gallery unavailable');
    }
  }

  Future<void> _pickAnyFile() async {
    try {
      final res = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: kIsWeb, // bytes on web
        type: FileType.any,
      );
      if (res == null || res.files.isEmpty) {
        return;
      }
      final file = res.files.first;
      final name = file.name;
      final ext = (file.extension ?? '').toLowerCase();
      final mime = _mimeFromExtension(ext) ?? _guessMimeByName(name);
      if (kIsWeb) {
        final bytes = file.bytes;
        if (bytes == null) {
          return;
        }
        await _uploadBytes(bytes, name, mime,
            typeHint: _isImageMime(mime) ? 'image' : 'file');
      } else {
        final path = file.path;
        if (path == null) {
          return;
        }
        await _uploadFilePath(path, name, mime,
            typeHint: _isImageMime(mime) ? 'image' : 'file');
      }
    } catch (e) {
      _toast('File picker error');
    }
  }

  String _guessMimeByName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.gif')) {
      return 'image/gif';
    }
    if (lower.endsWith('.webp')) {
      return 'image/webp';
    }
    if (lower.endsWith('.pdf')) {
      return 'application/pdf';
    }
    return 'application/octet-stream';
  }

  bool _isImageMime(String? mime) => (mime ?? '').startsWith('image/');

  Future<void> _uploadImageXFile(XFile xf) async {
    final name = xf.name;
    final mime = _guessMimeByName(name);
    if (kIsWeb) {
      final bytes = await xf.readAsBytes();
      await _uploadBytes(bytes, name, mime, typeHint: 'image');
    } else {
      await _uploadFilePath(xf.path, name, mime, typeHint: 'image');
    }
  }

  Future<void> _uploadBytes(
    Uint8List bytes,
    String name,
    String mime, {
    required String typeHint,
  }) async {
    setState(() => _uploading = true);
    try {
      final ref = FirebaseStorage.instance
          .ref()
          .child('chat_uploads')
          .child(_threadId)
          .child('${DateTime.now().millisecondsSinceEpoch}_$name');

      final metadata = SettableMetadata(contentType: mime);
      final task = await ref.putData(bytes, metadata);
      final url = await task.ref.getDownloadURL();

      await _sendMessage(
        text: typeHint == 'image' ? '[photo]' : name,
        type: typeHint,
        extra: {
          'fileUrl': url,
          'fileName': name,
          'mime': mime,
          'size': bytes.length,
        },
      );
    } catch (e) {
      _toast('Upload failed');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _uploadFilePath(
    String path,
    String name,
    String mime, {
    required String typeHint,
  }) async {
    setState(() => _uploading = true);
    try {
      final ref = FirebaseStorage.instance
          .ref()
          .child('chat_uploads')
          .child(_threadId)
          .child('${DateTime.now().millisecondsSinceEpoch}_$name');

      final metadata = SettableMetadata(contentType: mime);
      final task = await ref.putFile(File(path), metadata);
      final url = await task.ref.getDownloadURL();

      final fileSize = await File(path).length();

      await _sendMessage(
        text: typeHint == 'image' ? '[photo]' : name,
        type: typeHint,
        extra: {
          'fileUrl': url,
          'fileName': name,
          'mime': mime,
          'size': fileSize,
        },
      );
    } catch (e) {
      _toast('Upload failed');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  // ---------- Message actions ----------
  Future<void> _editMessage(DocumentSnapshot<Map<String, dynamic>> doc) async {
    final data = doc.data();
    if (data == null) {
      return;
    }
    if (data['from'] != widget.currentUserId) {
      return;
    }
    if ((data['type'] ?? 'text') != 'text') {
      return;
    }

    final controller =
        TextEditingController(text: (data['message'] ?? '').toString());
    final newText = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit message'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: const Text('Save')),
        ],
      ),
    );

    if (newText == null) {
      return;
    }
    if (newText.isEmpty) {
      _toast('Message cannot be empty');
      return;
    }
    await doc.reference.update({
      'message': newText,
      'edited': true,
      'editedAt': FieldValue.serverTimestamp(),
    });

    await _threadRef.set({
      'lastMessage': newText,
      'lastFrom': widget.currentUserId,
      'lastAt': FieldValue.serverTimestamp(),
      'lastType': 'text',
    }, SetOptions(merge: true));
  }

  Future<void> _deleteMessage(
      DocumentSnapshot<Map<String, dynamic>> doc) async {
    final data = doc.data();
    if (data == null) {
      return;
    }
    if (data['from'] != widget.currentUserId) {
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete message?'),
        content:
            const Text('This will delete the message for both participants.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirm != true) {
      return;
    }

    final fileUrl = (data['fileUrl'] ?? '').toString();
    if (fileUrl.isNotEmpty) {
      try {
        await FirebaseStorage.instance.refFromURL(fileUrl).delete();
      } catch (_) {}
    }

    await doc.reference.delete();
  }

  // ---------- Pickers UI ----------
  final List<String> _emojiBank = const [
    '😀',
    '😁',
    '😂',
    '🤣',
    '😊',
    '😍',
    '😘',
    '😎',
    '🤗',
    '🤩',
    '👍',
    '👏',
    '🙏',
    '🙌',
    '🔥',
    '✨',
    '🎉',
    '❤️',
    '💙',
    '💚',
    '💛',
    '💜',
    '🧡',
    '💯',
    '✅',
    '❌',
    '🤝',
    '🙋',
    '👊',
    '🤞',
    '🤔',
    '😴',
    '😭',
    '😤',
    '😇',
    '😜',
    '🤪',
    '🥳',
    '🤯',
    '🥹',
  ];

  final List<String> _stickerBank = const [
    '🎉',
    '🎂',
    '🥳',
    '💐',
    '🌟',
    '💪',
    '🫶',
    '🤍',
    '🧠',
    '🚀',
    '🍕',
    '☕',
    '🍫',
    '🍰',
    '🏆',
    '🕺',
    '💃',
    '🎶',
    '🧩',
    '🛡️',
    '🐱',
    '🐶',
    '🐼',
    '🐨',
    '🐧',
    '🦄',
    '🐥',
    '🐵',
    '🐯',
    '🐸',
  ];

  Widget _buildEmojiPicker() {
    return SizedBox(
      height: 220,
      child: GridView.builder(
        padding: const EdgeInsets.all(10),
        itemCount: _emojiBank.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 8,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
        ),
        itemBuilder: (_, i) {
          final e = _emojiBank[i];
          return InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () {
              _msgController.text += e;
              _msgController.selection = TextSelection.fromPosition(
                TextPosition(offset: _msgController.text.length),
              );
              setState(() => _pickingEmoji = false);
            },
            child: Center(child: Text(e, style: const TextStyle(fontSize: 22))),
          );
        },
      ),
    );
  }

  Widget _buildStickerPicker() {
    return SizedBox(
      height: 220,
      child: GridView.builder(
        padding: const EdgeInsets.all(10),
        itemCount: _stickerBank.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 6,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
        ),
        itemBuilder: (_, i) {
          final s = _stickerBank[i];
          return InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              _sendMessage(text: s, type: 'sticker');
              setState(() => _pickingSticker = false);
            },
            child: Container(
              decoration: BoxDecoration(
                color: Colors.teal.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(16),
              ),
              alignment: Alignment.center,
              child: Text(s, style: const TextStyle(fontSize: 34)),
            ),
          );
        },
      ),
    );
  }

  // ---------- UI helpers ----------
  void _toast(String msg) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _showAttachmentSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_rounded),
              title: const Text('Camera'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromCamera();
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded),
              title: const Text('Photo from gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromGallery();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file_rounded),
              title: const Text('File / PDF'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAnyFile();
              },
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.emoji_emotions),
              title: const Text('Sticker pack'),
              onTap: () {
                Navigator.pop(ctx);
                setState(() {
                  _pickingEmoji = false;
                  _pickingSticker = true;
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  void _onBubbleLongPress(
      DocumentSnapshot<Map<String, dynamic>> d, bool isMe, String type) async {
    final actions = <Widget>[];

    if (isMe && type == 'text') {
      actions.add(
        ListTile(
          leading: const Icon(Icons.edit),
          title: const Text('Edit'),
          onTap: () {
            Navigator.pop(context);
            _editMessage(d);
          },
        ),
      );
    }
    if (isMe) {
      actions.add(
        ListTile(
          leading: const Icon(Icons.delete, color: Colors.red),
          title: const Text('Delete'),
          onTap: () {
            Navigator.pop(context);
            _deleteMessage(d);
          },
        ),
      );
    }
    actions.add(
      ListTile(
        leading: const Icon(Icons.copy_all),
        title: const Text('Copy'),
        onTap: () {
          Navigator.pop(context);
          final text = (d.data()?['message'] ?? '').toString();
          Clipboard.setData(ClipboardData(text: text));
          _toast('Copied');
        },
      ),
    );

    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => SafeArea(child: Wrap(children: actions)),
    );
  }

  // ---------- small icon button helper (compact controls) ----------

  @override
  void dispose() {
    _msgController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 1. USE THESE COLORS
    final Color kTealColor = const Color(0xFF00897B);
    final Color kBgColor = const Color(0xFFF1F5F9);

    final pickerVisible = _pickingEmoji || _pickingSticker;

    return Scaffold(
      backgroundColor: kBgColor,
      body: Column(
        children: [
          // MESSAGES LIST
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: _messagesRef
                  .orderBy('timestamp', descending: true)
                  .limit(200)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final docs = snapshot.data?.docs ?? [];
                if (docs.isEmpty) {
                  return Center(
                    child: Text("Start the discussion",
                        style: GoogleFonts.inter(
                            fontSize: 16, color: Colors.grey.shade400)),
                  );
                }

                return ListView.builder(
                  controller: _scrollController,
                  reverse: true,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                  itemCount: docs.length,
                  itemBuilder: (context, i) {
                    final d = docs[i];
                    final data = d.data();
                    final isMe = data['from'] == widget.currentUserId;
                    final msg = (data['message'] ?? '') as String;
                    final type = (data['type'] ?? 'text') as String;
                    final ts = (data['timestamp'] as Timestamp?);
                    final timeStr = ts != null
                        ? TimeOfDay.fromDateTime(ts.toDate()).format(context)
                        : '';
                    final fileUrl = data['fileUrl'] as String?;

                    // LOGIC: Show sender name for others
                    final senderName = !isMe ? "Member" : null;

                    return ChatBubble(
                      text: msg,
                      time: timeStr,
                      isMe: isMe,
                      senderName: senderName,
                      color: kTealColor,
                      type: type,
                      imageUrl: type == 'image' ? fileUrl : null,
                      onLongPress: () => _onBubbleLongPress(d, isMe, type),
                    );
                  },
                );
              },
            ),
          ),

          if (_uploading)
            LinearProgressIndicator(
                minHeight: 2,
                backgroundColor: Colors.transparent,
                color: kTealColor),

          // CONTEXT AREA (Expenses) - KEEPING YOUR LOGIC
          if (_attachedTxs.isNotEmpty)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 4)
                ],
              ),
              child: Row(
                children: [
                  Icon(Icons.receipt, color: kTealColor),
                  const SizedBox(width: 8),
                  Text("${_attachedTxs.length} expenses attached"),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => setState(() => _attachedTxs.clear()),
                  )
                ],
              ),
            ),

          if (pickerVisible) const Divider(height: 1),
          AnimatedCrossFade(
            crossFadeState: pickerVisible
                ? CrossFadeState.showFirst
                : CrossFadeState.showSecond,
            duration: const Duration(milliseconds: 180),
            firstChild:
                _pickingEmoji ? _buildEmojiPicker() : _buildStickerPicker(),
            secondChild: const SizedBox.shrink(),
          ),

          // INPUT BAR (PILL SHAPE - MANDATORY CODE)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(24), topRight: Radius.circular(24)),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 10,
                    offset: const Offset(0, -2))
              ],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center, // CRITICAL FIX
                children: [
                  InkWell(
                      onTap: _showAttachmentSheet,
                      child: Icon(Icons.add_circle_outline,
                          color: Colors.grey[600], size: 28)),
                  const SizedBox(width: 8),
                  InkWell(
                    onTap: () => setState(() {
                      _pickingSticker = false;
                      _pickingEmoji = !_pickingEmoji;
                    }),
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                          color: Colors.grey[200], shape: BoxShape.circle),
                      child: Icon(
                          (_pickingEmoji)
                              ? Icons.keyboard
                              : Icons.sentiment_satisfied_alt,
                          color: Colors.grey[600],
                          size: 20),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Container(
                      constraints:
                          const BoxConstraints(minHeight: 45, maxHeight: 100),
                      decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: Colors.grey[300]!)),
                      child: TextField(
                        controller: _msgController,
                        maxLines: null,
                        style: GoogleFonts.inter(fontSize: 15),
                        decoration: const InputDecoration(
                          hintText: "Type a message...",
                          border: InputBorder.none,
                          isDense: true,
                          hintStyle:
                              TextStyle(color: Colors.grey, fontSize: 14),
                          contentPadding: EdgeInsets.symmetric(
                              horizontal: 16, vertical: 10), // ALIGNMENT FIX
                        ),
                        onTap: () => setState(() {
                          _pickingEmoji = false;
                          _pickingSticker = false;
                        }),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  InkWell(
                    onTap: () {
                      if (_attachedTxs.isNotEmpty) {
                        _sendMessage(
                            text: _msgController.text,
                            type: 'discussion',
                            extra: {'transactions': _attachedTxs});
                      } else {
                        _sendMessage(text: _msgController.text, type: 'text');
                      }
                    },
                    child: Container(
                      width: 45,
                      height: 45,
                      decoration: const BoxDecoration(
                          color: Color(0xFF00897B), shape: BoxShape.circle),
                      child:
                          const Icon(Icons.send, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// 3. REPLACE/ADD THE CHAT BUBBLE CLASS AT THE BOTTOM:
class ChatBubble extends StatelessWidget {
  final String text;
  final String time;
  final bool isMe;
  final String? senderName;
  final Color color;
  final String type;
  final String? imageUrl;
  final VoidCallback onLongPress;

  const ChatBubble({
    super.key,
    required this.text,
    required this.time,
    required this.isMe,
    this.senderName,
    required this.color,
    this.type = 'text',
    this.imageUrl,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    if (type == 'sticker') {
      return GestureDetector(
        onLongPress: onLongPress,
        child: Align(
          alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(text, style: const TextStyle(fontSize: 40)),
          ),
        ),
      );
    }

    return GestureDetector(
      onLongPress: onLongPress,
      child: Column(
        crossAxisAlignment:
            isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!isMe && senderName != null)
            Padding(
              padding: const EdgeInsets.only(left: 12, bottom: 4),
              child: Text(senderName!,
                  style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            ),
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.75),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isMe ? color : Colors.white,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: isMe ? const Radius.circular(16) : Radius.zero,
                bottomRight: isMe ? Radius.zero : const Radius.circular(16),
              ),
              boxShadow: [
                if (!isMe)
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 5,
                      offset: const Offset(0, 2)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (type == 'image' && imageUrl != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8.0),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(imageUrl!, fit: BoxFit.cover),
                    ),
                  )
                else if (type == 'file')
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.description,
                        color: isMe ? Colors.white : Colors.grey),
                    const SizedBox(width: 8),
                    Flexible(
                        child: Text(text,
                            style: GoogleFonts.inter(
                                color: isMe ? Colors.white : Colors.black87,
                                decoration: TextDecoration.underline))),
                  ])
                else
                  Text(text,
                      style: GoogleFonts.inter(
                          color: isMe ? Colors.white : Colors.black87,
                          fontSize: 15,
                          height: 1.3)),
                const SizedBox(height: 4),
                Text(time,
                    style: TextStyle(
                        color: isMe
                            ? Colors.white.withValues(alpha: 0.7)
                            : Colors.grey[500],
                        fontSize: 10)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
