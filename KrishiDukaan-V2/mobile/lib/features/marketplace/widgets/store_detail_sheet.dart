import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/store_model.dart';
import '../../../core/utils/geo_utils.dart';
import 'review_sheet.dart';

/// Bottom sheet that shows a store's full profile — address, owner, distance,
/// ratings — plus contextual actions. Manufacturers get a "Visit Brand Page"
/// shortcut into their brand storefront.
void showStoreDetailSheet({
  required BuildContext context,
  required WidgetRef ref,
  required StoreModel store,
  VoidCallback? onCall,
  VoidCallback? onNavigate,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _StoreDetailSheet(
      store: store,
      onCall: onCall,
      onNavigate: onNavigate,
      ref: ref,
    ),
  );
}

class _StoreDetailSheet extends StatelessWidget {
  final StoreModel store;
  final VoidCallback? onCall;
  final VoidCallback? onNavigate;
  final WidgetRef ref;

  const _StoreDetailSheet({
    required this.store,
    required this.onCall,
    required this.onNavigate,
    required this.ref,
  });

  @override
  Widget build(BuildContext context) {
    final address = store.fullAddress;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Grab handle
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 10, bottom: 6),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Header: logo + name + role badge
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: store.logo != null && store.logo!.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: store.logo!,
                              fit: BoxFit.contain,
                              errorWidget: (_, _, _) => const Icon(
                                Icons.store,
                                color: AppColors.primary,
                              ),
                            )
                          : const Icon(Icons.store, color: AppColors.primary),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            store.name,
                            style: AppTextStyles.heading3,
                          ),
                          if (store.ownerName != null &&
                              store.ownerName!.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                store.ownerName!,
                                style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.onSurfaceVariant,
                                ),
                              ),
                            ),
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            children: [
                              _Chip(
                                icon: Icons.storefront,
                                label: store.isManufacturer
                                    ? 'Manufacturer'
                                    : 'Retailer',
                                color: store.isManufacturer
                                    ? AppColors.secondary
                                    : AppColors.primary,
                              ),
                              if (store.distanceKm != null)
                                _Chip(
                                  icon: Icons.near_me,
                                  label:
                                      '${GeoUtils.formatDistance(store.distanceKm!)} away',
                                  color: AppColors.primary,
                                ),
                              if (store.averageRating != null &&
                                  store.averageRating! > 0)
                                _Chip(
                                  icon: Icons.star,
                                  label:
                                      '${store.averageRating!.toStringAsFixed(1)} (${store.totalReviews ?? 0})',
                                  color: Colors.orange,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const Divider(height: 24),

              // Info rows
              if (address.isNotEmpty)
                _InfoRow(
                  icon: Icons.location_on_outlined,
                  label: 'Address',
                  value: address,
                ),
              if (store.phone != null && store.phone!.isNotEmpty)
                _InfoRow(
                  icon: Icons.phone_outlined,
                  label: 'Phone',
                  value: store.phone!,
                ),
              if (store.distanceKm != null)
                _InfoRow(
                  icon: Icons.near_me_outlined,
                  label: 'Distance',
                  value:
                      '${GeoUtils.formatDistance(store.distanceKm!)} from your location',
                ),

              const SizedBox(height: 8),

              // Manufacturer → brand page
              if (store.isManufacturer &&
                  store.phone != null &&
                  store.phone!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        // Capture the router before popping — after pop this
                        // sheet's context is on its way out, so resolving the
                        // GoRouter from it would be unsafe.
                        final router = GoRouter.of(context);
                        Navigator.of(context).pop();
                        router.push('/brand/${store.phone}');
                      },
                      icon: const Icon(Icons.business_center_outlined, size: 18),
                      label: const Text('Visit Brand Page'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.secondary,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ),

              // Action row
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                child: Row(
                  children: [
                    if (onCall != null) ...[
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.of(context).pop();
                            onCall!();
                          },
                          icon: const Icon(Icons.phone_outlined, size: 16),
                          label: const Text('Call'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(color: AppColors.primary),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          showStoreReviewsBottomSheet(
                            context: context,
                            ref: ref,
                            store: store,
                          );
                        },
                        icon: const Icon(Icons.rate_review_outlined, size: 16),
                        label: const Text('Reviews'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: AppColors.primary),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    if (onNavigate != null) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () {
                            Navigator.of(context).pop();
                            onNavigate!();
                          },
                          icon: const Icon(Icons.navigation, size: 16),
                          label: const Text('Directions'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _Chip({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 3),
          Text(
            label,
            style: AppTextStyles.caption.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.onSurfaceVariant),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 1),
                Text(value, style: AppTextStyles.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
