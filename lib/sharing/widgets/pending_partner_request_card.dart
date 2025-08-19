// lib/sharing/widgets/pending_partner_request_card.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/services.dart';
import '../utils/sharing_permissions.dart';

class _PendingPartnerRequestCard extends StatefulWidget {
  final QueryDocumentSnapshot request;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  /// Optional: pass the currently signed-in user's phone (E.164).
  /// If provided, Approve/Reject buttons are only shown when this request is incoming for that user.
  final String? viewerPhone;

  const _PendingPartnerRequestCard({
    required this.request,
    required this.onApprove,
    required this.onReject,
    this.viewerPhone, // optional, non-breaking
    Key? key,
  }) : super(key: key);

  @override
  State<_PendingPartnerRequestCard> createState() => _PendingPartnerRequestCardState();
}

class _PendingPartnerRequestCardState extends State<_PendingPartnerRequestCard> {
  late final Map<String, dynamic> _data;
  late final String _requesterId;
  late final Future<DocumentSnapshot<Map<String, dynamic>>> _userFuture;

  @override
  void initState() {
    super.initState();
    _data = (widget.request.data() as Map<String, dynamic>? ?? {});
    _requesterId = _bestRequesterId(_data);
    _userFuture = FirebaseFirestore.instance.collection('users').doc(_requesterId).get();
  }

  String _bestRequesterId(Map<String, dynamic> data) {
    final phone = (data['fromUserPhone'] ?? '').toString().trim();
    if (phone.isNotEmpty) return phone;
    final legacy = (data['fromUserId'] ?? '').toString().trim();
    if (legacy.isNotEmpty) return legacy;
    return widget.request.id;
  }

  String _maskId(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return '';
    if (s.contains('@')) {
      final parts = s.split('@');
      final local = parts.first;
      final domain = parts.length > 1 ? parts[1] : '';
      final keep = local.length >= 2 ? local.substring(0, 2) : local;
      return '$keep***@$domain';
    }
    final digits = s.replaceAll(RegExp(r'\D'), '');
    if (digits.length <= 4) return s;
    final last4 = digits.substring(digits.length - 4);
    return '••• •• •• $last4';
  }

  ImageProvider? _avatarProvider(String? avatar) {
    if (avatar == null || avatar.trim().isEmpty) return null;
    final a = avatar.trim();
    if (a.startsWith('http')) return NetworkImage(a);
    return AssetImage(a);
  }

  BoxDecoration _cardDecoration(BuildContext context) {
    return BoxDecoration(
      borderRadius: BorderRadius.circular(18),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFFFFFFF), Color(0xFFF7FAFF)],
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.05),
          blurRadius: 16,
          offset: const Offset(0, 8),
        ),
      ],
      border: Border.all(color: Colors.grey.shade200),
    );
  }

  @override
  Widget build(BuildContext context) {
    final relation = (_data['relation'] as String?)?.trim();
    final note = (_data['note'] as String?)?.trim();

    // Sanitize permissions using your upgraded utility
    final rawPerms = (_data['permissions'] is Map)
        ? Map<String, dynamic>.from(_data['permissions'] as Map)
        : <String, dynamic>{};
    final perms = SharingPermissions.fromAny(rawPerms);
    final granted = SharingPermissions.grantedKeys(perms);

    // 🔐 Only the intended recipient may approve/reject
    final toPhone = (_data['toUserPhone'] ?? '').toString().trim();
    final fromPhone = (_data['fromUserPhone'] ?? '').toString().trim();
    final viewer = widget.viewerPhone?.trim();
    final isIncomingForViewer = viewer != null && viewer == toPhone && toPhone.isNotEmpty;
    final isOutgoingFromViewer = viewer != null && viewer == fromPhone && fromPhone.isNotEmpty;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      decoration: _cardDecoration(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Stack(
          children: [
            // Subtle gloss
            Positioned(
              top: -30,
              left: -10,
              child: Container(
                width: 150,
                height: 100,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(100),
                  gradient: LinearGradient(
                    colors: [Colors.white.withOpacity(0.55), Colors.white.withOpacity(0.0)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                future: _userFuture,
                builder: (context, snap) {
                  String displayName = _requesterId;
                  String? avatar;
                  if (snap.connectionState == ConnectionState.done && snap.hasData && snap.data!.exists) {
                    final u = snap.data!.data();
                    if (u != null) {
                      final n = (u['name'] ?? '').toString().trim();
                      if (n.isNotEmpty) displayName = n;
                      final a = (u['avatar'] ?? '').toString().trim();
                      if (a.isNotEmpty) avatar = a;
                    }
                  }

                  final leading = CircleAvatar(
                    radius: 24,
                    backgroundColor: Theme.of(context).colorScheme.primary.withOpacity(0.08),
                    foregroundImage: _avatarProvider(avatar),
                    child: _avatarProvider(avatar) == null
                        ? Icon(Icons.person, color: Theme.of(context).colorScheme.primary)
                        : null,
                  );

                  final title = Row(
                    children: [
                      Expanded(
                        child: Text(
                          displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                      ),
                      if ((relation ?? '').isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            relation![0].toUpperCase() + relation.substring(1),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        ),
                      ],
                    ],
                  );

                  final chipWidgets = <Widget>[
                    for (final k in granted)
                      Padding(
                        padding: const EdgeInsets.only(right: 6, bottom: 6),
                        child: Chip(
                          label: Text(SharingPermissions.label(k), style: const TextStyle(fontSize: 11)),
                          backgroundColor: Theme.of(context).colorScheme.primary.withOpacity(0.08),
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                        ),
                      ),
                  ];

                  final subtitle = Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ID (masked) with copy on long-press
                      GestureDetector(
                        onLongPress: () {
                          ScaffoldMessenger.of(context).hideCurrentSnackBar();
                          Clipboard.setData(ClipboardData(text: _requesterId));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Requester ID copied')),
                          );
                        },
                        child: Text(
                          _maskId(_requesterId),
                          style: TextStyle(color: Colors.grey[600], fontSize: 12),
                        ),
                      ),
                      if ((note ?? '').isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            note!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.grey[800]),
                          ),
                        ),
                      if (chipWidgets.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Wrap(children: chipWidgets),
                        ),
                    ],
                  );

                  // Skeleton while loading user doc
                  if (snap.connectionState == ConnectionState.waiting) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        leading,
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(height: 12, width: 140, decoration: _shimmerBox()),
                              const SizedBox(height: 8),
                              Container(height: 10, width: 100, decoration: _shimmerBox()),
                              const SizedBox(height: 8),
                              Container(height: 22, width: 180, decoration: _shimmerBox()),
                            ],
                          ),
                        ),
                        const SizedBox(width: 4),
                        _TrailingArea(
                          showActions: isIncomingForViewer,
                          onApprove: widget.onApprove,
                          onReject: widget.onReject,
                          outgoing: isOutgoingFromViewer,
                        ),
                      ],
                    );
                  }

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      leading,
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            title,
                            const SizedBox(height: 4),
                            subtitle,
                          ],
                        ),
                      ),
                      const SizedBox(width: 4),
                      _TrailingArea(
                        showActions: isIncomingForViewer,
                        onApprove: widget.onApprove,
                        onReject: widget.onReject,
                        outgoing: isOutgoingFromViewer,
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  BoxDecoration _shimmerBox() => BoxDecoration(
    color: Colors.grey.shade200,
    borderRadius: BorderRadius.circular(6),
  );
}

class _TrailingArea extends StatelessWidget {
  final bool showActions;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final bool outgoing;

  const _TrailingArea({
    Key? key,
    required this.showActions,
    required this.onApprove,
    required this.onReject,
    required this.outgoing,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (showActions) {
      return _Actions(onApprove: onApprove, onReject: onReject);
    }
    // Badge text depends on perspective if we know it
    final text = outgoing ? 'Awaiting their approval' : 'Pending';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _Actions extends StatefulWidget {
  final VoidCallback onApprove;
  final VoidCallback onReject;
  const _Actions({required this.onApprove, required this.onReject});

  @override
  State<_Actions> createState() => _ActionsState();
}

class _ActionsState extends State<_Actions> {
  bool _busy = false;

  Future<void> _safeRun(Future<void> Function() run) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await run();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 36,
          child: ElevatedButton.icon(
            onPressed: _busy ? null : () => _safeRun(() async => widget.onApprove()),
            icon: _busy
                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.check_circle, size: 18),
            label: const Text('Approve'),
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(92, 36),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 36,
          child: OutlinedButton.icon(
            onPressed: _busy ? null : () => _safeRun(() async => widget.onReject()),
            icon: const Icon(Icons.cancel, size: 18, color: Colors.red),
            label: const Text('Reject'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(92, 36),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              side: BorderSide(color: Colors.red.withOpacity(0.6)),
              foregroundColor: Colors.red,
            ),
          ),
        ),
      ],
    );
  }
}
