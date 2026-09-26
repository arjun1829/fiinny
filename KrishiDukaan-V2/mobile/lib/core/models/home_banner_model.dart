import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// A homepage hero banner from Admin > Banners (`banners/{id}`), the same docs
/// the website's carousel renders (app/views/HomeView.tsx). Only
/// `enabled && status == 'published'` banners are shown, sorted by `order`.
class HomeBannerModel {
  final String id;
  final String title;
  final String subtitle;
  /// Background photo. The admin's optional mobile image wins over the
  /// desktop one, same fallback rule as the website.
  final String image;
  /// Optional foreground/product image shown beside the text.
  final String? foregroundImage;
  /// Gradient painted over the photo, left to right. Null = "No Overlay".
  final List<Color>? overlay;
  final String ctaLabel;
  final bool ctaEnabled;
  /// `internal` (a website route such as `/market`) or `external` (a URL).
  final String linkType;
  final String linkValue;
  final bool enabled;
  final String status;
  final int order;

  const HomeBannerModel({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.image,
    required this.foregroundImage,
    required this.overlay,
    required this.ctaLabel,
    required this.ctaEnabled,
    required this.linkType,
    required this.linkValue,
    required this.enabled,
    required this.status,
    required this.order,
  });

  bool get isLive => enabled && status == 'published';

  factory HomeBannerModel.fromFirestore(
      DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const <String, dynamic>{};
    String s(String k) => (d[k] as String?)?.trim() ?? '';
    final link = d['ctaLink'] is Map
        ? Map<String, dynamic>.from(d['ctaLink'] as Map)
        : const <String, dynamic>{};
    final mobileImg = s('bgImgMobile');
    final fg = s('imgUrl');
    return HomeBannerModel(
      id: doc.id,
      title: s('title'),
      subtitle: s('subtitle'),
      image: mobileImg.isNotEmpty ? mobileImg : s('bgImg'),
      foregroundImage: fg.isEmpty ? null : fg,
      overlay: tailwindGradientColors((d['bgClass'] as String?) ?? ''),
      ctaLabel: s('ctaLabel'),
      ctaEnabled: d['ctaEnabled'] == true,
      linkType: (link['type'] as String?) ?? 'internal',
      linkValue: ((link['value'] as String?) ?? '').trim(),
      enabled: d['enabled'] == true,
      status: s('status'),
      order: (d['order'] as num?)?.toInt() ?? 0,
    );
  }
}

// Tailwind shades used by the admin's gradient presets (GRADIENT_PRESETS in
// app/admin/banners/page.tsx), plus neighbours so a hand-edited class still
// resolves. Tailwind v3 palette values.
const _tailwind = <String, int>{
  'emerald-700': 0xFF047857, 'emerald-800': 0xFF065F46,
  'emerald-900': 0xFF064E3B, 'emerald-950': 0xFF022C22,
  'amber-700': 0xFFB45309, 'amber-800': 0xFF92400E,
  'amber-900': 0xFF78350F, 'amber-950': 0xFF451A03,
  'orange-700': 0xFFC2410C, 'orange-800': 0xFF9A3412,
  'orange-900': 0xFF7C2D12, 'orange-950': 0xFF431407,
  'slate-700': 0xFF334155, 'slate-800': 0xFF1E293B,
  'slate-900': 0xFF0F172A, 'slate-950': 0xFF020617,
  'rose-700': 0xFFBE123C, 'rose-800': 0xFF9F1239,
  'rose-900': 0xFF881337, 'rose-950': 0xFF4C0519,
  'green-700': 0xFF15803D, 'green-800': 0xFF166534,
  'green-900': 0xFF14532D, 'green-950': 0xFF052E16,
  'black': 0xFF000000,
};

/// Turns the web's `from-X via-Y/85 to-Z/10` gradient classes into colours
/// (with the same opacities). Returns null for an empty class — the admin's
/// "No Overlay" — and a default emerald wash for anything unrecognised, so
/// white banner text never ends up unreadable over a bright photo.
List<Color>? tailwindGradientColors(String bgClass) {
  final classes = bgClass.trim();
  if (classes.isEmpty) return null;
  Color? parse(String prefix) {
    for (final token in classes.split(RegExp(r'\s+'))) {
      if (!token.startsWith(prefix)) continue;
      final parts = token.substring(prefix.length).split('/');
      final base = _tailwind[parts[0]];
      if (base == null) return null;
      final opacity = parts.length > 1 ? (int.tryParse(parts[1]) ?? 100) : 100;
      return Color(base).withValues(alpha: opacity / 100);
    }
    return null;
  }

  final from = parse('from-');
  final via = parse('via-');
  final to = parse('to-');
  if (from == null) {
    return [
      const Color(0xFF022C22),
      const Color(0xFF064E3B).withValues(alpha: 0.85),
      const Color(0xFF047857).withValues(alpha: 0.10),
    ];
  }
  return [from, ?via, to ?? from.withValues(alpha: 0)];
}
