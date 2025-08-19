import 'package:flutter/material.dart';

class AnimatedMintBackground extends StatelessWidget {
  const AnimatedMintBackground({super.key});
  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: const Duration(seconds: 2),
      builder: (context, value, child) => Container(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            colors: [
              Colors.tealAccent.withOpacity(0.2),
              Colors.teal.withOpacity(0.1),
              Colors.white.withOpacity(0.6),
            ],
            radius: 1.2,
            center: Alignment.topLeft,
            stops: [0.0, 0.5, value],
          ),
        ),
      ),
    );
  }
}
