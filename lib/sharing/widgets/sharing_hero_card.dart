import 'dart:ui';
import 'package:flutter/material.dart';
import 'sharing_hero_ring.dart';

class SharingHeroCard extends StatelessWidget {
  final String userName;
  final String? avatar; // http(s) url, asset path, or even an emoji like "😄"
  final int txCount;
  final double txAmount;
  final double credit;
  final double debit;
  final bool isMe;
  final double cardScale; // 1.0 = normal, 1.1 = 10% bigger
  final bool glossy;
  final VoidCallback onTap;
  final Widget? trailingActions; // optional trailing widget

  const SharingHeroCard({
    super.key,
    required this.userName,
    required this.avatar,
    required this.credit,
    required this.debit,
    required this.txCount,
    required this.txAmount,
    required this.isMe,
    required this.onTap,
    this.cardScale = 1.0,
    this.glossy = false,
    this.trailingActions,
  });

  bool get _isEmojiAvatar {
    final a = (avatar ?? '').trim();
    // crude but effective: single grapheme or starts/contains emoji-like char
    return a.isNotEmpty &&
        !a.startsWith('http') &&
        !a.contains('/') &&
        a.runes.length <= 4; // most emoji fit in <= 4 code units
  }

  ImageProvider<Object>? _imageForAvatar() {
    final a = avatar?.trim();
    if (a == null || a.isEmpty) {
      return const AssetImage('assets/images/profile_default.png');
    }
    if (a.startsWith('http')) {
      return NetworkImage(a);
    }
    if (a.contains('/')) {
      return AssetImage(a);
    }
    // If it's not http or asset-like, treat it as non-image (emoji/text handled elsewhere)
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final double height = 110 * cardScale;
    final double avatarRadius = 33 * cardScale;
    final double ringSize = 74 * cardScale;
    final double fontSize = 18 * cardScale;

    final bgColor = isMe
        ? Colors.white.withValues(alpha: 0.92)
        : Colors.white.withValues(alpha: 0.82);

    final nameColor = isMe ? const Color(0xFF09857a) : const Color(0xFF1B2C36);

    return Center(
      child: Semantics(
        button: true,
        label:
            '$userName, $txCount transactions today, amount ₹${txAmount.toStringAsFixed(0)}',
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(32 * cardScale),
            onTap: onTap,
            child: Container(
              height: height,
              margin: const EdgeInsets.symmetric(vertical: 4),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(32 * cardScale),
                color: bgColor,
                boxShadow: [
                  BoxShadow(
                    color: Colors.teal.withValues(alpha: 0.18),
                    blurRadius: 28 * cardScale,
                    spreadRadius: 2,
                    offset: const Offset(0, 10),
                  ),
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.035),
                    blurRadius: 12,
                    spreadRadius: 1,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              clipBehavior: Clip.hardEdge,
              child: Stack(
                children: [
                  if (glossy)
                    Positioned.fill(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(32 * cardScale),
                        child: BackdropFilter(
                          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                          child: Container(
                              color: Colors.white.withValues(alpha: 0.10)),
                        ),
                      ),
                    ),
                  if (glossy)
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      height: height * 0.38,
                      child: IgnorePointer(
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.vertical(
                              top: Radius.circular(32 * cardScale),
                            ),
                            gradient: LinearGradient(
                              colors: [
                                Colors.white.withValues(alpha: 0.20),
                                Colors.white.withValues(alpha: 0.04),
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                          ),
                        ),
                      ),
                    ),

                  // Content
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const SizedBox(width: 18),

                      // Avatar (emoji-aware)
                      _isEmojiAvatar
                          ? CircleAvatar(
                              radius: avatarRadius,
                              backgroundColor:
                                  Colors.teal.withValues(alpha: 0.12),
                              child: Text(
                                avatar!,
                                style: TextStyle(
                                    fontSize: avatarRadius), // big emoji
                              ),
                            )
                          : CircleAvatar(
                              radius: avatarRadius,
                              backgroundColor:
                                  Colors.teal.withValues(alpha: 0.13),
                              backgroundImage: _imageForAvatar(),
                            ),

                      const SizedBox(width: 14),

                      // Left: Details
                      Expanded(
                        flex: 5,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    userName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: nameColor,
                                      fontSize: fontSize,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.05,
                                    ),
                                  ),
                                ),
                                if (isMe)
                                  Padding(
                                    padding: const EdgeInsets.only(left: 6),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF09857a)
                                            .withValues(alpha: 0.10),
                                        borderRadius:
                                            BorderRadius.circular(999),
                                      ),
                                      child: const Text(
                                        'You',
                                        style: TextStyle(
                                          color: Color(0xFF09857a),
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Icon(Icons.compare_arrows_rounded,
                                    color: Colors.teal[400],
                                    size: 17 * cardScale),
                                const SizedBox(width: 5),
                                Text(
                                  '$txCount today',
                                  style: TextStyle(
                                    color: Colors.teal[900],
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13 * cardScale,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2.5),
                            Row(
                              children: [
                                Icon(Icons.currency_rupee,
                                    color: Colors.teal[400],
                                    size: 16 * cardScale),
                                const SizedBox(width: 3.5),
                                Text(
                                  '₹${txAmount.toStringAsFixed(0)}',
                                  style: TextStyle(
                                    color: Colors.teal[700],
                                    fontWeight: FontWeight.bold,
                                    fontSize: 15 * cardScale,
                                  ),
                                ),
                                const SizedBox(width: 4.5),
                                Text(
                                  'today',
                                  style: TextStyle(
                                    color: Colors.teal[400],
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12.5 * cardScale,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),

                      // Right: Ring + optional trailing actions
                      Padding(
                        padding: EdgeInsets.only(right: 20 * cardScale),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SharingHeroRing(
                              credit: credit,
                              debit: debit,
                              size: ringSize,
                            ),
                            if (trailingActions != null) ...[
                              const SizedBox(width: 12),
                              trailingActions!,
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
