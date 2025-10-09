// lib/ui/atoms/brand_avatar.dart
import 'package:flutter/material.dart';

/// Minimal brand avatar with graceful fallback (initials).
class BrandAvatar extends StatelessWidget {
  final String? assetPath; // e.g. assets/brands/netflix.png
  final String? label;     // used for initials fallback
  final double size;
  final double radius;

  const BrandAvatar({
    super.key,
    this.assetPath,
    this.label,
    this.size = 36,
    this.radius = 10,
  });

  @override
  Widget build(BuildContext context) {
    if (assetPath != null && assetPath!.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Image.asset(
          assetPath!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _fallback(),
        ),
      );
    }
    return _fallback();
  }

  Widget _fallback() {
    final txt = (label ?? '').trim();
    final initials = txt.isEmpty
        ? '•'
        : txt
        .split(RegExp(r'\s+'))
        .where((e) => e.isNotEmpty)
        .map((e) => e.characters.first)
        .take(2)
        .join()
        .toUpperCase();

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: const LinearGradient(
          colors: [Color(0xFFEAECEE), Color(0xFFD5DBDB)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initials,
        style: const TextStyle(fontWeight: FontWeight.w900),
      ),
    );
  }
}
