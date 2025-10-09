import 'package:flutter/material.dart';

class PillBadge extends StatelessWidget {
  final String text;
  const PillBadge({Key? key, required this.text}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.black12),
      ),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}
