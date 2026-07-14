import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/hub_model.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/hubs_provider.dart';

// ──────────────────────────────────────────────────────────────────────────────
// Icon helpers — maps icon name strings (from web) to Material icons
// ──────────────────────────────────────────────────────────────────────────────
IconData _nutritionIcon(String name) {
  switch (name) {
    case 'Science':
      return Icons.science_outlined;
    case 'Water':
      return Icons.water_drop_outlined;
    case 'Efficiency':
      return Icons.bolt_outlined;
    case 'Sprout':
    default:
      return Icons.eco_outlined;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// HubsScreen — main entry point (tab bar + detail view)
// ──────────────────────────────────────────────────────────────────────────────
class HubsScreen extends ConsumerStatefulWidget {
  const HubsScreen({super.key});

  @override
  ConsumerState<HubsScreen> createState() => _HubsScreenState();
}

class _HubsScreenState extends ConsumerState<HubsScreen> {
  HubModel? _selected;
  final ScrollController _tabScrollCtrl = ScrollController();

  @override
  void dispose() {
    _tabScrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hubsAsync = ref.watch(hubsListProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: hubsAsync.when(
        loading: () => const _HubsLoading(),
        error: (e, _) => ErrorView(
          message: 'Could not load crop hubs.',
          onRetry: () => ref.invalidate(hubsListProvider),
        ),
        data: (hubs) {
          if (hubs.isEmpty) {
            return const EmptyState(
              title: 'No Hubs Yet',
              subtitle: 'Crop guides are coming soon',
              icon: Icons.grass_outlined,
            );
          }
          _selected ??= hubs.first;
          final hub = _selected!;

          return CustomScrollView(
            slivers: [
              // ── App Bar ──
              SliverAppBar(
                floating: true,
                snap: true,
                elevation: 0,
                backgroundColor: Colors.transparent,
                foregroundColor: AppColors.onSurface,
                systemOverlayStyle: topBarOverlayStyle,
                flexibleSpace: const TopBarBackdrop(),
                titleSpacing: 16,
                title: Row(
                  children: [
                    const AppBrandIcon(size: 30),
                    const SizedBox(width: 10),
                    Text(
                      'Crop Hubs',
                      style: AppTextStyles.heading2.copyWith(
                        color: AppColors.onSurface,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),

              // ── Sticky Tab Bar ──
              SliverPersistentHeader(
                pinned: true,
                delegate: _TabBarDelegate(
                  hubs: hubs,
                  selected: hub,
                  onSelect: (h) => setState(() => _selected = h),
                  scrollCtrl: _tabScrollCtrl,
                ),
              ),

              // ── Content ──
              SliverToBoxAdapter(child: HubContentWidget(hub: hub)),
            ],
          );
        },
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Sticky tab bar
// ──────────────────────────────────────────────────────────────────────────────
class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final List<HubModel> hubs;
  final HubModel selected;
  final ValueChanged<HubModel> onSelect;
  final ScrollController scrollCtrl;

  const _TabBarDelegate({
    required this.hubs,
    required this.selected,
    required this.onSelect,
    required this.scrollCtrl,
  });

  @override
  double get minExtent => 60;
  @override
  double get maxExtent => 60;

  @override
  bool shouldRebuild(_TabBarDelegate old) =>
      old.selected != selected || old.hubs != hubs;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      color: Colors.white,
      height: 60,
      child: SingleChildScrollView(
        controller: scrollCtrl,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: hubs
              .map(
                (h) => Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () => onSelect(h),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: selected.id == h.id
                            ? AppColors.primary
                            : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: selected.id == h.id
                              ? AppColors.primary
                              : AppColors.divider,
                        ),
                        boxShadow: selected.id == h.id
                            ? [
                                BoxShadow(
                                  color: AppColors.primary.withValues(
                                    alpha: 0.25,
                                  ),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ]
                            : null,
                      ),
                      child: Text(
                        h.name,
                        style: AppTextStyles.caption.copyWith(
                          fontWeight: FontWeight.w700,
                          color: selected.id == h.id
                              ? Colors.white
                              : AppColors.onSurface,
                        ),
                      ),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Full hub content — hero + stats + growth + seeds/nutrition/irrigation +
//                    common mistakes + advisory + FAQ
// ──────────────────────────────────────────────────────────────────────────────
class HubContentWidget extends StatelessWidget {
  final HubModel hub;
  const HubContentWidget({super.key, required this.hub});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Hero
        _HeroSection(hub: hub),
        const SizedBox(height: 16),

        // Quick stat cards
        _CropStatCards(hub: hub),
        const SizedBox(height: 24),

        // Growth Journey
        if (hub.growthStages.isNotEmpty) ...[
          _GrowthJourneySection(hub: hub),
          const SizedBox(height: 24),
        ],

        // Seeds | Nutrition | Irrigation row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              _SeedsCard(hub: hub),
              const SizedBox(height: 16),
              _NutritionCard(hub: hub),
              const SizedBox(height: 16),
              _IrrigationCard(hub: hub),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Common Mistakes
        if (hub.commonMistakes.isNotEmpty) ...[
          _CommonMistakesSection(hub: hub),
          const SizedBox(height: 24),
        ],

        // Advisory
        _AdvisorySection(hub: hub),
        const SizedBox(height: 24),

        // Expert FAQ
        _FaqSection(hub: hub),
        const SizedBox(height: 80),
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Hero Section
// ──────────────────────────────────────────────────────────────────────────────
class _HeroSection extends StatelessWidget {
  final HubModel hub;
  const _HeroSection({required this.hub});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 260,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Background image
          hub.heroImage.isNotEmpty
              ? CachedNetworkImage(
                  memCacheWidth: 1000,
                  imageUrl: hub.heroImage,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => Container(
                    color: AppColors.primary.withValues(alpha: 0.3),
                  ),
                )
              : Container(color: AppColors.primary.withValues(alpha: 0.3)),
          // Gradient overlay
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.45),
                  Colors.black.withValues(alpha: 0.85),
                ],
                stops: const [0.0, 0.5, 1.0],
              ),
            ),
          ),
          // Text content
          Positioned(
            left: 20,
            right: 20,
            bottom: 20,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'FEATURED CROP',
                    style: AppTextStyles.caption.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${hub.name} Hub',
                  style: AppTextStyles.heading1.copyWith(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  hub.tagline,
                  style: AppTextStyles.body.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 13,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Crop Stat Cards (Climate / Soil / Water / Season)
// ──────────────────────────────────────────────────────────────────────────────
class _CropStatCards extends StatelessWidget {
  final HubModel hub;
  const _CropStatCards({required this.hub});

  @override
  Widget build(BuildContext context) {
    final stats = [
      _Stat(
        'Climate',
        hub.idealClimate ?? 'Tropical',
        Icons.wb_sunny_outlined,
        const Color(0xFFFFF3E0),
        const Color(0xFFE65100),
      ),
      _Stat(
        'Soil Type',
        hub.soilType ?? 'Loamy',
        Icons.landscape_outlined,
        const Color(0xFFFFF8E1),
        const Color(0xFF5D4037),
      ),
      _Stat(
        'Water Needs',
        hub.waterNeeds ?? 'Moderate',
        Icons.water_drop_outlined,
        const Color(0xFFE3F2FD),
        const Color(0xFF1565C0),
      ),
      _Stat(
        'Best Season',
        hub.bestSeason ?? 'Spring',
        Icons.event_outlined,
        const Color(0xFFE8F5E9),
        AppColors.primary,
      ),
    ];

    return SizedBox(
      height: 110,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: stats.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          final s = stats[i];
          return Container(
            width: 130,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.divider),
              boxShadow: [
                BoxShadow(
                  color: AppColors.cardShadow,
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: s.bgColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(s.icon, color: s.iconColor, size: 20),
                ),
                const SizedBox(height: 6),
                Text(
                  s.label,
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.onSurfaceVariant,
                    fontWeight: FontWeight.w900,
                    fontSize: 9,
                    letterSpacing: 0.8,
                  ),
                ),
                Text(
                  s.value,
                  style: AppTextStyles.caption.copyWith(
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Stat {
  final String label;
  final String value;
  final IconData icon;
  final Color bgColor;
  final Color iconColor;
  const _Stat(this.label, this.value, this.icon, this.bgColor, this.iconColor);
}

// ──────────────────────────────────────────────────────────────────────────────
// Growth Journey
// ──────────────────────────────────────────────────────────────────────────────
class _GrowthJourneySection extends StatelessWidget {
  final HubModel hub;
  const _GrowthJourneySection({required this.hub});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Growth Journey',
                      style: AppTextStyles.heading2.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      'FROM SEED TO HARVEST',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.onSurfaceVariant,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.primaryContainer.withValues(alpha: 0.5),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.eco_outlined,
                      size: 14,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Complete Cycle',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w900,
                        fontSize: 9,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 200,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: hub.growthStages.length,
              separatorBuilder: (_, _) => _StageConnector(),
              itemBuilder: (_, i) {
                final stage = hub.growthStages[i];
                return _GrowthStageCard(stage: stage, index: i);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StageConnector extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(width: 24, height: 2, color: AppColors.divider),
    );
  }
}

class _GrowthStageCard extends StatelessWidget {
  final HubGrowthStageModel stage;
  final int index;
  const _GrowthStageCard({required this.stage, required this.index});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 160,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Step number circle
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: AppColors.primary,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.35),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Center(
              child: Text(
                '${index + 1}',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  stage.phase,
                  style: AppTextStyles.bodyMedium.copyWith(fontSize: 12),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          Container(
            margin: const EdgeInsets.only(top: 2, bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.secondaryContainer.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              stage.duration,
              style: AppTextStyles.caption.copyWith(
                fontSize: 9,
                fontWeight: FontWeight.w900,
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ),
          Text(
            stage.description,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.onSurfaceVariant,
              fontSize: 10,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const Spacer(),
          if (stage.products.isNotEmpty) ...[
            Text(
              'PRODUCTS',
              style: AppTextStyles.caption.copyWith(
                color: AppColors.primary,
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: stage.products
                  .take(2)
                  .map(
                    (p) => Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceVariant,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        p,
                        style: AppTextStyles.caption.copyWith(fontSize: 9),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Seeds Card
// ──────────────────────────────────────────────────────────────────────────────
class _SeedsCard extends StatelessWidget {
  final HubModel hub;
  const _SeedsCard({required this.hub});

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      title: 'Premium Seeds',
      icon: Icons.eco_outlined,
      iconBg: AppColors.primaryContainer.withValues(alpha: 0.3),
      iconColor: AppColors.primary,
      child: Column(
        children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 0.85,
            children: hub.seeds
                .map(
                  (seed) => GestureDetector(
                    onTap: () => context.go(
                      '/marketplace?search=${Uri.encodeComponent(seed.name)}',
                    ),
                    child: _SeedTile(seed: seed),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => context.go('/marketplace?category=seeds'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(double.infinity, 44),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              side: const BorderSide(color: AppColors.divider),
            ),
            child: Text(
              'VIEW ALL SEEDS',
              style: AppTextStyles.caption.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SeedTile extends StatelessWidget {
  final HubSeedModel seed;
  const _SeedTile({required this.seed});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: seed.img.isNotEmpty
                ? CachedNetworkImage(
                    memCacheWidth: 1000,
                    imageUrl: seed.img,
                    fit: BoxFit.cover,
                    width: double.infinity,
                    errorWidget: (_, _, _) => Container(
                      color: AppColors.primaryContainer.withValues(alpha: 0.2),
                      child: const Icon(Icons.eco, color: AppColors.primary),
                    ),
                  )
                : Container(
                    color: AppColors.primaryContainer.withValues(alpha: 0.2),
                    child: const Icon(Icons.eco, color: AppColors.primary),
                  ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          seed.name,
          style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w700),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        Text(
          '₹${seed.price.toStringAsFixed(0)}/unit',
          style: AppTextStyles.caption.copyWith(
            color: AppColors.secondary,
            fontWeight: FontWeight.w900,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Nutrition Card
// ──────────────────────────────────────────────────────────────────────────────
class _NutritionCard extends StatelessWidget {
  final HubModel hub;
  const _NutritionCard({required this.hub});

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      title: 'Targeted Nutrition',
      icon: Icons.science_outlined,
      iconBg: AppColors.primaryContainer.withValues(alpha: 0.3),
      iconColor: AppColors.primary,
      child: Column(
        children: [
          ...hub.nutrition.map(
            (item) => GestureDetector(
              onTap: () => context.go(
                '/marketplace?search=${Uri.encodeComponent(item.name)}',
              ),
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.transparent),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.divider),
                      ),
                      child: Icon(
                        _nutritionIcon(item.icon),
                        color: AppColors.primary,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.name,
                            style: AppTextStyles.caption.copyWith(
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.3,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            item.desc,
                            style: AppTextStyles.caption.copyWith(
                              color: AppColors.onSurfaceVariant,
                              fontSize: 10,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right,
                      size: 16,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          FilledButton(
            onPressed: () => context.go('/marketplace?category=fertilizers'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size(double.infinity, 44),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              'EXPLORE FERTILIZERS',
              style: AppTextStyles.caption.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Irrigation Card
// ──────────────────────────────────────────────────────────────────────────────
class _IrrigationCard extends StatelessWidget {
  final HubModel hub;
  const _IrrigationCard({required this.hub});

  @override
  Widget build(BuildContext context) {
    final irr = hub.irrigation;
    return _SectionCard(
      title: 'Irrigation Tools',
      icon: Icons.water_drop_outlined,
      iconBg: const Color(0xFFE3F2FD),
      iconColor: const Color(0xFF1565C0),
      child: Column(
        children: [
          // Image
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: 130,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (irr.image.isNotEmpty)
                    CachedNetworkImage(
                      memCacheWidth: 1000,
                      imageUrl: irr.image,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => Container(
                        color: AppColors.primary.withValues(alpha: 0.15),
                      ),
                    )
                  else
                    Container(color: AppColors.primary.withValues(alpha: 0.15)),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.55),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 12,
                    bottom: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        'SYSTEM SETUP',
                        style: AppTextStyles.caption.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 9,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Items list
          ...irr.items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    item.name,
                    style: AppTextStyles.body.copyWith(
                      color: AppColors.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    item.price,
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.secondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Common Mistakes Section (dark card)
// ──────────────────────────────────────────────────────────────────────────────
class _CommonMistakesSection extends StatelessWidget {
  final HubModel hub;
  const _CommonMistakesSection({required this.hub});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.onSurface,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: Colors.red.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.close, color: Colors.red, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        'PRO TIP — AVOID',
                        style: AppTextStyles.caption.copyWith(
                          color: Colors.red.shade300,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.8,
                          fontSize: 9,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Mistakes to Avoid',
              style: AppTextStyles.heading2.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Common agronomy mistakes for ${hub.name.toLowerCase()} farming.',
              style: AppTextStyles.body.copyWith(
                color: Colors.white.withValues(alpha: 0.6),
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 16),
            ...hub.commonMistakes.map(
              (m) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.1),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 22,
                      height: 22,
                      margin: const EdgeInsets.only(top: 1),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.15),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close,
                        color: Colors.red,
                        size: 12,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        m,
                        style: AppTextStyles.body.copyWith(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Advisory Section
// ──────────────────────────────────────────────────────────────────────────────
class _AdvisorySection extends StatelessWidget {
  final HubModel hub;
  const _AdvisorySection({required this.hub});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: const Icon(
                    Icons.check_circle_outline,
                    color: AppColors.primary,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              'AGRONOMY ALERT',
                              style: AppTextStyles.caption.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w900,
                                fontSize: 9,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                              color: AppColors.warning,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              hub.advisory.title,
              style: AppTextStyles.heading2.copyWith(
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              hub.advisory.description,
              style: AppTextStyles.body.copyWith(
                color: AppColors.onSurfaceVariant,
                fontSize: 13,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => launchUrl(
                      Uri.parse('https://wa.me/919876543210'),
                      mode: LaunchMode.externalApplication,
                    ),
                    icon: const Icon(Icons.chat_outlined, size: 18),
                    label: const Text('Consult Specialist'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// FAQ Section
// ──────────────────────────────────────────────────────────────────────────────
class _FaqSection extends StatelessWidget {
  final HubModel hub;
  const _FaqSection({required this.hub});

  @override
  Widget build(BuildContext context) {
    final faqs = [
      _Faq(
        'When is the best time to plant ${hub.name}?',
        'The best time to plant ${hub.name} is during ${hub.bestSeason?.toLowerCase() ?? 'early spring'} when soil temperatures are ideal for germination and root development.',
      ),
      _Faq(
        'How often should I water ${hub.name}?',
        '${hub.name} requires ${hub.waterNeeds?.toLowerCase() ?? 'moderate'} watering. Monitor soil moisture closely and avoid both over-watering and under-watering.',
      ),
      _Faq(
        'What soil type is ideal for ${hub.name}?',
        '${hub.name} grows best in ${hub.soilType?.toLowerCase() ?? 'well-drained'} soil with good organic matter content and proper drainage.',
      ),
      _Faq(
        'What climate does ${hub.name} prefer?',
        '${hub.name} thrives in ${hub.idealClimate?.toLowerCase() ?? 'tropical'} conditions. Protect crops from extreme temperatures and frost.',
      ),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: AppColors.divider),
          boxShadow: [
            BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Farmers\' Wisdom',
              style: AppTextStyles.heading2.copyWith(
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              'ESSENTIAL KNOWLEDGE FOR ${hub.name.toUpperCase()}',
              style: AppTextStyles.caption.copyWith(
                color: AppColors.onSurfaceVariant,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                fontSize: 9,
              ),
            ),
            const SizedBox(height: 16),
            ...faqs.map(
              (faq) => Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.divider),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Center(
                            child: Text(
                              'Q',
                              style: AppTextStyles.caption.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            faq.question,
                            style: AppTextStyles.bodyMedium.copyWith(
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.only(left: 30),
                      child: Text(
                        faq.answer,
                        style: AppTextStyles.body.copyWith(
                          color: AppColors.onSurfaceVariant,
                          fontSize: 12,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Faq {
  final String question;
  final String answer;
  const _Faq(this.question, this.answer);
}

// ──────────────────────────────────────────────────────────────────────────────
// Reusable section card wrapper
// ──────────────────────────────────────────────────────────────────────────────
class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final Widget child;

  const _SectionCard({
    required this.title,
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: AppTextStyles.heading3.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ──────────────────────────────────────────────────────────────────────────────
class _HubsLoading extends StatelessWidget {
  const _HubsLoading();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(64),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppColors.primary),
            SizedBox(height: 16),
            Text('Loading Crop Hubs…'),
          ],
        ),
      ),
    );
  }
}
