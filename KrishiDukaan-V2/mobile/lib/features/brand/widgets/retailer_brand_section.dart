import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/retailer_brand_model.dart';
import '../../../core/widgets/expandable_text.dart';

/// The brand-page content on a shop's profile screen (the screen
/// krishidukan.com/shop/{phone} links open in the app): highlights, about,
/// hours, shop photos, WhatsApp and socials. Shown only while the retailer
/// has the page switched on.
class RetailerBrandSection extends StatelessWidget {
  final RetailerBrandModel brand;
  final String shopPhone;
  final String shopName;

  const RetailerBrandSection({
    super.key,
    required this.brand,
    required this.shopPhone,
    required this.shopName,
  });

  Future<void> _open(BuildContext context, Uri uri) async {
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted) throw Exception();
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open the link')),
        );
      }
    }
  }

  void _viewPhoto(BuildContext context, String url) {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(12),
        child: Stack(
          children: [
            InteractiveViewer(
              child: CachedNetworkImage(imageUrl: url, fit: BoxFit.contain),
            ),
            Positioned(
              right: 4,
              top: 4,
              child: IconButton(
                onPressed: () => Navigator.of(ctx).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wa = (brand.whatsapp.isNotEmpty ? brand.whatsapp : shopPhone)
        .replaceAll(RegExp(r'\D'), '');
    final wa10 = wa.length >= 10 ? wa.substring(wa.length - 10) : '';
    final socials = <(String, IconData, String)>[
      if (brand.instagram.isNotEmpty)
        ('Instagram', Icons.camera_alt_outlined, brand.instagram),
      if (brand.facebook.isNotEmpty)
        ('Facebook', Icons.facebook, brand.facebook),
      if (brand.youtube.isNotEmpty)
        ('YouTube', Icons.smart_display_outlined, brand.youtube),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (brand.highlights.isNotEmpty)
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final h in brand.highlights)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      h,
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
              ],
            ),
          if (brand.about.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text('About us', style: AppTextStyles.heading3),
            const SizedBox(height: 4),
            ExpandableText(brand.about, trimLines: 4),
          ],
          if (brand.openingHours.isNotEmpty ||
              brand.establishedYear.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                if (brand.openingHours.isNotEmpty)
                  _iconText(Icons.schedule, brand.openingHours),
                if (brand.establishedYear.isNotEmpty)
                  _iconText(Icons.verified_outlined,
                      'Since ${brand.establishedYear}'),
              ],
            ),
          ],
          if (brand.photos.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text('Our shop', style: AppTextStyles.heading3),
            const SizedBox(height: 8),
            SizedBox(
              height: 110,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: brand.photos.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) => GestureDetector(
                  onTap: () => _viewPhoto(context, brand.photos[i]),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: CachedNetworkImage(
                      imageUrl: brand.photos[i],
                      width: 110,
                      height: 110,
                      fit: BoxFit.cover,
                      memCacheWidth: 330,
                    ),
                  ),
                ),
              ),
            ),
          ],
          if (wa10.isNotEmpty || socials.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (wa10.isNotEmpty)
                  FilledButton.icon(
                    onPressed: () => _open(
                      context,
                      Uri.parse(
                        'https://wa.me/91$wa10?text=${Uri.encodeComponent('Hi $shopName, I found your shop on KrishiDukan.')}',
                      ),
                    ),
                    icon: const Icon(Icons.chat_outlined, size: 18),
                    label: const Text('WhatsApp'),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF25D366),
                      foregroundColor: Colors.white,
                    ),
                  ),
                for (final s in socials)
                  OutlinedButton.icon(
                    onPressed: () => _open(context, Uri.parse(s.$3)),
                    icon: Icon(s.$2, size: 18),
                    label: Text(s.$1),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _iconText(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.onSurfaceVariant),
          const SizedBox(width: 4),
          Flexible(child: Text(text, style: AppTextStyles.bodySmall)),
        ],
      );
}
