// lib/details/recurring/recurring_list.dart
import 'package:flutter/material.dart';
import '../models/shared_item.dart';
import '../services/recurring_service.dart';
import 'recurring_card.dart';

class RecurringList extends StatelessWidget {
  final String userPhone;
  final String friendId;
  const RecurringList({super.key, required this.userPhone, required this.friendId});

  @override
  Widget build(BuildContext context) {
    final service = RecurringService();
    return StreamBuilder<List<SharedItem>>(
      stream: service.streamByFriend(userPhone, friendId),
      builder: (context, snap) {
        final items = snap.data ?? const <SharedItem>[];
        if (items.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Text("No recurring items yet.\nTap + to add.", textAlign: TextAlign.center),
            ),
          );
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
