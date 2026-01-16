import 'package:flutter/material.dart';

class CrisisOptionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final IconData? icon; // optional
  final bool isActive; // optional highlight

  const CrisisOptionCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.icon,
    this.isActive = false,
  });

  @override
  Widget build(BuildContext context) {
    final cardColor = isActive
        ? Colors.teal.withValues(alpha: 0.11)
        : Theme.of(context).cardColor;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Card(
          elevation: isActive ? 5 : 3,
          color: cardColor,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          child: Padding(
            padding:
                const EdgeInsets.symmetric(vertical: 18.0, horizontal: 18.0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (icon != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 12.0, top: 2),
                    child: Icon(
                      icon,
                      size: 29,
                      color: isActive ? Colors.teal[700] : Colors.grey[600],
                    ),
                  ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          color: isActive ? Colors.teal[900] : Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 14.4,
                          color: Colors.grey[800],
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
