import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/brand_model.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/models/store_model.dart';
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
            length: 3,
            child: NestedScrollView(
              headerSliverBuilder: (context, innerBoxIsScrolled) {
                return [
                  _buildSliverAppBar(context, brand, ref),
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _SliverAppBarDelegate(
                      const TabBar(
                        labelColor: AppColors.primary,
                        unselectedLabelColor: AppColors.onSurfaceVariant,
                        indicatorColor: AppColors.primary,
                        indicatorWeight: 3,
                        tabs: [
                          Tab(text: 'About'),
                          Tab(text: 'Products'),
                          Tab(text: 'Dealers'),
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
                  _RetailersTab(manufacturerPhone: manufacturerPhone),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSliverAppBar(BuildContext context, BrandModel brand, WidgetRef ref) {
    return SliverAppBar(
      expandedHeight: 280,
      pinned: true,
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            if (brand.coverImage != null)
              CachedNetworkImage(
                memCacheWidth: 1000,
                imageUrl: brand.coverImage!,
                fit: BoxFit.cover,
                errorWidget: (_, _, _) => Container(color: AppColors.primary),
              )
            else
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppColors.primary, AppColors.primaryLight],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
              ),
            // Gradient overlay for text readability
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black.withOpacity(0.8)],
                ),
              ),
            ),
            Positioned(
              bottom: 20,
              left: 20,
              right: 20,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Premium Logo Display
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.2),
                          blurRadius: 8,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: ClipOval(
                      child: brand.logo != null
                          ? CachedNetworkImage(
                              memCacheWidth: 1000,
                              imageUrl: brand.logo!,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) => const Icon(Icons.business, size: 40, color: AppColors.primaryLight),
                            )
                          : const Icon(Icons.business, size: 40, color: AppColors.primaryLight),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          brand.businessName,
                          style: AppTextStyles.heading2.copyWith(color: Colors.white, shadows: [const Shadow(color: Colors.black45, blurRadius: 4)]),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (brand.tagline != null && brand.tagline!.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            brand.tagline!,
                            style: AppTextStyles.bodyMedium.copyWith(color: Colors.white70, fontStyle: FontStyle.italic),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
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

class _AboutTab extends StatelessWidget {
  final BrandModel brand;
  const _AboutTab({required this.brand});

  Future<void> _launchUrl(String? urlString) async {
    if (urlString == null || urlString.isEmpty) return;
    final uri = Uri.tryParse(urlString);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _callPhone(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _sendEmail(String? email) async {
    if (email == null || email.isEmpty) return;
    final uri = Uri(scheme: 'mailto', path: email);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Contact & Quick Info Cards
        Row(
          children: [
            if (brand.phone.isNotEmpty)
              Expanded(
                child: _QuickActionCard(
                  icon: Icons.phone_outlined,
                  label: 'Call',
                  onTap: () => _callPhone(brand.phone),
                ),
              ),
            if (brand.email != null && brand.email!.isNotEmpty) ...[
              const SizedBox(width: 12),
              Expanded(
                child: _QuickActionCard(
                  icon: Icons.email_outlined,
                  label: 'Email',
                  onTap: () => _sendEmail(brand.email),
                ),
              ),
            ],
            if (brand.website != null && brand.website!.isNotEmpty) ...[
              const SizedBox(width: 12),
              Expanded(
                child: _QuickActionCard(
                  icon: Icons.language,
                  label: 'Website',
                  onTap: () => _launchUrl(brand.website),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 24),

        // Description
        if (brand.description != null && brand.description!.isNotEmpty) ...[
          Text('About Us', style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          Text(brand.description!, style: AppTextStyles.body.copyWith(color: AppColors.onSurfaceVariant, height: 1.5)),
          const SizedBox(height: 24),
        ],

        // Address & Location Info
        if ((brand.fullAddress != null && brand.fullAddress!.isNotEmpty) || (brand.location != null && brand.location!.isNotEmpty)) ...[
          _InfoTile(
            icon: Icons.location_on_rounded,
            title: 'Headquarters',
            subtitle: brand.fullAddress ?? brand.location!,
          ),
          const SizedBox(height: 16),
        ],

        if (brand.establishedYear != null && brand.establishedYear!.isNotEmpty) ...[
          _InfoTile(
            icon: Icons.history,
            title: 'Established',
            subtitle: brand.establishedYear!,
          ),
          const SizedBox(height: 24),
        ],

        // Achievements
        if (brand.achievements != null && brand.achievements!.isNotEmpty) ...[
          Text('Achievements', style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          ...brand.achievements!.map((ach) => Padding(
            padding: const EdgeInsets.only(bottom: 8.0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.military_tech, color: Colors.orange, size: 24),
                const SizedBox(width: 12),
                Expanded(child: Text(ach, style: AppTextStyles.bodyMedium)),
              ],
            ),
          )),
          const SizedBox(height: 24),
        ],

        // Featured Video
        if (brand.videoLink != null && brand.videoLink!.isNotEmpty) ...[
          Text('Featured Video', style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => _launchUrl(brand.videoLink),
            child: Container(
              height: 160,
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 8, offset: const Offset(0, 4))],
              ),
              child: const Center(
                child: Icon(Icons.play_circle_fill, color: Colors.white, size: 64),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],

        // Social Links
        if (brand.socialLinks != null && brand.socialLinks!.isNotEmpty) ...[
          Text('Follow Us', style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: brand.socialLinks!.entries.map((e) => ActionChip(
              avatar: const Icon(Icons.link, size: 16, color: Colors.white),
              label: Text(e.key.toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              backgroundColor: AppColors.primary,
              onPressed: () => _launchUrl(e.value),
            )).toList(),
          ),
          const SizedBox(height: 40),
        ],
      ],
    );
  }
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _InfoTile({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: AppColors.primaryLight.withOpacity(0.2), shape: BoxShape.circle),
          child: Icon(icon, color: AppColors.primary),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: AppColors.onSurfaceVariant)),
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

  const _QuickActionCard({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.surfaceVariant),
          boxShadow: [BoxShadow(color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2))],
        ),
        child: Column(
          children: [
            Icon(icon, color: AppColors.primary, size: 28),
            const SizedBox(height: 8),
            Text(label, style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

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
          return const Center(child: Text('No products available.', style: TextStyle(color: AppColors.onSurfaceVariant)));
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

class _RetailersTab extends ConsumerWidget {
  final String manufacturerPhone;
  const _RetailersTab({required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncRetailers = ref.watch(_brandRetailersProvider(manufacturerPhone));

    return asyncRetailers.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const ErrorView(message: 'Could not load dealers.'),
      data: (retailers) {
        if (retailers.isEmpty) {
          return const Center(child: Text('No dealers found.', style: TextStyle(color: AppColors.onSurfaceVariant)));
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: retailers.length,
          separatorBuilder: (_, _) => const SizedBox(height: 12),
          itemBuilder: (_, i) => _RetailerCard(retailer: retailers[i]),
        );
      },
    );
  }
}

class _SliverAppBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar _tabBar;
  _SliverAppBarDelegate(this._tabBar);

  @override
  double get minExtent => _tabBar.preferredSize.height;
  @override
  double get maxExtent => _tabBar.preferredSize.height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
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
          boxShadow: [BoxShadow(color: AppColors.cardShadow, blurRadius: 6, offset: const Offset(0, 3))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
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
                    style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    CurrencyUtils.format(product.price),
                    style: AppTextStyles.price.copyWith(color: AppColors.primary),
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
    child: const Center(child: Icon(Icons.grass, size: 36, color: AppColors.primaryLight)),
  );
}

class _RetailerCard extends StatelessWidget {
  final BrandRetailerModel retailer;
  const _RetailerCard({required this.retailer});

  Future<void> _call() async {
    final uri = Uri(scheme: 'tel', path: retailer.phone);
    if (await canLaunchUrl(uri)) launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.surfaceVariant.withOpacity(0.5)),
        boxShadow: [BoxShadow(color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: retailer.logo != null
                  ? CachedNetworkImage(
                      imageUrl: retailer.logo!,
                      width: 56,
                      height: 56,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => _avatar(),
                    )
                  : _avatar(),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    retailer.displayName,
                    style: AppTextStyles.heading3.copyWith(fontSize: 16),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (retailer.locationLabel.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.location_on, size: 14, color: Colors.redAccent),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            retailer.locationLabel,
                            style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant),
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
            const SizedBox(width: 8),
            Container(
              decoration: BoxDecoration(
                color: AppColors.primaryLight.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: IconButton(
                onPressed: _call,
                icon: const Icon(Icons.phone),
                color: AppColors.primary,
                tooltip: 'Call Dealer',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _avatar() => Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppColors.primaryLight, AppColors.primary]),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(child: Icon(Icons.storefront, size: 28, color: Colors.white)),
      );
}
