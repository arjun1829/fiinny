// lib/screens/dashboard_activity_screen.dart

import 'package:flutter/material.dart';
import '../models/activity_event.dart';

class DashboardActivityScreen extends StatelessWidget {
  final List<ActivityEvent> events;
  const DashboardActivityScreen({super.key, required this.events});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Activity"),
        backgroundColor: Colors.white,
        foregroundColor: Color(0xFF09857a),
        elevation: 2,
      ),
      body: events.isEmpty
          ? const Center(child: Text("No activity yet!"))
          : ListView.separated(
              itemCount: events.length,
              separatorBuilder: (_, __) => const Divider(),
              itemBuilder: (context, idx) {
                final event = events[idx];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.teal.shade50,
                    child: Icon(event.icon, color: Color(0xFF09857a)),
                  ),
                  title: Text(event.title,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(event.subtitle),
                  trailing: Text(
                    "${event.date.hour.toString().padLeft(2, '0')}:${event.date.minute.toString().padLeft(2, '0')}",
                    style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                  ),
                );
              },
            ),
    );
  }
}
