import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/utils/image_utils.dart';
import '../../../core/widgets/section_header.dart';
import '../providers/hubs_provider.dart';

/// One crop tile: the crop hub it opens, its name and icon.
typedef HomeCrop = ({String id, String name, String image});

/// Shown until the `hubs` collection has loaded, and if it can't — the same
/// list, order and pictures as the website's fallback (app/constants.ts CROPS).
const List<HomeCrop> kHomeCrops = [
  (
    id: 'watermelon',
    name: 'Watermelon',
    image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDSGbELbnV8HdsslJ8hy2mq0a_hvzZrr4cwUKHrze-GEeDpv0Z0VAvA62LryAUopIvuvGVeMWJJbVbRbtq1vKgcoaC4k3njelp3OPJb4_vjrijsdG-_1eEve_PojVdVNedf02IxptPKFjsUkGRH1oiP1H0007UHuQJ18mVTW7N6Vr0wdS7106fBV-qwwwXtBDWxaYcfvkouSyItxhdz24OL3GaUYJVj1YAyxMbObWYCQ7RpC1_QTpxN-wK8fDzDpx5JjUPaRwkLJq3m',
  ),
  (
    id: 'cotton',
    name: 'Cotton',
    image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAi13WleIFmuHicYHUY0W-rwufSddyMDo6kb2AcbrntT8BejZDYLjTxaKtV_Y7mnIsnnZJB27-jLhcDJJ-INGrThJKx-ezn-v1eICtCBg9KvmrOIjxCzqye2mi_tIn2fzO64bWu8QByBgH2JQTivKMjxsEsgphoj0fCIMsFB7enUvlyLg-6IkDTTWxfnEszM37GZrGUGaIDzJCwiztMcbaYmVPS8EIuSqQY0ewtQb8oZbCMTLeltwk9U7G9_lPwLTyFLt5WcDAd8f1r',
  ),
  (
    id: 'mangoes',
    name: 'Mango',
    image:
        'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=400&q=70',
  ),
  (
    id: 'pomegranate',
    name: 'Pomegranate',
    image:
        'https://images.unsplash.com/photo-1615486511484-92e172054c04?auto=format&fit=crop&w=400&q=70',
  ),
  (
    id: 'grapes',
    name: 'Grapes',
    image:
        'https://images.unsplash.com/photo-1596334139886-c5e3f16960cc?auto=format&fit=crop&w=400&q=70',
  ),
  (
    id: 'banana',
    name: 'Banana',
    image:
        'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=400&q=70',
  ),
  (
    id: 'sugarcane',
    name: 'Sugarcane',
    image:
        'https://images.unsplash.com/photo-1528183429150-455634e9012f?auto=format&fit=crop&w=400&q=70',
  ),
  (
    id: 'onion',
    name: 'Onion',
    image:
        'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?auto=format&fit=crop&w=400&q=70',
  ),
  (
    id: 'cherry',
    name: 'Cherry',
    image:
        'https://images.unsplash.com/photo-1464960350295-995e5331002f?auto=format&fit=crop&w=400&q=70',
  ),
  (
    id: 'orange',
    name: 'Orange',
    image:
        'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=400&q=70',
  ),
];

/// Home's "Shop by Crop" grid, same as the website's: a tile per crop hub,
/// tapping one opens the Crop Hubs tab on that crop.
///
/// Uses [hubsListProvider] (shared with the Hubs tab, refreshed every 15
/// minutes) and shows [kHomeCrops]' names with a plain placeholder until it
/// arrives — never their built-in pictures, which are the ORIGINAL images and
/// made admin-changed hub images look like they had reverted. The hub's own
/// icon (set in admin) wins over its hero image.
class ShopByCropSection extends ConsumerWidget {
  const ShopByCropSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hubs = ref.watch(hubsListProvider).value;
    final List<HomeCrop> crops;
    if (hubs == null || hubs.isEmpty) {
      crops = [for (final c in kHomeCrops) (id: c.id, name: c.name, image: '')];
    } else {
      // Document-id order, as the web reads them.
      final sorted = [...hubs]..sort((a, b) => a.id.compareTo(b.id));
      crops = [
        for (final h in sorted)
          (
            id: h.id,
            name: h.name,
            image: (h.iconImage?.isNotEmpty ?? false)
                ? h.iconImage!
                : h.heroImage,
          ),
      ];
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Shop by Crop', icon: Icons.grass_rounded),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            childAspectRatio: 0.76,
          ),
          itemCount: crops.length,
          itemBuilder: (context, i) => _CropTile(crop: crops[i]),
        ),
      ],
    );
  }
}

class _CropTile extends StatefulWidget {
  final HomeCrop crop;
  const _CropTile({required this.crop});

  @override
  State<_CropTile> createState() => _CropTileState();
}

class _CropTileState extends State<_CropTile> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final crop = widget.crop;
    return GestureDetector(
      // `t` makes a second tap re-select even though the Hubs tab keeps its
      // state between visits.
      onTap: () => context.go(
        '/hubs?hub=${Uri.encodeQueryComponent(crop.id)}'
        '&t=${DateTime.now().millisecondsSinceEpoch}',
      ),
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.93 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFF5F3F1),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  border: Border.all(color: const Color(0xFFE4E2E0)),
                ),
                child: ClipOval(
                  child: crop.image.isEmpty
                      ? const Icon(Icons.grass_rounded, size: 22, color: AppColors.primary)
                      : CachedNetworkImage(
                          imageUrl: resolveImageUrl(crop.image),
                          fit: BoxFit.cover,
                          memCacheWidth: 150,
                          errorWidget: (_, _, _) => const Icon(
                            Icons.grass_rounded,
                            size: 22,
                            color: AppColors.primary,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                crop.name,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.caption.copyWith(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.onSurface,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
