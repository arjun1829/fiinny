// lib/core/ui/snackbar_throttle.dart
import 'package:flutter/material.dart';

class SnackThrottle {
  static DateTime? _lastAt;
  static String? _lastMsg;

  static void show(BuildContext ctx, String msg, {Color? color}) {
    final now = DateTime.now();
    if (_lastMsg == msg && _lastAt != null && now.difference(_lastAt!) < const Duration(seconds: 2)) return;
    _lastMsg = msg; _lastAt = now;
    ScaffoldMessenger.of(ctx).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color),
    );
  }
}
