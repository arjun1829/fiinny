// lib/screens/subs_bills/widgets/brand_avatar_registry.dart
import 'package:flutter/material.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';

/// Merchant name → asset icon map + convenience widget.
class BrandAvatarRegistry {
  static const Map<String, String> _map = {
    'netflix': 'assets/brands/netflix.png',
    'spotify': 'assets/brands/spotify.png',
    'google drive': 'assets/brands/google_drive.png',
    'drive': 'assets/brands/google_drive.png',
    'icloud': 'assets/brands/icloud.png',
    'amazon': 'assets/brands/amazon.png',
    'airtel': 'assets/brands/airtel.png',
    'jio': 'assets/brands/jio.png',
    'rentomojo': 'assets/brands/rentomojo.png',
    'prime': 'assets/brands/amazon.png',
    'youtube': 'assets/brands/youtube.png',
  };

  static String? assetFor(String? merchant) {
    if (merchant == null) return null;
    final n = merchant.toLowerCase();
    for (final key in _map.keys) {
      if (n.contains(key)) return _map[key];
    }
    return null;
  }
}

class BrandAvatarFromName extends StatelessWidget {
  final String? merchant;
  final double size;
  final double radius;

  const BrandAvatarFromName({
    super.key,
    required this.merchant,
    this.size = 36,
    this.radius = 10,
  });

  @override
  Widget build(BuildContext context) {
    return BrandAvatar(
      assetPath: BrandAvatarRegistry.assetFor(merchant),
      label: merchant,
      size: size,
      radius: radius,
    );
  }
}
