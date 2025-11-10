import 'package:flutter/material.dart';

class WebHouseAdCard extends StatefulWidget {
  final EdgeInsets margin;
  final double radius;

  const WebHouseAdCard({
    super.key,
    this.margin = const EdgeInsets.fromLTRB(18, 8, 18, 12),
    this.radius = 16,
  });

  @override
  State<WebHouseAdCard> createState() => _WebHouseAdCardState();
}

class _WebHouseAdCardState extends State<WebHouseAdCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  )..forward();

  bool _dismissed = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();

    return FadeTransition(
      opacity: CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOut,
      ),
      child: Container(
        margin: widget.margin,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.radius),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xF0FFFFFF), Color(0xF0F4FFFB)],
          ),
          border: Border.all(color: Colors.white.withOpacity(0.7)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 18,
              offset: Offset(0, 10),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 16, 14),
          child: Row(
            children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: const Color(0x3309857A),
                  borderRadius: BorderRadius.circular(14),
                ),
                alignment: Alignment.center,
                child: const Icon(
                  Icons.web_asset_rounded,
                  color: Color(0xFF09857A),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Text(
                      'Sponsored',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Colors.black54,
                        letterSpacing: 0.2,
                      ),
                    ),
                    SizedBox(height: 6),
                    Text(
                      'Get the Fiinny mobile app for faster settles',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF0F1E1C),
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Scan receipts offline, use smart settle, and sync instantly.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.3,
                        color: Color(0x990F1E1C),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    iconSize: 18,
                    splashRadius: 20,
                    onPressed: () => setState(() => _dismissed = true),
                    icon: const Icon(
                      Icons.close_rounded,
                      color: Color(0x660F1E1C),
                    ),
                  ),
                  const SizedBox(height: 2),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      backgroundColor: const Color(0xFF09857A),
                      foregroundColor: Colors.white,
                      elevation: 0,
                    ),
                    onPressed: () {
                      // For web fallback this simply opens the existing PWA install dialog.
                      // Developers can wire a deeplink or external URL here later.
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Install the app from your store to unlock more.')),
                      );
                    },
                    child: const Text('Get the app'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

