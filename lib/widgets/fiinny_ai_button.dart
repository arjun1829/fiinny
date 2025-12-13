import 'package:flutter/material.dart';
import 'dart:math' as math;
import '../screens/insight_feed_screen.dart'; // Ensure correct import for navigation
import '../services/user_data.dart'; // Ensure UserData is available if needed, or pass it in

class FiinnyAiButton extends StatefulWidget {
  final String userPhone;
  final VoidCallback? onTap;

  const FiinnyAiButton({Key? key, required this.userPhone, this.onTap}) : super(key: key);

  @override
  State<FiinnyAiButton> createState() => _FiinnyAiButtonState();
}

class _FiinnyAiButtonState extends State<FiinnyAiButton> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 4),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap ?? () {
         // Default navigation if no callback provided
         Navigator.pushNamed(
            context,
            '/insights',
            arguments: {
              'userId': widget.userPhone,
              // 'userData': ... // You might need to pass this or fetch it inside the screen if missing
               // Ideally the route handler handles the data fetching if its missing, 
               // or we assume the screen can handle missing UserData or fetches it itself.
               // For now let's rely on the existing route or the callback.
            },
         );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.teal.withOpacity(0.2)),
          boxShadow: [
            BoxShadow(
              color: Colors.teal.withOpacity(0.1),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                return Transform.rotate(
                  angle: _controller.value * 2 * math.pi,
                  child: const Icon(
                    Icons.auto_awesome,
                    size: 18,
                    color: Colors.teal,
                  ),
                );
              },
            ),
            const SizedBox(width: 6),
            const Text(
              "Fiinny AI",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.teal,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
