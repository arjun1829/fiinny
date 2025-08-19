// lib/widgets/activity_feed_widget.dart

import 'package:flutter/material.dart';
import '../services/activity_service.dart';

class ActivityFeedWidget extends StatelessWidget {
  final List<ActivityItem> activities;
  final Function(ActivityItem)? onTap;

  const ActivityFeedWidget({Key? key, required this.activities, this.onTap}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (activities.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(32),
        child: Center(child: Text("No activity yet.")),
      );
    }
    return ListView.separated(
      itemCount: activities.length,
      separatorBuilder: (_, __) => Divider(height: 1),
      itemBuilder: (context, idx) {
        final item = activities[idx];

        IconData icon;
        Color color;
        String typeLabel;
        switch (item.type) {
          case ActivityType.expense:
            icon = Icons.remove_circle_outline_rounded;
            color = Colors.redAccent;
            typeLabel = "Expense";
            break;
          case ActivityType.income:
            icon = Icons.add_circle_outline_rounded;
            color = Colors.green;
            typeLabel = "Income";
            break;
          case ActivityType.settleup:
            icon = Icons.handshake_rounded;
            color = Colors.blueAccent;
            typeLabel = "Settle Up";
            break;
          default:
            icon = Icons.info_outline_rounded;
            color = Colors.grey;
            typeLabel = "Activity";
        }

        return ListTile(
          leading: CircleAvatar(
            backgroundColor: color.withOpacity(0.13),
            child: Icon(icon, color: color),
          ),
          title: Text(
            item.label,
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          subtitle: Text(
            "${typeLabel} • ${item.date.toLocal().toString().substring(0, 16)}",
            style: TextStyle(color: Colors.grey[600]),
          ),
          trailing: Text(
            "${item.type == ActivityType.expense ? '-' : '+'}₹${item.amount.toStringAsFixed(2)}",
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: color,
              fontSize: 16,
            ),
          ),
          onTap: onTap != null ? () => onTap!(item) : null,
        );
      },
    );
  }
}
