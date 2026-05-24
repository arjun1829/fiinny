import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../data/firestore_repository.dart';
import '../../shared/local_product_images.dart';
import '../../shared/mock_data.dart';
import '../../shared/models.dart';
import '../cart/cart_provider.dart';

// ─── Screen ─────────────────────────────────────────────────────────────────

class MarketScreen extends ConsumerStatefulWidget {
  const MarketScreen({super.key});
  @override
  ConsumerState<MarketScreen> createState() => _MarketScreenState();
}

class _MarketScreenState extends ConsumerState<MarketScreen> {
  String _selectedCategory = 'all';
  String _searchQuery = '';
  String _sortBy = 'default';
  String _brandFilter = 'all';
  int _priceMax = 3000;
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  static const _categories = <_Cat>[
    _Cat('all', 'All', Icons.apps),
    _Cat('Seeds', 'Seeds', Icons.eco),
    _Cat('Fertilizer', 'Fertilizers', Icons.science_outlined),
    _Cat('Pesticide', 'Pesticides', Icons.bug_report_outlined),
    _Cat('Tools', 'Tools', Icons.build_outlined),
    _Cat('Irrigation', 'Irrigation', Icons.water_drop_outlined),
  ];

  int get _activeFilterCount =>
      (_brandFilter != 'all' ? 1 : 0) +
      (_priceMax < 3000 ? 1 : 0) +
      (_sortBy != 'default' ? 1 : 0);

  List<Product> _applyFilters(List<Product> all) {
    var list = all.where((p) {
      final catMatch = _selectedCategory == 'all' ||
          p.category.toLowerCase().contains(_selectedCategory.toLowerCase());
      final searchMatch = _searchQuery.isEmpty ||
          p.name.toLowerCase().contains(_searchQuery) ||
          p.brand.toLowerCase().contains(_searchQuery) ||
          p.category.toLowerCase().contains(_searchQuery);
      final brandMatch = _brandFilter == 'all' || p.brand == _brandFilter;
      final priceMatch = p.priceInr <= _priceMax;
      return catMatch && searchMatch && brandMatch && priceMatch;
    }).toList();

    switch (_sortBy) {
      case 'price-asc':
        list.sort((a, b) => a.priceInr.compareTo(b.priceInr));
        break;
      case 'price-desc':
        list.sort((a, b) => b.priceInr.compareTo(a.priceInr));
        break;
      case 'name-asc':
        list.sort((a, b) => a.name.compareTo(b.name));
        break;
    }
    return list;
  }

  void _showFilterSheet(BuildContext context, List<Product> allProducts) {
    final brands = [
      'all',
      ...allProducts
          .map((p) => p.brand)
          .where((b) => b.isNotEmpty)
          .toSet()
          .toList()
        ..sort(),
    ];
    var tempSort = _sortBy;
    var tempBrand = _brandFilter;
    var tempPrice = _priceMax.toDouble();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
              20, 12, 20, MediaQuery.of(ctx).viewInsets.bottom + 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Text('Filter & Sort',
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w800)),
                  const Spacer(),
                  TextButton(
                    onPressed: () => setSheet(() {
                      tempSort = 'default';
                      tempBrand = 'all';
                      tempPrice = 3000;
                    }),
                    child: const Text('Reset',
                        style: TextStyle(color: AppColors.primary)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const _SheetLabel('SORT BY'),
              const SizedBox(height: 8),
              _sortOption('Nearest first', 'default', tempSort,
                  (v) => setSheet(() => tempSort = v)),
              _sortOption('Price: Low to High', 'price-asc', tempSort,
                  (v) => setSheet(() => tempSort = v)),
              _sortOption('Price: High to Low', 'price-desc', tempSort,
                  (v) => setSheet(() => tempSort = v)),
              _sortOption('Name: A → Z', 'name-asc', tempSort,
                  (v) => setSheet(() => tempSort = v)),
              const SizedBox(height: 16),
              const _SheetLabel('BRAND'),
              const SizedBox(height: 8),
              SizedBox(
                height: 36,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: brands.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final b = brands[i];
                    final active = b == tempBrand;
                    return GestureDetector(
                      onTap: () => setSheet(() => tempBrand = b),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color:
                              active ? AppColors.primary : Colors.transparent,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                              color: active
                                  ? AppColors.primary
                                  : AppColors.border),
                        ),
                        child: Text(
                          b == 'all' ? 'All Brands' : b,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: active ? Colors.white : AppColors.text,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const _SheetLabel('MAX PRICE'),
                  const Spacer(),
                  Text(
                    '₹${tempPrice.toInt()}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary),
                  ),
                ],
              ),
              Slider(
                value: tempPrice,
                min: 100,
                max: 3000,
                divisions: 29,
                activeColor: AppColors.primary,
                onChanged: (v) => setSheet(() => tempPrice = v),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    setState(() {
                      _sortBy = tempSort;
                      _brandFilter = tempBrand;
                      _priceMax = tempPrice.toInt();
                    });
                    Navigator.pop(ctx);
                  },
                  child: const Text('Apply Filters'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(productsStreamProvider);

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ───────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        'Market',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: AppColors.text,
                        ),
                      ),
                      Text(
                        'Find agri supplies near you',
                        style: TextStyle(
                            fontSize: 13, color: AppColors.muted),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      IconButton(
                        onPressed: () {
                          final live = async.valueOrNull ?? [];
                          _showFilterSheet(
                              context,
                              live.isEmpty ? mockProducts : live);
                        },
                        icon: const Icon(Icons.tune, color: AppColors.text),
                      ),
                      if (_activeFilterCount > 0)
                        Positioned(
                          right: 4,
                          top: 4,
                          child: Container(
                            width: 18,
                            height: 18,
                            decoration: const BoxDecoration(
                              color: AppColors.primary,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                '$_activeFilterCount',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),

            // ── Search ───────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: TextField(
                controller: _searchCtrl,
                onChanged: (q) =>
                    setState(() => _searchQuery = q.trim().toLowerCase()),
                decoration: InputDecoration(
                  hintText: 'Search products…',
                  hintStyle: const TextStyle(
                      color: AppColors.muted, fontSize: 14),
                  prefixIcon:
                      const Icon(Icons.search, color: AppColors.muted),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(999),
                    borderSide:
                        const BorderSide(color: AppColors.border),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),

            // ── Category chips ────────────────────────────────────────────
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final c = _categories[i];
                  final active = c.id == _selectedCategory;
                  return InkWell(
                    onTap: () =>
                        setState(() => _selectedCategory = c.id),
                    borderRadius: BorderRadius.circular(999),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: active
                            ? AppColors.primary
                            : AppColors.surfaceAlt,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: active
                              ? AppColors.primary
                              : AppColors.border,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(c.icon,
                              size: 16,
                              color: active
                                  ? Colors.white
                                  : AppColors.text),
                          const SizedBox(width: 6),
                          Text(
                            c.label,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: active
                                  ? Colors.white
                                  : AppColors.text,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 8),

            // ── Product grid ──────────────────────────────────────────────
            Expanded(
              child: async.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text('Could not load: $e',
                      style: const TextStyle(color: AppColors.muted)),
                ),
                data: (live) {
                  final all = live.isEmpty ? mockProducts : live;
                  final filtered = _applyFilters(all);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding:
                            const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        child: Text(
                          'Showing ${filtered.length} product${filtered.length == 1 ? '' : 's'}'
                          '${_brandFilter != 'all' ? ' from $_brandFilter' : ''}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.muted,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Expanded(
                        child: filtered.isEmpty
                            ? const _EmptyState()
                            : GridView.builder(
                                padding: const EdgeInsets.fromLTRB(
                                    16, 0, 16, 24),
                                gridDelegate:
                                    const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  childAspectRatio: 0.52,
                                  crossAxisSpacing: 12,
                                  mainAxisSpacing: 12,
                                ),
                                itemCount: filtered.length,
                                itemBuilder: (_, i) =>
                                    _ProductCard(filtered[i]),
                              ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

class _Cat {
  const _Cat(this.id, this.label, this.icon);
  final String id;
  final String label;
  final IconData icon;
}

class _SheetLabel extends StatelessWidget {
  const _SheetLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: AppColors.muted,
          letterSpacing: 1.2,
        ),
      );
}

Widget _sortOption(
  String label,
  String value,
  String current,
  ValueChanged<String> onSelect,
) {
  final active = value == current;
  return InkWell(
    onTap: () => onSelect(value),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(
            active ? Icons.radio_button_checked : Icons.radio_button_off,
            size: 18,
            color: active ? AppColors.primary : AppColors.muted,
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              color: active ? AppColors.primary : AppColors.text,
            ),
          ),
        ],
      ),
    ),
  );
}

// ─── Category-based image fallback ───────────────────────────────────────────

String _fallbackImage(Product p) {
  final key = '${p.category} ${p.name}'.toLowerCase();
  if (key.contains('power plus') || key.contains('biostim') || key.contains('bio-stim')) {
    return 'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png';
  }
  if (key.contains('seed')) {
    return 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('fertil') || key.contains('npk') || key.contains('urea')) {
    return 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('pesticide') || key.contains('neem') || key.contains('insect') || key.contains('fungicide')) {
    return 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('spray') || key.contains('pump')) {
    return 'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('drip') || key.contains('irrig')) {
    return 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('herbicide') || key.contains('weed')) {
    return 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('tool')) {
    return 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=600&q=80';
}

// ─── Empty state ──────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off_rounded,
                size: 64, color: AppColors.border),
            const SizedBox(height: 16),
            const Text(
              'No products found',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text),
            ),
            const SizedBox(height: 8),
            const Text(
              'Try changing the filters or search term',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.muted, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Product image — local asset first, network fallback ─────────────────────

class _ProductImage extends StatelessWidget {
  const _ProductImage(this.p);
  final Product p;

  @override
  Widget build(BuildContext context) {
    final localAsset = localAssetForProduct(p.name);
    if (localAsset != null) {
      return Image.asset(
        localAsset,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => _networkImage(p),
      );
    }
    return _networkImage(p);
  }

  static Widget _networkImage(Product p) {
    final url = p.imageUrl.isNotEmpty ? p.imageUrl : _fallbackImage(p);
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.contain,
      errorWidget: (_, __, ___) => CachedNetworkImage(
        imageUrl: _fallbackImage(p),
        fit: BoxFit.cover,
        errorWidget: (_, __, ___) =>
            const Icon(Icons.image_outlined, color: AppColors.muted, size: 56),
      ),
    );
  }
}

// ─── Product card ─────────────────────────────────────────────────────────────

class _ProductCard extends ConsumerWidget {
  const _ProductCard(this.p);
  final Product p;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return InkWell(
      onTap: () => context.push('/product/${p.id}'),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Image ───────────────────────────────────────────────────
            AspectRatio(
              aspectRatio: 1,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(20)),
                      child: Container(
                        color: AppColors.surfaceAlt,
                        padding: const EdgeInsets.all(8),
                        child: _ProductImage(p),
                      ),
                    ),
                  ),
                  // IN STOCK badge — top left
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.inStockBg,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'IN STOCK',
                        style: TextStyle(
                          color: AppColors.inStockFg,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                  // Category badge — top right
                  if (p.category.isNotEmpty && p.category != 'general')
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.9),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Text(
                          p.category,
                          style: const TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // ── Info ─────────────────────────────────────────────────────
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                        color: AppColors.text,
                      ),
                    ),
                    if (p.description.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        p.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.muted,
                          height: 1.3,
                        ),
                      ),
                    ],
                    const Spacer(),
                    // Unit label
                    Text(
                      p.unit.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: AppColors.muted,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 2),
                    // Price row
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          '₹${p.priceInr}',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary,
                          ),
                        ),
                        if (p.mrpInr > p.priceInr) ...[
                          const SizedBox(width: 4),
                          Text(
                            '₹${p.mrpInr}',
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppColors.muted,
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                        ],
                        const Spacer(),
                        if (p.brand.isNotEmpty)
                          Text(
                            p.brand,
                            style: const TextStyle(
                              fontSize: 9,
                              color: AppColors.muted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    // Add to cart button
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(30),
                          padding: EdgeInsets.zero,
                          textStyle: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
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
                        child: const Text('+ Add to Cart'),
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
