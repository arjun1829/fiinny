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
  ConsumerState<BrandEditorScreen> createState() =>
      _BrandEditorScreenState();
}

class _BrandEditorScreenState
    extends ConsumerState<BrandEditorScreen> {
  final _taglineCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _logoCtrl = TextEditingController();
  final _coverCtrl = TextEditingController();
  bool _saving = false;
  bool _loaded = false;

  @override
  void dispose() {
    _taglineCtrl.dispose();
    _descCtrl.dispose();
    _logoCtrl.dispose();
    _coverCtrl.dispose();
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
          return const Scaffold(
              body: Center(child: Text('Not logged in.')));
        }

        if (!_loaded) {
          _loadBrandData(user.phone);
        }

        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            title: Text('Brand Page Editor',
                style: AppTextStyles.heading2
                    .copyWith(color: Colors.white)),
            actions: [
              TextButton(
                onPressed: _saving ? null : () => _save(user.phone),
                child: Text(
                  _saving ? 'Saving...' : 'Save',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
          body: !_loaded
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _Section(
                      title: 'Brand Identity',
                      child: Column(
                        children: [
                          TextField(
                            controller: _taglineCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Tagline',
                              hintText:
                                  'e.g. Growing India\'s Future',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _descCtrl,
                            maxLines: 3,
                            decoration: const InputDecoration(
                              labelText: 'About / Description',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    _Section(
                      title: 'Images',
                      child: Column(
                        children: [
                          TextField(
                            controller: _logoCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Logo URL',
                              hintText: 'https://...',
                              border: OutlineInputBorder(),
                              prefixIcon:
                                  Icon(Icons.image_outlined),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _coverCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Cover Image URL',
                              hintText: 'https://...',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(
                                  Icons.panorama_outlined),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Preview hint
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer
                            .withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: AppColors.primaryContainer),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.info_outline,
                              color: AppColors.primary, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Your brand page is visible at krishidukan.com/brand/${user.name.toLowerCase().replaceAll(' ', '-')}',
                              style: AppTextStyles.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 80),
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
      _taglineCtrl.text = data?['tagline'] as String? ?? '';
      _descCtrl.text = data?['description'] as String? ?? '';
      _logoCtrl.text = data?['logo'] as String? ?? '';
      _coverCtrl.text = data?['coverImage'] as String? ?? '';
      _loaded = true;
    });
  }

  Future<void> _save(String phone) async {
    setState(() => _saving = true);
    try {
      await ManufacturerRepository().saveBrandPage(phone, {
        'tagline': _taglineCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'logo': _logoCtrl.text.trim(),
        'coverImage': _coverCtrl.text.trim(),
        'updatedAt': DateTime.now().toIso8601String(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Brand page saved!'),
            backgroundColor: AppColors.success,
          ),
        );
        ref.invalidate(brandPageDataProvider(phone));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

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
