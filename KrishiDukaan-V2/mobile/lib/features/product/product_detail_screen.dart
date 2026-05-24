import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../data/firestore_repository.dart';
import '../../shared/mock_data.dart';
import '../../shared/models.dart';
import '../cart/cart_provider.dart';

class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.productId});
  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(productByIdProvider(productId));

    return async.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Text('Could not load product\n$e',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted)),
        ),
      ),
      data: (live) {
        // Fall back to mock if the doc doesn't exist yet (during seeding).
        final p = live ??
            mockProducts.firstWhere(
              (e) => e.id == productId,
              orElse: () => mockProducts.first,
            );
        return _Detail(p: p);
      },
    );
  }
}

class _Detail extends ConsumerWidget {
  const _Detail({required this.p});
  final Product p;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 280,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: p.imageUrl.isEmpty
                  ? Container(
                      color: AppColors.surface,
                      child: const Icon(Icons.image_outlined,
                          size: 120, color: AppColors.muted),
                    )
                  : CachedNetworkImage(
                      imageUrl: p.imageUrl,
                      fit: BoxFit.contain,
                      placeholder: (_, __) =>
                          Container(color: AppColors.surface),
                      errorWidget: (_, __, ___) => Container(
                        color: AppColors.surface,
                        child: const Icon(Icons.image_outlined,
                            size: 120, color: AppColors.muted),
                      ),
                    ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.brand,
                      style: const TextStyle(
                          color: AppColors.muted,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Text(p.name,
                      style: const TextStyle(
                          fontSize: 22, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.star,
                          color: AppColors.accent, size: 18),
                      const SizedBox(width: 4),
                      Text('${p.rating} · 128 reviews'),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color:
                              AppColors.primary.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'In stock nearby',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        '₹${p.priceInr}',
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),
                      if (p.mrpInr > p.priceInr) ...[
                        const SizedBox(width: 8),
                        Text(
                          '₹${p.mrpInr}',
                          style: const TextStyle(
                            fontSize: 16,
                            color: AppColors.muted,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      ],
                    ],
                  ),
                  Text('per ${p.unit}',
                      style: const TextStyle(color: AppColors.muted)),
                  const Divider(height: 32),
                  const Text('About this product',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(p.description,
                      style: const TextStyle(
                          color: AppColors.text, height: 1.5)),
                  const SizedBox(height: 24),
                  const Text('Specifications',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  _spec('Category', p.category),
                  _spec('Brand', p.brand),
                  _spec('Pack size', p.unit),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => context.go('/stores'),
                  icon: const Icon(Icons.store_outlined),
                  label: const Text('Find stores'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    ref.read(cartProvider.notifier).add(p);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        duration: const Duration(seconds: 1),
                        content: Text('Added ${p.name} to cart'),
                        action: SnackBarAction(
                          label: 'View',
                          onPressed: () => context.push('/cart'),
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.shopping_cart_outlined),
                  label: const Text('Add to cart'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _spec(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            SizedBox(
              width: 120,
              child: Text(k,
                  style: const TextStyle(color: AppColors.muted)),
            ),
            Expanded(
                child: Text(v,
                    style: const TextStyle(fontWeight: FontWeight.w600))),
          ],
        ),
      );
}
