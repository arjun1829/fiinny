// lib/services/image_cache.dart
import 'package:flutter/material.dart';

/// Tiny helper to keep image allocations predictable and warm up
/// frequently-used assets (like brand logos) at app start or screen open.
class AppImageCache {
  AppImageCache._();

  static bool _capsSet = false;
  static bool _brandsWarmed = false;

  /// Set global caps once to avoid jank on low-end devices.
  /// Call early (e.g., in main()).
  static void setCaps({
    int? maxEntries,
    int? maxSizeBytes,
  }) {
    if (_capsSet) return;
    final cache = PaintingBinding.instance.imageCache;
    if (maxEntries != null) cache.maximumSize = maxEntries;
    if (maxSizeBytes != null) cache.maximumSizeBytes = maxSizeBytes;
    _capsSet = true;
  }

  /// Clears the in-memory raster cache (use sparingly).
  static void clear() {
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
  }

  /// Precache a list of asset paths with a target cacheWidth.
  /// Useful for `assets/brands/*.png` to ensure quick list rendering.
  static Future<void> precacheAssets(
      BuildContext context, {
        required List<String> assetPaths,
        int cacheWidth = 64,
      }) async {
    for (final path in assetPaths) {
      final img = AssetImage(path);
      // quietly try; missing assets shouldn't crash the warm up
      try {
        await precacheImage(img, context, size: Size(cacheWidth.toDouble(), cacheWidth.toDouble()));
      } catch (_) {}
    }
  }

  /// Warm-up commonly used brand logos exactly once.
  /// Provide your own list if you have a registry.
  static Future<void> warmUpBrands(
      BuildContext context, {
        List<String>? paths,
        int cacheWidth = 64,
      }) async {
    if (_brandsWarmed) return;
    final defaults = <String>[
      'assets/brands/amazon.png',
      'assets/brands/netflix.png',
      'assets/brands/spotify.png',
      'assets/brands/youtube.png',
      'assets/brands/apple.png',
      'assets/brands/microsoft.png',
      'assets/brands/prime.png',
      'assets/brands/rentomojo.png',
      'assets/brands/zee5.png',
      'assets/brands/hotstar.png',
    ];
    await precacheAssets(
      context,
      assetPaths: paths ?? defaults,
      cacheWidth: cacheWidth,
    );
    _brandsWarmed = true;
  }
}
