import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../data/manufacturer_repository.dart';
import '../providers/manufacturer_provider.dart';

class BrandEditorScreen extends ConsumerStatefulWidget {
  const BrandEditorScreen({super.key});

  @override
  ConsumerState<BrandEditorScreen> createState() => _BrandEditorScreenState();
}

class _BrandEditorScreenState extends ConsumerState<BrandEditorScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // Brand story fields
  final _taglineCtrl       = TextEditingController();
  final _aboutCtrl         = TextEditingController();
  final _yearCtrl          = TextEditingController();
  final _websiteCtrl       = TextEditingController();
  final _socialProofCtrl   = TextEditingController();

  // Image fields
  final _logoCtrl   = TextEditingController();
  final _bannerCtrl = TextEditingController();

  // Certifications
  final _certInputCtrl = TextEditingController();
  List<String> _certifications = [];

  // YouTube videos
  final _videoInputCtrl = TextEditingController();
  List<String> _videos = [];
  String? _videoError;

  bool _saving = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _taglineCtrl.dispose();
    _aboutCtrl.dispose();
    _yearCtrl.dispose();
    _websiteCtrl.dispose();
    _socialProofCtrl.dispose();
    _logoCtrl.dispose();
    _bannerCtrl.dispose();
    _certInputCtrl.dispose();
    _videoInputCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) =>
          const Scaffold(body: Center(child: Text('Not logged in.'))),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: Center(child: Text('Not logged in.')));
        }
        if (!_loaded) _loadBrandData(user.phone);

        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            title: Text('Brand Page Editor',
                style: AppTextStyles.heading2.copyWith(color: Colors.white)),
            actions: [
              TextButton(
                onPressed: _saving ? null : () => _save(user.phone),
                child: Text(
                  _saving ? 'Saving…' : 'Save',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
            ],
            bottom: TabBar(
              controller: _tabController,
              indicatorColor: Colors.white,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white70,
              tabs: const [
                Tab(text: 'Brand'),
                Tab(text: 'Products'),
                Tab(text: 'Stores'),
              ],
            ),
          ),
          body: !_loaded
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _BrandTab(
                      taglineCtrl: _taglineCtrl,
                      aboutCtrl: _aboutCtrl,
                      yearCtrl: _yearCtrl,
                      websiteCtrl: _websiteCtrl,
                      socialProofCtrl: _socialProofCtrl,
                      logoCtrl: _logoCtrl,
                      bannerCtrl: _bannerCtrl,
                      certInputCtrl: _certInputCtrl,
                      certifications: _certifications,
                      videoInputCtrl: _videoInputCtrl,
                      videos: _videos,
                      videoError: _videoError,
                      onAddCert: _addCert,
                      onRemoveCert: (c) => setState(() => _certifications.remove(c)),
                      onAddVideo: _addVideo,
                      onRemoveVideo: (v) => setState(() => _videos.remove(v)),
                      onVideoInputChanged: () =>
                          setState(() => _videoError = null),
                    ),
                    _ProductsTab(phone: user.phone),
                    _StoresTab(phone: user.phone),
                  ],
                ),
        );
      },
    );
  }

  Future<void> _loadBrandData(String phone) async {
    final data = await ManufacturerRepository().fetchBrandPage(phone);
    if (!mounted) return;
    setState(() {
      _taglineCtrl.text     = data?['tagline']     as String? ?? '';
      // support both 'about' (web) and legacy 'description' field
      _aboutCtrl.text       = data?['about']        as String?
                           ?? data?['description']  as String? ?? '';
      _yearCtrl.text        = data?['establishedYear'] as String? ?? '';
      _websiteCtrl.text     = data?['website']      as String? ?? '';
      _socialProofCtrl.text = data?['socialProof']  as String? ?? '';
      _logoCtrl.text        = data?['logo']         as String? ?? '';
      // support both 'banner' (web) and legacy 'coverImage'
      _bannerCtrl.text      = data?['banner']       as String?
                           ?? data?['coverImage']   as String? ?? '';
      _certifications = List<String>.from(data?['certifications'] as List? ?? []);
      _videos         = List<String>.from(data?['videos']         as List? ?? []);
      _loaded = true;
    });
  }

  void _addCert() {
    final v = _certInputCtrl.text.trim();
    if (v.isNotEmpty && !_certifications.contains(v)) {
      setState(() {
        _certifications.add(v);
        _certInputCtrl.clear();
      });
    }
  }

  void _addVideo() {
    final id = _extractYouTubeId(_videoInputCtrl.text);
    if (id == null) {
      setState(() => _videoError = 'Paste a valid YouTube URL or video ID');
      return;
    }
    if (_videos.contains(id)) {
      setState(() => _videoError = 'Already added');
      return;
    }
    setState(() {
      _videos.add(id);
      _videoInputCtrl.clear();
      _videoError = null;
    });
  }

  static String? _extractYouTubeId(String input) {
    final trimmed = input.trim();
    if (RegExp(r'^[a-zA-Z0-9_-]{11}$').hasMatch(trimmed)) return trimmed;
    final m = RegExp(
      r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
    ).firstMatch(trimmed);
    return m?.group(1);
  }

  Future<void> _save(String phone) async {
    setState(() => _saving = true);
    try {
      await ManufacturerRepository().saveBrandPage(phone, {
        'tagline':         _taglineCtrl.text.trim(),
        'about':           _aboutCtrl.text.trim(),
        'establishedYear': _yearCtrl.text.trim(),
        'website':         _websiteCtrl.text.trim(),
        'socialProof':     _socialProofCtrl.text.trim(),
        'logo':            _logoCtrl.text.trim(),
        'banner':          _bannerCtrl.text.trim(),
        'certifications':  _certifications,
        'videos':          _videos,
        'updatedAt':       DateTime.now().toIso8601String(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Brand page saved!'),
              backgroundColor: AppColors.success),
        );
        ref.invalidate(brandPageDataProvider(phone));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

// ── Brand tab ─────────────────────────────────────────────────────────────────

class _BrandTab extends StatefulWidget {
  final TextEditingController taglineCtrl;
  final TextEditingController aboutCtrl;
  final TextEditingController yearCtrl;
  final TextEditingController websiteCtrl;
  final TextEditingController socialProofCtrl;
  final TextEditingController logoCtrl;
  final TextEditingController bannerCtrl;
  final TextEditingController certInputCtrl;
  final List<String> certifications;
  final TextEditingController videoInputCtrl;
  final List<String> videos;
  final String? videoError;
  final VoidCallback onAddCert;
  final ValueChanged<String> onRemoveCert;
  final VoidCallback onAddVideo;
  final ValueChanged<String> onRemoveVideo;
  final VoidCallback onVideoInputChanged;

  const _BrandTab({
    required this.taglineCtrl,
    required this.aboutCtrl,
    required this.yearCtrl,
    required this.websiteCtrl,
    required this.socialProofCtrl,
    required this.logoCtrl,
    required this.bannerCtrl,
    required this.certInputCtrl,
    required this.certifications,
    required this.videoInputCtrl,
    required this.videos,
    required this.videoError,
    required this.onAddCert,
    required this.onRemoveCert,
    required this.onAddVideo,
    required this.onRemoveVideo,
    required this.onVideoInputChanged,
  });

  @override
  State<_BrandTab> createState() => _BrandTabState();
}

class _BrandTabState extends State<_BrandTab> {
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Brand story
        _Section(
          title: 'Brand Story',
          child: Column(
            children: [
              TextField(
                controller: widget.taglineCtrl,
                maxLength: 120,
                decoration: InputDecoration(
                  labelText: 'Tagline',
                  hintText: 'e.g. Growing India\'s Future',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: widget.aboutCtrl,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: 'About / Description',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: widget.yearCtrl,
                      maxLength: 4,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: 'Founded Year',
                        hintText: '2010',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: widget.websiteCtrl,
                      keyboardType: TextInputType.url,
                      decoration: InputDecoration(
                        labelText: 'Website',
                        hintText: 'https://',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        isDense: true,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: widget.socialProofCtrl,
                maxLength: 120,
                decoration: InputDecoration(
                  labelText: 'Social Proof',
                  hintText: 'e.g. Trusted by 500+ farmers',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Images
        _Section(
          title: 'Images',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: widget.logoCtrl,
                decoration: InputDecoration(
                  labelText: 'Logo URL',
                  hintText: 'https://...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  prefixIcon: const Icon(Icons.image_outlined),
                ),
              ),
              if (widget.logoCtrl.text.isNotEmpty) ...[
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: CachedNetworkImage(
                    imageUrl: widget.logoCtrl.text,
                    height: 60,
                    fit: BoxFit.contain,
                    errorWidget: (_, __, ___) =>
                        const Icon(Icons.broken_image_outlined),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: widget.bannerCtrl,
                decoration: InputDecoration(
                  labelText: 'Banner / Cover Image URL',
                  hintText: 'https://...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  prefixIcon: const Icon(Icons.panorama_outlined),
                ),
              ),
              if (widget.bannerCtrl.text.isNotEmpty) ...[
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: CachedNetworkImage(
                    imageUrl: widget.bannerCtrl.text,
                    height: 80,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) =>
                        const Icon(Icons.broken_image_outlined),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Certifications
        _Section(
          title: 'Certifications',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (widget.certifications.isNotEmpty) ...[
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: widget.certifications.map((c) => Chip(
                    label: Text(c, style: AppTextStyles.caption),
                    backgroundColor:
                        AppColors.primaryContainer.withValues(alpha: 0.3),
                    side: const BorderSide(color: AppColors.primary),
                    deleteIcon: const Icon(Icons.close, size: 14),
                    onDeleted: () => widget.onRemoveCert(c),
                  )).toList(),
                ),
                const SizedBox(height: 12),
              ],
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: widget.certInputCtrl,
                      decoration: InputDecoration(
                        hintText: 'e.g. ISO 9001, IARI Certified',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        isDense: true,
                      ),
                      onSubmitted: (_) => widget.onAddCert(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: widget.onAddCert,
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12)),
                    child: const Icon(Icons.add, size: 18, color: Colors.white),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // YouTube videos
        _Section(
          title: 'YouTube Videos',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Paste a YouTube URL or video ID',
                  style: AppTextStyles.caption),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: widget.videoInputCtrl,
                      decoration: InputDecoration(
                        hintText: 'https://youtube.com/watch?v=...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        isDense: true,
                        errorText: widget.videoError,
                      ),
                      onChanged: (_) => widget.onVideoInputChanged(),
                      onSubmitted: (_) => widget.onAddVideo(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: widget.onAddVideo,
                    style: FilledButton.styleFrom(
                        backgroundColor: Colors.red,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12)),
                    child: const Icon(Icons.add, size: 18, color: Colors.white),
                  ),
                ],
              ),
              if (widget.videos.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  height: 110,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: widget.videos.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (_, i) {
                      final id = widget.videos[i];
                      return Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: CachedNetworkImage(
                              imageUrl:
                                  'https://img.youtube.com/vi/$id/mqdefault.jpg',
                              width: 100,
                              height: 110,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => Container(
                                width: 100,
                                height: 110,
                                color: Colors.black12,
                                child: const Icon(Icons.play_circle_outline,
                                    color: Colors.red),
                              ),
                            ),
                          ),
                          Positioned(
                            top: 4,
                            right: 4,
                            child: GestureDetector(
                              onTap: () => widget.onRemoveVideo(id),
                              child: Container(
                                padding: const EdgeInsets.all(3),
                                decoration: BoxDecoration(
                                  color: Colors.black54,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: const Icon(Icons.close,
                                    size: 14, color: Colors.white),
                              ),
                            ),
                          ),
                          Positioned(
                            bottom: 6,
                            left: 0,
                            right: 0,
                            child: Center(
                              child: Icon(Icons.play_circle_filled,
                                  color: Colors.white.withValues(alpha: 0.8),
                                  size: 28),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 80),
      ],
    );
  }
}

// ── Products tab ──────────────────────────────────────────────────────────────

class _ProductsTab extends ConsumerWidget {
  final String phone;
  const _ProductsTab({required this.phone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogAsync = ref.watch(manufacturerCatalogProvider(phone));
    return catalogAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) =>
          const Center(child: Text('Could not load products.')),
      data: (products) {
        if (products.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.inventory_2_outlined,
                      size: 48, color: AppColors.primaryContainer),
                  SizedBox(height: 12),
                  Text('No products yet',
                      style: TextStyle(color: AppColors.onSurfaceVariant)),
                ],
              ),
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: products.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final p = products[i];
            return Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.divider),
              ),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: p.hasImages
                          ? CachedNetworkImage(
                              imageUrl: p.imageUrl,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => const Icon(
                                  Icons.inventory_2_outlined,
                                  color: AppColors.primaryLight),
                            )
                          : const Icon(Icons.inventory_2_outlined,
                              color: AppColors.primaryLight),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.name, style: AppTextStyles.bodyMedium),
                        Text(p.category, style: AppTextStyles.caption),
                        Text('₹${p.price.toStringAsFixed(0)}',
                            style: AppTextStyles.price),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

// ── Stores tab ────────────────────────────────────────────────────────────────

class _StoresTab extends ConsumerWidget {
  final String phone;
  const _StoresTab({required this.phone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final networkAsync = ref.watch(retailerNetworkProvider(phone));
    return networkAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) =>
          const Center(child: Text('Could not load stores.')),
      data: (retailers) {
        final active = retailers.where((r) => r.isActive).toList();
        if (active.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.store_outlined,
                      size: 48, color: AppColors.primaryContainer),
                  SizedBox(height: 12),
                  Text('No active stores yet',
                      style: TextStyle(color: AppColors.onSurfaceVariant)),
                ],
              ),
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: active.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final r = active[i];
            return Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.divider),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.store_outlined,
                        color: AppColors.primary, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r.shopName, style: AppTextStyles.bodyMedium),
                        Text(r.ownerName, style: AppTextStyles.caption),
                        if (r.phone.isNotEmpty)
                          Text(r.phone, style: AppTextStyles.caption),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

// ── Shared section widget ─────────────────────────────────────────────────────

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 4,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
