import 'dart:ui';
import 'package:flutter/material.dart';

class ShinyCard extends StatelessWidget {
  final String title;        // e.g., Electricity
  final String last4;        // e.g., 3921
  final String amount;       // e.g., ₹ 1,530
  final ImageProvider? logo; // brand logo
  final List<Color> gradient;

  const ShinyCard({
    super.key,
    required this.title,
    required this.last4,
    required this.amount,
    this.logo,
    this.gradient = const [Color(0xFF171C24), Color(0xFF2A3547)],
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: Stack(
        children: [
          Container(
            height: 160,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                  colors: gradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
              border: Border.all(color: Colors.white.withOpacity(.10)),
            ),
          ),
          // subtle glass sheen
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 0.5, sigmaY: 0.5),
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.white.withOpacity(.12), Colors.white.withOpacity(0)],
                    begin: Alignment.topCenter, end: Alignment.center,
                  ),
                ),
              ),
            ),
          ),
          // diagonal sparkle
          Positioned(
            left: -40, top: -20,
            child: Transform.rotate(
              angle: -.35,
              child: Container(
                width: 220, height: 90,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                      colors: [Colors.white.withOpacity(.18), Colors.transparent]),
                  borderRadius: BorderRadius.circular(28),
                ),
              ),
            ),
          ),
          // content
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  if (logo != null) ...[
                    CircleAvatar(backgroundImage: logo, radius: 20),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(title,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
                        Text('•••• $last4',
                            style: TextStyle(color: Colors.white.withOpacity(.85), fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                  Text(amount,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
