import 'dart:io' show File;
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lifemap/core/ads/ads_banner_card.dart';

class PartnerChatTab extends StatefulWidget {
  final String partnerUserId; // phone-based id
  final String currentUserId; // phone-based id
  const PartnerChatTab({
    Key? key,
    required this.partnerUserId,
    required this.currentUserId,
  }) : super(key: key);

  @override
  State<PartnerChatTab> createState() => PartnerChatTabState();
}

class PartnerChatTabState extends State<PartnerChatTab> {
  final _msgController = TextEditingController();
  final _scrollController = ScrollController();
  final _imagePicker = ImagePicker();

  List<Map<String, dynamic>> _attachedTxs = [];

  bool _pickingEmoji = false;
  bool _pickingSticker = false;
  bool _uploading = false;
  Widget _miniIcon({
    required IconData icon,
    String? tooltip,
    VoidCallback? onPressed,
  }) {
    return IconButton(
      icon: Icon(icon, size: 18),
      tooltip: tooltip,
      onPressed: onPressed,
      padding: EdgeInsets.zero,
      visualDensity: const VisualDensity(horizontal: -4, vertical: -4),
      constraints: const BoxConstraints.tightFor(width: 36, height: 36),
      splashRadius: 18,
    );
  }

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

  void _removeAttachment(int index) {
    setState(() {
      _attachedTxs.removeAt(index);
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
    if (type == 'text' && msg.isEmpty) return;

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
      if (shot == null) return;
      await _uploadImageXFile(shot);
    } catch (e) {
      _toast('Camera unavailable');
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final img = await _imagePicker.pickImage(
          source: ImageSource.gallery, imageQuality: 85);
      if (img == null) return;
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
      if (res == null || res.files.isEmpty) return;
      final file = res.files.first;
      final name = file.name;
      final ext = (file.extension ?? '').toLowerCase();
      final mime = _mimeFromExtension(ext) ?? _guessMimeByName(name);
      if (kIsWeb) {
        final bytes = file.bytes;
        if (bytes == null) return;
        await _uploadBytes(bytes, name, mime,
            typeHint: _isImageMime(mime) ? 'image' : 'file');
      } else {
        final path = file.path;
        if (path == null) return;
        await _uploadFilePath(path, name, mime,
            typeHint: _isImageMime(mime) ? 'image' : 'file');
      }
    } catch (e) {
      _toast('File picker error');
    }
  }

  String _guessMimeByName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
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
    if (data == null) return;
    if (data['from'] != widget.currentUserId) return;
    if ((data['type'] ?? 'text') != 'text') return;

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

    if (newText == null) return;
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
    if (data == null) return;
    if (data['from'] != widget.currentUserId) return;

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
    if (confirm != true) return;

    final fileUrl = (data['fileUrl'] ?? '').toString();
    if (fileUrl.isNotEmpty) {
      try {
        await FirebaseStorage.instance.refFromURL(fileUrl).delete();
      } catch (_) {}
    }

    await doc.reference.delete();
  }

  Future<void> _clearChat() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear chat?'),
        content:
            const Text('This will delete all messages for both participants.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Clear')),
        ],
      ),
    );
    if (ok != true) return;

    try {
      const batchSize = 50;
      while (true) {
        final snap =
            await _messagesRef.orderBy('timestamp').limit(batchSize).get();
        if (snap.docs.isEmpty) break;
        final batch = FirebaseFirestore.instance.batch();
        for (final d in snap.docs) {
          final fu = (d.data()['fileUrl'] ?? '').toString();
          if (fu.isNotEmpty) {
            try {
              await FirebaseStorage.instance.refFromURL(fu).delete();
            } catch (_) {}
          }
          batch.delete(d.reference);
        }
        await batch.commit();
        if (snap.docs.length < batchSize) break;
      }
      _toast('Chat cleared');
    } catch (e) {
      _toast('Failed to clear chat');
    }
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
                color: Colors.teal.withOpacity(0.08),
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
    if (!mounted) return;
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

  void _onOpenAttachment(Map<String, dynamic> data) {
    final url = (data['fileUrl'] ?? '').toString();
    final mime = (data['mime'] ?? '').toString();
    final name = (data['fileName'] ?? '').toString();

    if (url.isEmpty) return;

    if (mime.startsWith('image/')) {
      showDialog(
        context: context,
        builder: (_) => Dialog(
          insetPadding: const EdgeInsets.all(16),
          child: InteractiveViewer(
            child: Image.network(url, fit: BoxFit.contain),
          ),
        ),
      );
    } else {
      Clipboard.setData(ClipboardData(text: url));
      _toast('Link copied: $name');
    }
  }

  // ---------- small icon button helper (compact controls) ----------
  Widget _smallIconButton({
    required IconData icon,
    String? tooltip,
    required VoidCallback onPressed,
    Color color = Colors.teal,
  }) {
    return IconButton(
      tooltip: tooltip,
      icon: Icon(icon, color: color),
      iconSize: 20,
      padding: const EdgeInsets.all(4),
      constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      onPressed: onPressed,
    );
  }

  @override
  void dispose() {
    _msgController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pickerVisible = _pickingEmoji || _pickingSticker;

    return Column(
      children: [
        // Messages
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFFF2F4F7), // slightly cooler grey
              // Optional: Add a subtle pattern if you had an asset
              // image: DecorationImage(image: AssetImage('assets/doodle_bg.png'), opacity: 0.05, fit: BoxFit.cover),
            ),
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
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.chat_bubble_outline_rounded,
                            size: 48, color: Colors.grey.shade300),
                        const SizedBox(height: 16),
                        Text(
                          "Start the conversation",
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Colors.grey.shade400,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                const chatAdEvery = 20;
                final blockSize = chatAdEvery + 1;
                final adCount =
                    chatAdEvery > 0 ? docs.length ~/ chatAdEvery : 0;
                final totalItems = docs.length + adCount;

                return ListView.builder(
                  controller: _scrollController,
                  reverse: true,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                  itemCount: totalItems,
                  itemBuilder: (context, i) {
                    final isAdSlot = chatAdEvery > 0 &&
                        blockSize > 0 &&
                        (i + 1) % blockSize == 0;
                    if (isAdSlot) {
                      final slot = (i + 1) ~/ blockSize;
                      return Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        child: AdsBannerCard(
                          placement: 'friend_chat_midroll_$slot',
                          inline: true,
                          inlineMaxHeight: 100,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 10),
                          minHeight: 72,
                        ),
                      );
                    }

                    final adsBefore =
                        chatAdEvery > 0 ? (i + 1) ~/ blockSize : 0;
                    final messageIndex = i - adsBefore;
                    final d = docs[messageIndex];
                    final data = d.data();
                    final isMe = data['from'] == widget.currentUserId;
                    final msg = (data['message'] ?? '') as String;
                    final type = (data['type'] ?? 'text') as String;
                    final ts = (data['timestamp'] as Timestamp?);
                    final timeStr = ts != null
                        ? TimeOfDay.fromDateTime(ts.toDate()).format(context)
                        : '';
                    final edited = data['edited'] == true;

                    // Modern Bubble Decoration (Premium)
                    final bubbleDecoration = isMe
                        ? BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                Colors.teal.shade600,
                                Colors.teal.shade400
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(20),
                              topRight: Radius.circular(4),
                              bottomLeft: Radius.circular(20),
                              bottomRight: Radius.circular(20),
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.teal.shade600.withOpacity(0.3),
                                blurRadius: 12,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          )
                        : BoxDecoration(
                            color: Colors.white,
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(4),
                              topRight: Radius.circular(20),
                              bottomLeft: Radius.circular(20),
                              bottomRight: Radius.circular(20),
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.04),
                                blurRadius: 8,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          );

                    Widget content;
                    if (type == 'sticker') {
                      content = Text(msg, style: const TextStyle(fontSize: 34));
                    } else if (type == 'image') {
                      content = GestureDetector(
                        onTap: () => _onOpenAttachment(data),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.network(
                            (data['fileUrl'] ?? '').toString(),
                            width: 210,
                            height: 210,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const SizedBox(
                              width: 210,
                              height: 120,
                              child: Center(child: Icon(Icons.broken_image)),
                            ),
                          ),
                        ),
                      );
                    } else if (type == 'file') {
                      content = InkWell(
                        onTap: () => _onOpenAttachment(data),
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isMe
                                ? Colors.white.withOpacity(0.2)
                                : Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.description_rounded,
                                  size: 20,
                                  color: isMe
                                      ? Colors.white
                                      : Colors.grey.shade700),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  (data['fileName'] ?? 'file').toString(),
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 1,
                                  style: GoogleFonts.inter(
                                    color: isMe ? Colors.white : Colors.black87,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    } else if (type == 'discussion') {
                      // ... (Use existing logic or enhance slightly)
                      final txs = List.from(data['transactions'] ?? []);
                      content = Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (txs.isNotEmpty)
                            ...txs
                                .map((tx) => _buildEmbeddedTxCard(tx))
                                .toList(),
                          if (msg.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              msg,
                              style: GoogleFonts.inter(
                                color: isMe ? Colors.white : Colors.black87,
                                fontSize: 15,
                                height: 1.4,
                              ),
                            ),
                          ]
                        ],
                      );
                    } else {
                      content = Text(
                        msg,
                        style: GoogleFonts.inter(
                          color: isMe ? Colors.white : const Color(0xFF1F2937),
                          fontSize: 15,
                          height: 1.4,
                          fontWeight: FontWeight.w400,
                        ),
                      );
                    }

                    return Align(
                      alignment:
                          isMe ? Alignment.centerRight : Alignment.centerLeft,
                      child: GestureDetector(
                        onLongPress: () => _onBubbleLongPress(d, isMe, type),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: EdgeInsets.symmetric(
                            horizontal:
                                (type == 'sticker' || type == 'image') ? 8 : 16,
                            vertical:
                                (type == 'sticker' || type == 'image') ? 8 : 12,
                          ),
                          constraints: BoxConstraints(
                              maxWidth:
                                  MediaQuery.of(context).size.width * 0.75),
                          decoration: bubbleDecoration,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment
                                .end, // Always align time to end within bubble
                            children: [
                              content,
                              const SizedBox(height: 4),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    timeStr,
                                    style: GoogleFonts.inter(
                                      fontSize: 10,
                                      color: isMe
                                          ? Colors.white.withOpacity(0.7)
                                          : Colors.grey.shade500,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  if (edited) ...[
                                    const SizedBox(width: 4),
                                    Icon(Icons.edit_rounded,
                                        size: 10,
                                        color: isMe
                                            ? Colors.white.withOpacity(0.7)
                                            : Colors.grey.shade500),
                                  ]
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ),

        if (_uploading)
          const LinearProgressIndicator(
              minHeight: 2,
              backgroundColor: Colors.transparent,
              color: Colors.teal),

        if (pickerVisible) const Divider(height: 1),

        // Emoji / Sticker picker area
        AnimatedCrossFade(
          crossFadeState: pickerVisible
              ? CrossFadeState.showFirst
              : CrossFadeState.showSecond,
          duration: const Duration(milliseconds: 180),
          firstChild:
              _pickingEmoji ? _buildEmojiPicker() : _buildStickerPicker(),
          secondChild: const SizedBox.shrink(),
        ),

        // Input area
        _buildContextArea(),
        _buildContextArea(),
        Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24), // Floating margins
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
            borderRadius: BorderRadius.circular(32), // Capsule shape
          ),
          child: SafeArea(
            top: false,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                _smallIconButton(
                  icon: Icons.add_circle_outline_rounded,
                  tooltip: "Attach",
                  color: Colors.grey.shade600,
                  onPressed: _showAttachmentSheet,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: Colors.transparent),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Row(
                      children: [
                        IconButton(
                          icon: Icon(
                            (_pickingEmoji)
                                ? Icons.keyboard_rounded
                                : Icons.emoji_emotions_outlined,
                            color: Colors.grey.shade500,
                          ),
                          iconSize: 22,
                          padding: EdgeInsets.zero,
                          constraints:
                              const BoxConstraints(minWidth: 40, minHeight: 40),
                          onPressed: () {
                            setState(() {
                              _pickingSticker = false;
                              _pickingEmoji = !_pickingEmoji;
                            });
                          },
                        ),
                        Expanded(
                          child: TextField(
                            controller: _msgController,
                            minLines: 1,
                            maxLines: 5,
                            textCapitalization: TextCapitalization.sentences,
                            style: GoogleFonts.inter(
                                fontSize: 15, color: Colors.black87),
                            decoration: InputDecoration(
                              hintText: "Type a message...",
                              hintStyle: GoogleFonts.inter(
                                  color: Colors.grey.shade400),
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                  vertical: 12, horizontal: 0),
                            ),
                            onTap: () {
                              setState(() {
                                _pickingEmoji = false;
                                _pickingSticker = false;
                              });
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.teal.shade600,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.teal.withOpacity(0.3),
                        blurRadius: 8,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: IconButton(
                    icon: const Icon(Icons.send_rounded,
                        color: Colors.white, size: 20),
                    tooltip: "Send",
                    constraints:
                        const BoxConstraints(minWidth: 44, minHeight: 44),
                    onPressed: () {
                      if (_attachedTxs.isNotEmpty) {
                        _sendMessage(
                          text: _msgController.text,
                          type: 'discussion',
                          extra: {'transactions': _attachedTxs},
                        );
                      } else {
                        _sendMessage(text: _msgController.text, type: 'text');
                      }
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildContextArea() {
    if (_attachedTxs.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: Colors.grey[50],
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: _attachedTxs.asMap().entries.map((entry) {
            final i = entry.key;
            final tx = entry.value;
            final amount = (tx['amount'] as num? ?? 0).toDouble();
            final isIncome = (tx['type'] == 'income');
            final category = tx['category'] ?? 'General';

            return Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey[300]!),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 2,
                    offset: Offset(0, 1),
                  )
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isIncome ? Icons.arrow_downward : Icons.arrow_upward,
                    size: 14,
                    color: isIncome ? Colors.green : Colors.red,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    "₹${amount.toStringAsFixed(0)}",
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                  const SizedBox(width: 4),
                  Text(category,
                      style: TextStyle(fontSize: 12, color: Colors.grey[700])),
                  const SizedBox(width: 6),
                  InkWell(
                    onTap: () => _removeAttachment(i),
                    child: Icon(Icons.close_rounded,
                        size: 16, color: Colors.grey[500]),
                  )
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildEmbeddedTxCard(Map<String, dynamic> tx) {
    final amount = (tx['amount'] as num? ?? 0).toDouble();
    final isIncome = (tx['type'] == 'income');
    final category = tx['category'] ?? 'General';
    final note = tx['note'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: isIncome
                      ? Colors.green.withOpacity(0.1)
                      : Colors.red.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isIncome ? Icons.arrow_downward : Icons.arrow_upward,
                  size: 16,
                  color: isIncome ? Colors.green : Colors.red,
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "₹${amount.toStringAsFixed(0)}",
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  Text(
                    category,
                    style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                  ),
                ],
              ),
            ],
          ),
          if (note.toString().isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(note,
                style:
                    const TextStyle(fontSize: 12, fontStyle: FontStyle.italic)),
          ]
        ],
      ),
    );
  }
}
