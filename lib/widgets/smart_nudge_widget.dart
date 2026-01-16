import 'dart:async';
import 'package:flutter/material.dart';

class SmartNudgeWidget extends StatefulWidget {
  final String userId;

  const SmartNudgeWidget({super.key, required this.userId});

  @override
  State<SmartNudgeWidget> createState() => _SmartNudgeWidgetState();
}

class _SmartNudgeWidgetState extends State<SmartNudgeWidget> {
  final List<String> _nudges = const [
    "💡 Don’t forget to log today’s expenses!",
    "🚀 Your savings journey is on track – keep going!",
    "🎯 Small expenses add up. Review your spending today!",
    "📈 You’re closer to your goal than you think.",
    "✨ Consistency is more powerful than perfection.",
  ];

  int _currentIndex = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      setState(() {
        _currentIndex = (_currentIndex + 1) % _nudges.length;
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 500),
      child: Container(
        key: ValueKey(_currentIndex),
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.teal.shade50.withValues(alpha: 0.85),
          borderRadius: BorderRadius.circular(15),
          boxShadow: [
            BoxShadow(
              color: Colors.teal.withValues(alpha: 0.08),
              blurRadius: 6,
              offset: const Offset(0, 2),
            )
          ],
        ),
        child: Text(
          _nudges[_currentIndex],
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Color(0xFF09857a),
          ),
        ),
      ),
    );
  }
}
