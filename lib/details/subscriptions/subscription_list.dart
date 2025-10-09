// lib/details/subscriptions/subscription_list.dart
import 'package:flutter/material.dart';
import '../models/shared_item.dart';
import '../services/recurring_service.dart';
import '../recurring/recurring_card.dart';

class SubscriptionList extends StatelessWidget {
  final String userPhone;
  final String friendId;
  const SubscriptionList({super.key, required this.userPhone, required this.friendId});

  @override
  Widget build(BuildContext context) {
    final service = RecurringService();
    return StreamBuilder<List<SharedItem>>(
      stream: service.streamByFriend(userPhone, friendId),
      builder: (context, snap) {
        final items = (snap.data ?? []).where((e) => e.type == 'subscription').toList();
        if (items.isEmpty) {
          return const Center(child: Text("No subscriptions yet."));
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          itemCount: items.length,
          itemBuilder: (_, i) => RecurringCard(item: items[i]),
        );
      },
    );
  }
}
