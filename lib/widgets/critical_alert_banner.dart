import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class CriticalAlertBanner extends StatefulWidget {
  final String userId;

  const CriticalAlertBanner({super.key, required this.userId});

  @override
  State<CriticalAlertBanner> createState() => _CriticalAlertBannerState();
}

class _CriticalAlertBannerState extends State<CriticalAlertBanner> {
  // Local state to track which alerts are "resolving" (showing success animation)
  final Set<String> _resolvingIds = {};

  Future<void> _markPaid(String docId, DocumentReference ref) async {
    setState(() {
      _resolvingIds.add(docId);
    });

    // Wait for animation
    await Future.delayed(const Duration(milliseconds: 1800));

    // Update Firestore -> this will remove it from the stream
    if (mounted) {
      ref.update({
        'isRead': true,
        'resolution': 'manual_paid',
        'resolvedAt': FieldValue.serverTimestamp(),
      });
      // Cleanup local state
      setState(() {
        _resolvingIds.remove(docId);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userId)
          .collection('alerts')
          .where('isRead', isEqualTo: false)
          .where('severity', isEqualTo: 'critical')
          .limit(1)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
          return const SizedBox.shrink();
        }

        final doc = snapshot.data!.docs.first;
        final data = doc.data() as Map<String, dynamic>;
        final title = data['title'] ?? 'Critical Alert';
        final body = data['body'] ?? 'Action required.';
        final docId = doc.id;

        final isResolving = _resolvingIds.contains(docId);

        return AnimatedContainer(
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeInOut,
          margin: const EdgeInsets.only(bottom: 12, left: 14, right: 14),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
          decoration: BoxDecoration(
            color: isResolving ? Colors.green.shade600 : Colors.red.shade600,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: (isResolving ? Colors.green : Colors.red)
                    .withValues(alpha: 0.3),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: isResolving
                ? Row(
                    key: const ValueKey('resolved'),
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: const [
                      Icon(Icons.check_circle_rounded,
                          color: Colors.white, size: 28),
                      SizedBox(width: 12),
                      Text(
                        "Marked as Paid! 🎉",
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  )
                : Row(
                    key: const ValueKey('alert'),
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.error_outline_rounded,
                          color: Colors.white, size: 28),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              body,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w500,
                                fontSize: 14,
                                height: 1.3,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                // Main Action: Already Paid
                                InkWell(
                                  onTap: () => _markPaid(docId, doc.reference),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(Icons.check_rounded,
                                            size: 16,
                                            color: Colors.red.shade700),
                                        const SizedBox(width: 6),
                                        Text(
                                          "Paid Already?",
                                          style: TextStyle(
                                            color: Colors.red.shade700,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                // Secondary: Dismiss
                                InkWell(
                                  onTap: () =>
                                      doc.reference.update({'isRead': true}),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 8),
                                    decoration: BoxDecoration(
                                      color:
                                          Colors.white.withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Text(
                                      "Dismiss",
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
          ),
        );
      },
    );
  }
}
