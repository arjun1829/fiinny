import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class GmailBackfillBanner extends StatelessWidget {
  final String userId;
  final bool isLinked;
  final Future<void> Function()? onRetry;

  const GmailBackfillBanner({
    super.key,
    required this.userId,
    required this.isLinked,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    if (!isLinked) {
      return _banner(
        context,
        color: Colors.orange,
        icon: Icons.mail_outline_rounded,
        title: 'Link Gmail to import statements automatically',
        cta: TextButton(
          onPressed: () => Navigator.pushNamed(context, '/settings/gmail', arguments: userId),
          child: const Text('Link Gmail'),
        ),
      );
    }

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance.collection('users').doc(userId).snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() as Map<String, dynamic>? ?? {};
        final status = (data['gmailBackfillStatus'] ?? 'idle').toString();
        final error = (data['gmailBackfillError'] ?? '').toString();

        if (status == 'running') {
          return _banner(
            context,
            color: Colors.blueAccent,
            icon: Icons.sync_rounded,
            title: 'Importing email transactions…',
          );
        }
        if (status == 'error') {
          return _banner(
            context,
            color: Colors.redAccent,
            icon: Icons.error_outline_rounded,
            title: 'Email import failed',
            subtitle: error.isEmpty ? null : error,
            cta: TextButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }

  Widget _banner(
    BuildContext context, {
    required Color color,
    required IconData icon,
    required String title,
    String? subtitle,
    Widget? cta,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(fontWeight: FontWeight.w800, color: color),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(fontSize: 12)),
                ],
              ],
            ),
          ),
          if (cta != null) cta,
        ],
      ),
    );
  }
}
