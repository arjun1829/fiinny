import 'dart:math' as math;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/brand_model.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/store_focus_route.dart';
import '../../../core/widgets/error_view.dart';
import '../../marketplace/providers/marketplace_provider.dart';
import '../../marketplace/widgets/review_sheet.dart';
import '../data/brand_repository.dart';

final _brandRepo = BrandRepository();

final _brandProvider = FutureProvider.family<BrandModel?, String>((ref, phone) {
  return _brandRepo.fetchBrandByPhone(phone);
});

final _brandProductsProvider =
    FutureProvider.family<List<CatalogModel>, String>((ref, phone) {
      return _brandRepo.fetchBrandProducts(phone);
});

final _brandRetailersProvider =
    FutureProvider.family<List<BrandRetailerModel>, String>((ref, phone) {
      return _brandRepo.fetchBrandRetailers(phone);
});

Future<void> _launchExternal(String? urlString) async {
  if (urlString == null || urlString.isEmpty) return;
  var s = urlString.trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) s = 'https://$s';
  final uri = Uri.tryParse(s);
  if (uri != null && await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

Future<void> _callNumber(String? phone) async {
  if (phone == null || phone.isEmpty) return;
  final uri = Uri(scheme: 'tel', path: phone);
  if (await canLaunchUrl(uri)) await launchUrl(uri);
}

/// Sends the buyer to the Store tab's own map, focused on this location,
/// instead of jumping straight to the external Google Maps app — reuses the
/// single in-app map + directions flow shared by product/brand/search taps.
void _openDirections(
  BuildContext context,
  WidgetRef ref, {
  required String name,
  String? phone,
  double? lat,
  double? lng,
  String? query,
}) {
  context.go(
    storeFocusRoute(
      name: name,
      phone: phone,
      address: query,
      lat: lat,
      lng: lng,
    ),
  );
}

/// Extracts a YouTube video id from either a bare 11-char id (how the brand
/// editor stores them, matching web) or any youtube.com / youtu.be URL.
String? _youtubeId(String raw) {
  final s = raw.trim();
  if (RegExp(r'^[\w-]{11}$').hasMatch(s)) return s;
  final uri = Uri.tryParse(s);
  if (uri == null) return null;
  if (uri.host.contains('youtu.be') && uri.pathSegments.isNotEmpty) {
    return uri.pathSegments.first;
  }
  final v = uri.queryParameters['v'];
  if (v != null && v.isNotEmpty) return v;
  final segs = uri.pathSegments;
  final embedIdx = segs.indexOf('embed');
  if (embedIdx != -1 && embedIdx + 1 < segs.length) return segs[embedIdx + 1];
  if (segs.length >= 2 && segs.first == 'shorts') return segs[1];
  return null;
}

class BrandScreen extends ConsumerWidget {
  final String manufacturerPhone;
  const BrandScreen({super.key, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brandAsync = ref.watch(_brandProvider(manufacturerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: brandAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const ErrorView(message: 'Brand not found.'),
        data: (brand) {
          if (brand == null) return const ErrorView(message: 'Brand not found.');

          return DefaultTabController(
            length: 4,
            child: NestedScrollView(
              headerSliverBuilder: (context, innerBoxIsScrolled) {
                return [
                  _BrandHero(brand: brand),
                  SliverToBoxAdapter(
                    child: _BrandStatsHeader(
                      brand: brand,
                      manufacturerPhone: manufacturerPhone,
                    ),
                  ),
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _SliverAppBarDelegate(
                      const TabBar(
                        labelColor: AppColors.primary,
                        unselectedLabelColor: AppColors.onSurfaceVariant,
                        indicatorColor: AppColors.primary,
                        indicatorWeight: 3,
                        isScrollable: false,
                        labelStyle: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w700),
                        tabs: [
                          Tab(text: 'About'),
                          Tab(text: 'Products'),
                          Tab(text: 'Dealers'),
                          Tab(text: 'Reviews'),
                        ],
                      ),
                    ),
                  ),
                ];
              },
              body: TabBarView(
                children: [
                  _AboutTab(brand: brand),
                  _ProductsTab(manufacturerPhone: manufacturerPhone),
                  _RetailersTab(
                      brand: brand, manufacturerPhone: manufacturerPhone),
                  _ReviewsTab(brand: brand),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Hero: banner + verified badge + logo + name + tagline ───────────────────

class _BrandHero extends StatelessWidget {
  final BrandModel brand;
  const _BrandHero({required this.brand});

  @override
  Widget build(BuildContext context) {
    return SliverAppBar(
      expandedHeight: 300,
      pinned: true,
      backgroundColor: const Color(0xFF0A1F08),
      foregroundColor: Colors.white,
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            // Web hero base: deep-green gradient; banner faded over it at 30%
            // (web: opacity-30 mix-blend-overlay) so it never fights the text.
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF0A1F08),
                    Color(0xFF1A3D14),
                    Color(0xFF122B10),
                  ],
                ),
              ),
            ),
            if (brand.banner != null)
              Opacity(
                opacity: 0.30,
                child: CachedNetworkImage(
                  memCacheWidth: 1200,
                  imageUrl: brand.banner!,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
            // Bottom scrim to anchor the badge/name/tagline block.
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.55),
                  ],
                ),
              ),
            ),
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.verified_rounded,
                          color: Colors.amber, size: 16),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          'Verified Manufacturer on KrishiDukan',
                          style: AppTextStyles.caption.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            shadows: const [
                              Shadow(color: Colors.black54, blurRadius: 4),
                            ],
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      // Logo card — rounded square + object-contain like web,
                      // so wide/rectangular logos aren't cropped by a circle.
                      Container(
                        width: 76,
                        height: 76,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                              color: Colors.white.withValues(alpha: 0.35),
                              width: 3),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.25),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: brand.logo != null
                            ? CachedNetworkImage(
                                memCacheWidth: 400,
                                imageUrl: brand.logo!,
                                fit: BoxFit.contain,
                                errorWidget: (_, _, _) => const Icon(
                                    Icons.business,
                                    size: 36,
                                    color: AppColors.primaryLight),
                              )
                            : const Icon(Icons.business,
                                size: 36, color: AppColors.primaryLight),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              brand.businessName,
                              style: AppTextStyles.heading2.copyWith(
                                color: Colors.white,
                                shadows: const [
                                  Shadow(color: Colors.black45, blurRadius: 4),
                                ],
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (brand.tagline != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                brand.tagline!,
                                style: AppTextStyles.bodyMedium.copyWith(
                                  color: Colors.white70,
                                  fontStyle: FontStyle.italic,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Stats header: rating · meta row · social proof · stats ─────────────────

class _BrandStatsHeader extends ConsumerWidget {
  final BrandModel brand;
  final String manufacturerPhone;
  const _BrandStatsHeader({required this.brand, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productsAsync = ref.watch(_brandProductsProvider(manufacturerPhone));
    final retailersAsync = ref.watch(_brandRetailersProvider(manufacturerPhone));
    final reviewsAsync = ref.watch(storeReviewsProvider(brand.phone));

    final reviews = reviewsAsync.value ?? const [];
    final avgRating = reviews.isEmpty
        ? 0.0
        : reviews.fold<double>(0, (s, r) => s + r.rating) / reviews.length;

    String stat(AsyncValue<List<dynamic>> a) =>
        a.hasValue ? '${a.value!.length}' : '—';

    // Continues the hero's deep-green gradient so hero + stats read as one
    // branded block, exactly like the web brand hero.
    return Container(
      color: const Color(0xFF122B10),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Meta row: rating chip · location · Est. · website
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (reviews.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: Colors.white.withValues(alpha: 0.20)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.star_rounded,
                          size: 16, color: Colors.amber),
                      const SizedBox(width: 4),
                      Text(
                        '${avgRating.toStringAsFixed(1)} · ${reviews.length} review${reviews.length == 1 ? '' : 's'}',
                        style: AppTextStyles.caption.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              if (brand.location != null && brand.location!.isNotEmpty)
                _MetaChip(
                  icon: Icons.location_on_outlined,
                  label: brand.location!,
                  onTap: () => _openDirections(
                    context,
                    ref,
                    name: brand.businessName,
                    phone: manufacturerPhone,
                    lat: brand.lat,
                    lng: brand.lng,
                    query: brand.location,
                  ),
                ),
              if (brand.establishedYear != null)
                _MetaChip(
                  icon: Icons.history,
                  label: 'Est. ${brand.establishedYear}',
                ),
              if (brand.website != null)
                _MetaChip(
                  icon: Icons.language,
                  label: 'Website',
                  onTap: () => _launchExternal(brand.website),
                ),
            ],
          ),

          // Social proof (web: "🏆 Highly in Demand!" + amber subtitle)
          if (brand.socialProof != null) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                const Text('🏆', style: TextStyle(fontSize: 24)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Highly in Demand!',
                          style: AppTextStyles.bodyMedium.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w800)),
                      Text(
                        brand.socialProof!,
                        style: AppTextStyles.caption.copyWith(
                            color: const Color(0xFFFCD34D),
                            fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],

          // Stats row: Products | Dealers | Years (web hero stats)
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              border: Border.symmetric(
                horizontal: BorderSide(
                    color: Colors.white.withValues(alpha: 0.15)),
              ),
            ),
            child: Row(
              children: [
                _StatCell(value: stat(productsAsync), label: 'Products'),
                _statDivider(),
                _StatCell(value: stat(retailersAsync), label: 'Dealers'),
                _statDivider(),
                _StatCell(
                  value: brand.yearsActive != null
                      ? '${brand.yearsActive}+'
                      : '—',
                  label: 'Years',
                ),
              ],
            ),
          ),

          // Certifications (web: leaf icon + white/70 text, inside the hero)
          if (brand.certifications.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: brand.certifications
                  .map((cert) => Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.eco,
                              size: 14, color: Color(0xFF4ADE80)),
                          const SizedBox(width: 5),
                          Text(cert,
                              style: AppTextStyles.caption.copyWith(
                                  color:
                                      Colors.white.withValues(alpha: 0.75),
                                  fontWeight: FontWeight.w600)),
                        ],
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _statDivider() => Container(
      width: 1, height: 34, color: Colors.white.withValues(alpha: 0.15));
}

class _StatCell extends StatelessWidget {
  final String value;
  final String label;
  const _StatCell({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value,
              style: AppTextStyles.heading2.copyWith(
                  color: Colors.white, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(label.toUpperCase(),
              style: AppTextStyles.caption.copyWith(
                  color: Colors.white.withValues(alpha: 0.5),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  fontSize: 10)),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  const _MetaChip({required this.icon, required this.label, this.onTap});

  @override
  Widget build(BuildContext context) {
    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: Colors.amber),
        const SizedBox(width: 4),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 180),
          child: Text(
            label,
            style: AppTextStyles.caption.copyWith(
              color: Colors.white.withValues(alpha: 0.75),
              fontWeight: FontWeight.w600,
              decoration: onTap != null ? TextDecoration.underline : null,
              decorationColor: Colors.white38,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
    return onTap != null ? GestureDetector(onTap: onTap, child: content) : content;
  }
}

// ─── About tab ───────────────────────────────────────────────────────────────

class _AboutTab extends ConsumerWidget {
  final BrandModel brand;
  const _AboutTab({required this.brand});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Quick actions: Call, Call 2, Email, Website, Directions
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _QuickActionCard(
              icon: Icons.phone_outlined,
              label: 'Call',
              onTap: () => _callNumber(brand.phone),
            ),
            if (brand.secondaryPhone.isNotEmpty)
              _QuickActionCard(
                icon: Icons.phone_forwarded_outlined,
                label: 'Call 2',
                onTap: () => _callNumber(brand.secondaryPhone),
              ),
            if (brand.email != null)
              _QuickActionCard(
                icon: Icons.email_outlined,
                label: 'Email',
                onTap: () async {
                  final uri = Uri(scheme: 'mailto', path: brand.email!);
                  if (await canLaunchUrl(uri)) await launchUrl(uri);
                },
              ),
            if (brand.website != null)
              _QuickActionCard(
                icon: Icons.language,
                label: 'Website',
                onTap: () => _launchExternal(brand.website),
              ),
            if (brand.hasGeo ||
                (brand.location != null && brand.location!.isNotEmpty))
              _QuickActionCard(
                icon: Icons.directions_outlined,
                label: 'Directions',
                onTap: () => _openDirections(
                  context,
                  ref,
                  name: brand.businessName,
                  phone: brand.phone,
                  lat: brand.lat,
                  lng: brand.lng,
                  query: brand.fullAddress ?? brand.location,
                ),
              ),
          ],
        ),
        const SizedBox(height: 24),

        // About
        if (brand.about != null) ...[
          Text('About Us', style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          Text(brand.about!,
              style: AppTextStyles.body
                  .copyWith(color: AppColors.onSurfaceVariant, height: 1.5)),
          const SizedBox(height: 24),
        ],

        // Address
        if ((brand.fullAddress != null && brand.fullAddress!.isNotEmpty) ||
            (brand.location != null && brand.location!.isNotEmpty)) ...[
          _InfoTile(
            icon: Icons.location_on_rounded,
            title: 'Headquarters',
            subtitle: brand.fullAddress ?? brand.location!,
          ),
          const SizedBox(height: 16),
        ],

        if (brand.establishedYear != null) ...[
          _InfoTile(
            icon: Icons.history,
            title: 'Established',
            subtitle: brand.establishedYear!,
          ),
          const SizedBox(height: 24),
        ],

        // Videos rail (web: "See the Results" — YouTube embeds)
        if (brand.videos.isNotEmpty) ...[
          Text('See the Results', style: AppTextStyles.heading3),
          const SizedBox(height: 4),
          Text(
            'Farmers share their experience with ${brand.businessName}',
            style: AppTextStyles.caption
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 210,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: brand.videos.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (_, i) => _VideoCard(raw: brand.videos[i]),
            ),
          ),
          const SizedBox(height: 24),
        ],

        // Social links
        if (brand.socialLinks != null) ...[
          Text('Follow Us', style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: brand.socialLinks!.entries
                .map((e) => ActionChip(
                      avatar: const Icon(Icons.link,
                          size: 16, color: Colors.white),
                      label: Text(e.key.toUpperCase(),
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold)),
                      backgroundColor: AppColors.primary,
                      onPressed: () => _launchExternal(e.value),
                    ))
                .toList(),
          ),
          const SizedBox(height: 40),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

class _VideoCard extends StatelessWidget {
  final String raw;
  const _VideoCard({required this.raw});

  @override
  Widget build(BuildContext context) {
    final id = _youtubeId(raw);
    final thumbUrl =
        id != null ? 'https://img.youtube.com/vi/$id/hqdefault.jpg' : null;
    final watchUrl =
        id != null ? 'https://www.youtube.com/watch?v=$id' : raw;

    return GestureDetector(
      onTap: () => _launchExternal(watchUrl),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          width: 130,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (thumbUrl != null)
                CachedNetworkImage(
                  imageUrl: thumbUrl,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) =>
                      Container(color: Colors.black87),
                )
              else
                Container(color: Colors.black87),
              Container(color: Colors.black.withValues(alpha: 0.25)),
              const Center(
                child: Icon(Icons.play_circle_fill,
                    color: Colors.white, size: 44),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _InfoTile(
      {required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
              color: AppColors.primaryLight.withValues(alpha: 0.2),
              shape: BoxShape.circle),
          child: Icon(icon, color: AppColors.primary),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.onSurfaceVariant)),
              const SizedBox(height: 4),
              Text(subtitle, style: AppTextStyles.bodyMedium, softWrap: true),
            ],
          ),
        ),
      ],
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickActionCard(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 96,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.surfaceVariant),
          boxShadow: [
            BoxShadow(
                color: AppColors.cardShadow,
                blurRadius: 4,
                offset: const Offset(0, 2))
          ],
        ),
        child: Column(
          children: [
            Icon(icon, color: AppColors.primary, size: 26),
            const SizedBox(height: 8),
            Text(label,
                style: AppTextStyles.bodySmall
                    .copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

// ─── Products tab ────────────────────────────────────────────────────────────

class _ProductsTab extends ConsumerWidget {
  final String manufacturerPhone;
  const _ProductsTab({required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncProducts = ref.watch(_brandProductsProvider(manufacturerPhone));

    return asyncProducts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const ErrorView(message: 'Could not load products.'),
      data: (products) {
        if (products.isEmpty) {
          return const Center(
              child: Text('No products available.',
                  style: TextStyle(color: AppColors.onSurfaceVariant)));
        }
        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            childAspectRatio: 0.75,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
          ),
          itemCount: products.length,
          itemBuilder: (_, i) => _BrandProductCard(
            product: products[i],
            onTap: () => context.push('/product/${products[i].id}'),
          ),
        );
      },
    );
  }
}

// ─── Dealers tab ─────────────────────────────────────────────────────────────

class _RetailersTab extends ConsumerStatefulWidget {
  final BrandModel brand;
  final String manufacturerPhone;
  const _RetailersTab(
      {required this.brand, required this.manufacturerPhone});

  @override
  ConsumerState<_RetailersTab> createState() => _RetailersTabState();
}

class _RetailersTabState extends ConsumerState<_RetailersTab> {
  // Web caps the dealer panel and hints "scroll to see all"; the mobile
  // equivalent is a short initial list with an explicit expander, so a big
  // network (60+ dealers) doesn't read as one endless scroll.
  static const _initialCount = 8;
  bool _showAll = false;

  @override
  Widget build(BuildContext context) {
    final asyncRetailers =
        ref.watch(_brandRetailersProvider(widget.manufacturerPhone));

    return asyncRetailers.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const ErrorView(message: 'Could not load dealers.'),
      data: (retailers) {
        if (retailers.isEmpty) {
          return const Center(
              child: Text('No dealers found.',
                  style: TextStyle(color: AppColors.onSurfaceVariant)));
        }

        final visible = _showAll
            ? retailers
            : retailers.take(_initialCount).toList();
        final hiddenCount = retailers.length - visible.length;

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Map — this manufacturer's own location + ONLY their dealers,
            // never the global store locator. _brandRetailersProvider already
            // scopes to manufacturerRetailers where manufacturerPhone ==
            // this brand, so `retailers` here is correctly pre-filtered.
            _DealerNetworkMap(brand: widget.brand, retailers: retailers),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Where to Find Us — ${retailers.length} dealer${retailers.length == 1 ? '' : 's'}',
                style: AppTextStyles.heading3,
              ),
            ),
            for (final r in visible) ...[
              _RetailerCard(retailer: r),
              const SizedBox(height: 12),
            ],
            if (hiddenCount > 0)
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: const BorderSide(color: AppColors.primary),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () => setState(() => _showAll = true),
                icon: const Icon(Icons.expand_more_rounded),
                label: Text('Show all ${retailers.length} dealers'),
              )
            else if (_showAll && retailers.length > _initialCount)
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.onSurfaceVariant,
                  side: const BorderSide(color: AppColors.surfaceVariant),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () => setState(() => _showAll = false),
                icon: const Icon(Icons.expand_less_rounded),
                label: const Text('Show less'),
              ),
            const SizedBox(height: 24),
          ],
        );
      },
    );
  }
}

/// Google Map scoped to ONE manufacturer's own network — a green pin for the
/// manufacturer itself plus a red pin per dealer, never the global store
/// locator. Auto-fits the camera to whatever points actually have geo data;
/// renders nothing if none do (e.g. dealers pending address setup).
class _DealerNetworkMap extends StatefulWidget {
  final BrandModel brand;
  final List<BrandRetailerModel> retailers;
  const _DealerNetworkMap({required this.brand, required this.retailers});

  @override
  State<_DealerNetworkMap> createState() => _DealerNetworkMapState();
}

class _DealerNetworkMapState extends State<_DealerNetworkMap> {
  GoogleMapController? _controller;

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final points = <LatLng>[
      if (widget.brand.hasGeo)
        LatLng(widget.brand.lat!, widget.brand.lng!),
      for (final r in widget.retailers)
        if (r.hasLocation) LatLng(r.lat!, r.lng!),
    ];
    if (points.isEmpty) return const SizedBox.shrink();

    final markers = <Marker>{
      if (widget.brand.hasGeo)
        Marker(
          markerId: const MarkerId('__manufacturer__'),
          position: LatLng(widget.brand.lat!, widget.brand.lng!),
          icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueGreen),
          infoWindow: InfoWindow(
            title: widget.brand.businessName,
            snippet: 'Manufacturer',
          ),
          zIndexInt: 2,
        ),
      for (final r in widget.retailers)
        if (r.hasLocation)
          Marker(
            markerId: MarkerId(r.phone),
            position: LatLng(r.lat!, r.lng!),
            icon: BitmapDescriptor.defaultMarkerWithHue(
                BitmapDescriptor.hueRed),
            infoWindow: InfoWindow(
              title: r.displayName,
              snippet: r.locationLabel,
            ),
          ),
    };

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: 220,
        child: Stack(
          children: [
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: points.first,
                zoom: 11,
              ),
              markers: markers,
              onMapCreated: (c) {
                _controller = c;
                if (points.length > 1) _fitBounds(points);
              },
              zoomControlsEnabled: false,
              myLocationButtonEnabled: false,
              mapToolbarEnabled: false,
              compassEnabled: false,
              rotateGesturesEnabled: false,
              tiltGesturesEnabled: false,
            ),
            // Legend — matches the web brand page's map key.
            Positioned(
              left: 10,
              bottom: 10,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _legendDot(const Color(0xFF15803D)),
                    const SizedBox(width: 4),
                    Text('Manufacturer', style: AppTextStyles.caption),
                    const SizedBox(width: 10),
                    _legendDot(const Color(0xFFDC2626)),
                    const SizedBox(width: 4),
                    Text('Dealers', style: AppTextStyles.caption),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _legendDot(Color color) => Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );

  /// Zooms/pans to fit every pin. Guarded by a post-frame delay — calling
  /// animateCamera immediately in onMapCreated can race the map's own layout
  /// on some devices and silently no-op.
  Future<void> _fitBounds(List<LatLng> points) async {
    double minLat = points.first.latitude, maxLat = points.first.latitude;
    double minLng = points.first.longitude, maxLng = points.first.longitude;
    for (final p in points) {
      minLat = math.min(minLat, p.latitude);
      maxLat = math.max(maxLat, p.latitude);
      minLng = math.min(minLng, p.longitude);
      maxLng = math.max(maxLng, p.longitude);
    }
    await Future.delayed(const Duration(milliseconds: 200));
    if (!mounted || _controller == null) return;
    await _controller!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        48,
      ),
    );
  }
}

// ─── Reviews tab (synced with web ReviewSection — storeReviews collection) ───

class _ReviewsTab extends ConsumerWidget {
  final BrandModel brand;
  const _ReviewsTab({required this.brand});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewsAsync = ref.watch(storeReviewsProvider(brand.phone));
    final userReviewAsync = ref.watch(userStoreReviewProvider(brand.phone));
    final userReview = userReviewAsync.value;

    return reviewsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const ErrorView(message: 'Could not load reviews.'),
      data: (reviews) {
        final avg = reviews.isEmpty
            ? 0.0
            : reviews.fold<double>(0, (s, r) => s + r.rating) /
                reviews.length;

        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Summary + write button
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text(
                      avg.toStringAsFixed(1),
                      style: const TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: List.generate(
                            5,
                            (i) => Icon(
                              i < avg.round()
                                  ? Icons.star
                                  : Icons.star_border,
                              size: 16,
                              color: AppColors.secondary,
                            ),
                          ),
                        ),
                        Text(
                          '${reviews.length} Review${reviews.length == 1 ? '' : 's'}',
                          style: AppTextStyles.bodySmall,
                        ),
                      ],
                    ),
                  ],
                ),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () => showReviewBottomSheet(
                    context: context,
                    ref: ref,
                    storePhone: brand.phone,
                    existingReview: userReview,
                  ),
                  icon: Icon(
                      userReview != null ? Icons.edit : Icons.rate_review,
                      size: 16),
                  label: Text(userReview != null ? 'Edit Review' : 'Write Review'),
                ),
              ],
            ),
            const SizedBox(height: 20),

            if (reviews.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 48),
                child: Column(
                  children: [
                    const Icon(Icons.star_border_outlined,
                        size: 48, color: AppColors.primaryLight),
                    const SizedBox(height: 8),
                    Text('No reviews yet — be the first!',
                        style: AppTextStyles.body
                            .copyWith(color: AppColors.onSurfaceVariant)),
                  ],
                ),
              )
            else
              ...reviews.map((r) => Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: AppColors.surfaceVariant
                              .withValues(alpha: 0.6)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment:
                              MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                r.reviewerName,
                                style: AppTextStyles.bodyMedium
                                    .copyWith(fontWeight: FontWeight.bold),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Row(
                              children: List.generate(
                                5,
                                (i) => Icon(
                                  i < r.rating.round()
                                      ? Icons.star
                                      : Icons.star_border,
                                  size: 14,
                                  color: AppColors.secondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (r.createdAt != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            '${r.createdAt!.day}/${r.createdAt!.month}/${r.createdAt!.year}',
                            style: AppTextStyles.caption
                                .copyWith(color: AppColors.onSurfaceVariant),
                          ),
                        ],
                        if (r.reviewText != null &&
                            r.reviewText!.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(r.reviewText!, style: AppTextStyles.bodySmall),
                        ],
                      ],
                    ),
                  )),
            const SizedBox(height: 24),
          ],
        );
      },
    );
  }
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

class _SliverAppBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar _tabBar;
  _SliverAppBarDelegate(this._tabBar);

  @override
  double get minExtent => _tabBar.preferredSize.height;
  @override
  double get maxExtent => _tabBar.preferredSize.height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Colors.white,
      child: _tabBar,
    );
  }

  @override
  bool shouldRebuild(_SliverAppBarDelegate oldDelegate) {
    return false;
  }
}

class _BrandProductCard extends StatelessWidget {
  final CatalogModel product;
  final VoidCallback onTap;
  const _BrandProductCard({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
                color: AppColors.cardShadow,
                blurRadius: 6,
                offset: const Offset(0, 3))
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(16)),
                child: SizedBox(
                  width: double.infinity,
                  height: double.infinity,
                  child: product.hasImages
                      ? CachedNetworkImage(
                          memCacheWidth: 1000,
                          imageUrl: product.imageUrl,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) => _placeholder(),
                        )
                      : _placeholder(),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.bold),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    CurrencyUtils.format(product.price),
                    style:
                        AppTextStyles.price.copyWith(color: AppColors.primary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder() => Container(
        color: AppColors.surfaceVariant,
        child: const Center(
            child: Icon(Icons.grass, size: 36, color: AppColors.primaryLight)),
      );
}

class _RetailerCard extends ConsumerWidget {
  final BrandRetailerModel retailer;
  const _RetailerCard({required this.retailer});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: AppColors.surfaceVariant.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 4,
              offset: const Offset(0, 2))
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: retailer.logo != null
                  ? CachedNetworkImage(
                      imageUrl: retailer.logo!,
                      width: 52,
                      height: 52,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => _avatar(),
                    )
                  : _avatar(),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    retailer.displayName,
                    style: AppTextStyles.heading3.copyWith(fontSize: 15),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (retailer.locationLabel.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.location_on,
                            size: 14, color: Colors.redAccent),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            retailer.locationLabel,
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.onSurfaceVariant),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 4),
            if (retailer.hasLocation ||
                retailer.locationLabel.isNotEmpty)
              IconButton(
                onPressed: () => _openDirections(
                  context,
                  ref,
                  name: retailer.displayName,
                  phone: retailer.phone,
                  lat: retailer.lat,
                  lng: retailer.lng,
                  query:
                      '${retailer.displayName} ${retailer.locationLabel}',
                ),
                icon: const Icon(Icons.directions_outlined),
                color: AppColors.primary,
                tooltip: 'Directions',
              ),
            IconButton(
              onPressed: () => _callNumber(retailer.phone),
              icon: const Icon(Icons.phone),
              color: AppColors.primary,
              tooltip: 'Call Dealer',
            ),
          ],
        ),
      ),
    );
  }

  Widget _avatar() => Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [AppColors.primaryLight, AppColors.primary]),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
            child: Icon(Icons.storefront, size: 26, color: Colors.white)),
      );
}
