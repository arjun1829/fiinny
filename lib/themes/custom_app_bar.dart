import 'package:flutter/material.dart';

class CustomAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final Widget? action;
  final Widget? leading;
  final double height;
  final List<Color>? backgroundGradient;
  final bool diamondOverlay;

  const CustomAppBar({
    Key? key,
    required this.title,
    this.action,
    this.leading,
    this.height = 86,
    this.backgroundGradient,
    this.diamondOverlay = false,
  }) : super(key: key);

  @override
  Size get preferredSize => Size.fromHeight(height);

  @override
  Widget build(BuildContext context) {
    final gradientColors = backgroundGradient ??
        [
          Color(0xFF81e6d9),
          Color(0xFFb9f5d8),
          Colors.white.withValues(alpha: 0.72),
        ];

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradientColors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (diamondOverlay)
            Positioned(
              top: -32,
              left: 0,
              right: 0,
              child: Opacity(
                opacity: 0.19,
                child: Image.asset(
                  'assets/diamond_overlay.png',
                  fit: BoxFit.cover,
                  height: 110,
                ),
              ),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.only(left: 12, right: 12, top: 8),
              child: Row(
                children: [
                  if (leading != null) leading!,
                  Expanded(
                    child: Center(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 26,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF09857a),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                  if (action != null) action!,
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
