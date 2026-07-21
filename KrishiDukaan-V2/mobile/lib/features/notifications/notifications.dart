import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_text_styles.dart';
import '../../core/providers/user_provider.dart';

// ─── Model ────────────────────────────────────────────────────────────────────

class AppNotification {
  final String id;
  final String type; // 'order' | 'assignment' | 'network' | ...
  final String title;
  final String body;
  final Map<String, dynamic> data;
  final bool read;
  final DateTime? createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.data,
    required this.read,
    this.createdAt,
  });

  factory AppNotification.fromDoc(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>? ?? {};
    return AppNotification(
      id: doc.id,
      type: d['type'] as String? ?? 'general',
      title: d['title'] as String? ?? '',
      body: d['body'] as String? ?? '',
      data: Map<String, dynamic>.from(d['data'] as Map? ?? {}),
      read: d['read'] as bool? ?? false,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

/// Streams the caller's notifications, newest first. Sorted client-side so no
/// composite index (array-contains + orderBy) is required.
final notificationsProvider =
    StreamProvider.family<List<AppNotification>, String>((ref, phone) {
  return FirebaseFirestore.instance
      .collection('notifications')
      .where('recipientPhones', arrayContains: phone)
      .snapshots()
      .map((snap) {
    final list = snap.docs.map(AppNotification.fromDoc).toList()
      ..sort((a, b) {
        final ad = a.createdAt ?? DateTime(2000);
        final bd = b.createdAt ?? DateTime(2000);
        return bd.compareTo(ad);
      });
    return list;
  });
});

final unreadNotificationCountProvider = Provider.family<int, String>((ref, phone) {
  final list = ref.watch(notificationsProvider(phone)).value ?? const [];
  return list.where((n) => !n.read).length;
});

// ─── Bell icon with unread badge (for top bars) ──────────────────────────────

class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider).value;
    final unread = user == null
        ? 0
        : ref.watch(unreadNotificationCountProvider(user.phone));

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: AppColors.topBarControl,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.topBarControlBorder),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => context.push('/notifications'),
          child: Padding(
            padding: const EdgeInsets.all(9),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.notifications_outlined,
                    color: AppColors.onSurface, size: 19),
                if (unread > 0)
                  Positioned(
                    right: -4,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      constraints:
                          const BoxConstraints(minWidth: 16, minHeight: 16),
                      decoration: const BoxDecoration(
                        color: AppColors.error,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          unread > 9 ? '9+' : '$unread',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 8.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Notifications screen ─────────────────────────────────────────────────────

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  static const _icons = {
    'order': Icons.receipt_long_outlined,
    'order_update': Icons.local_shipping_outlined,
    'assignment': Icons.assignment_turned_in_outlined,
    'network': Icons.handshake_outlined,
  };

  static const _colors = {
    'order': AppColors.info,
    'order_update': AppColors.success,
    'assignment': AppColors.primary,
    'network': AppColors.success,
  };

  Future<void> _markAllRead(List<AppNotification> items) async {
    final unread = items.where((n) => !n.read).toList();
    if (unread.isEmpty) return;
    final batch = FirebaseFirestore.instance.batch();
    for (final n in unread) {
      batch.update(
        FirebaseFirestore.instance.collection('notifications').doc(n.id),
        {'read': true},
      );
    }
    await batch.commit();
  }

  void _open(BuildContext context, AppNotification n) {
    if (!n.read) {
      FirebaseFirestore.instance
          .collection('notifications')
          .doc(n.id)
          .update({'read': true});
    }
    switch (n.type) {
      case 'order':
        context.push('/dashboard/orders');
      case 'order_update':
        final orderId = n.data['orderId'] as String?;
        context.push(orderId != null ? '/orders/$orderId' : '/orders');
      case 'assignment':
        context.push('/dashboard/inventory');
      case 'network':
        context.push('/dashboard');
    }
  }

  String _timeAgo(DateTime? dt) {
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider).value;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Notifications',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          if (user != null)
            Consumer(builder: (context, ref, _) {
              final items =
                  ref.watch(notificationsProvider(user.phone)).value ??
                      const <AppNotification>[];
              final hasUnread = items.any((n) => !n.read);
              return TextButton(
                onPressed: hasUnread ? () => _markAllRead(items) : null,
                child: Text(
                  'Mark all read',
                  style: TextStyle(
                    color: hasUnread ? Colors.white : Colors.white54,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              );
            }),
        ],
      ),
      body: user == null
          ? const Center(child: Text('Log in to see notifications.'))
          : ref.watch(notificationsProvider(user.phone)).when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (_, _) => const Center(
                    child: Text('Could not load notifications.')),
                data: (items) {
                  if (items.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.notifications_none,
                              size: 56,
                              color: AppColors.onSurfaceVariant
                                  .withValues(alpha: 0.5)),
                          const SizedBox(height: 12),
                          Text('No notifications yet',
                              style: AppTextStyles.bodyMedium),
                          const SizedBox(height: 4),
                          Text(
                            'Order updates and network alerts appear here',
                            style: AppTextStyles.caption,
                          ),
                        ],
                      ),
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final n = items[i];
                      final color =
                          _colors[n.type] ?? AppColors.onSurfaceVariant;
                      return Material(
                        color: n.read
                            ? Colors.white
                            : AppColors.primaryContainer
                                .withValues(alpha: 0.25),
                        borderRadius: BorderRadius.circular(12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => _open(context, n),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(9),
                                  decoration: BoxDecoration(
                                    color: color.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(
                                    _icons[n.type] ??
                                        Icons.notifications_outlined,
                                    color: color,
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              n.title,
                                              style: AppTextStyles.bodyMedium
                                                  .copyWith(
                                                fontWeight: n.read
                                                    ? FontWeight.w600
                                                    : FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                          if (!n.read)
                                            Container(
                                              width: 8,
                                              height: 8,
                                              decoration: const BoxDecoration(
                                                color: AppColors.primary,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 3),
                                      Text(n.body,
                                          style: AppTextStyles.bodySmall
                                              .copyWith(
                                                  color: AppColors
                                                      .onSurfaceVariant)),
                                      const SizedBox(height: 4),
                                      Text(_timeAgo(n.createdAt),
                                          style: AppTextStyles.caption),
                                    ],
                                  ),
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
    );
  }
}
