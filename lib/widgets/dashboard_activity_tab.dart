import 'package:flutter/material.dart';
import '../models/activity_event.dart';
import 'package:intl/intl.dart';

class DashboardActivityTab extends StatelessWidget {
  final List<ActivityEvent> events;
  const DashboardActivityTab({Key? key, required this.events}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return Center(
        child: Text(
          "No activity yet!\nStart adding transactions or goals.",
          style: TextStyle(color: Colors.teal[700], fontSize: 16, fontWeight: FontWeight.w500),
          textAlign: TextAlign.center,
        ),
      );
    }
    return ListView.separated(
      physics: BouncingScrollPhysics(),
      padding: const EdgeInsets.only(top: 24, bottom: 40, left: 8, right: 8),
      itemCount: events.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final e = events[i];
        return Card(
          elevation: 2,
          margin: const EdgeInsets.symmetric(horizontal: 6),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: Colors.teal.withOpacity(0.09),
              child: Icon(e.icon, color: Colors.teal[700]),
            ),
            title: Text(e.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            subtitle: e.subtitle != null
                ? Text(e.subtitle!, style: TextStyle(color: Colors.grey[700]))
                : null,
            trailing: Text(
              DateFormat('dd MMM, hh:mm a').format(e.date),
              style: TextStyle(fontSize: 12, color: Colors.teal[900]),
            ),
            onTap: () {
              showModalBottomSheet(
                context: context,
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                builder: (_) => _ActivityDetailSheet(event: e),
              );
            },
          ),
        );
      },
    );
  }
}

class _ActivityDetailSheet extends StatelessWidget {
  final ActivityEvent event;
  const _ActivityDetailSheet({required this.event});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(event.icon, size: 48, color: Colors.teal),
          const SizedBox(height: 12),
          Text(event.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          if (event.subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(event.subtitle!, style: TextStyle(fontSize: 15, color: Colors.grey[700])),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              "Date: ${DateFormat('dd MMM yyyy, hh:mm a').format(event.date)}",
              style: const TextStyle(fontSize: 13, color: Colors.teal),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            "More details coming soon...",
            style: TextStyle(fontSize: 13, color: Colors.teal[700]),
          ),
        ],
      ),
    );
  }
}
