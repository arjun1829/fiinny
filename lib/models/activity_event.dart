import 'package:flutter/material.dart';

enum ActivityType {
  manualTransaction,
  goalAdded,
  goalEdited,
  goalClosed,
  friendAdded,
  groupEdited,
  groupSettled,
}

class ActivityEvent {
  final ActivityType type;
  final String title;
  final String subtitle;
  final DateTime date;
  final IconData icon;

  ActivityEvent({
    required this.type,
    required this.title,
    required this.subtitle,
    required this.date,
    required this.icon,
  });
}
