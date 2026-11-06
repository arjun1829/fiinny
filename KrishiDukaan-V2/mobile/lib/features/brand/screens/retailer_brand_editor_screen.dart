import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/retailer_brand_model.dart';
import '../../../core/models/store_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/link_share.dart';
import '../../../core/utils/web_links.dart';
import '../../marketplace/providers/marketplace_provider.dart';
import '../../reels/providers/reels_provider.dart';
import '../data/retailer_brand_repository.dart';
import '../widgets/brand_poster.dart';

/// The retailer's own brand page: visibility switch, details, highlights,
/// shop photos, contact and socials — plus "Share as image" (the poster) and
/// the page link. Name, logo, banner and address come from the profile.
/// Same fields as the website's /dashboard/brand-page.
class RetailerBrandEditorScreen extends ConsumerStatefulWidget {
  static const route = '/dashboard/brand-page';
  const RetailerBrandEditorScreen({super.key});

  @override
  ConsumerState<RetailerBrandEditorScreen> createState() =>
      _RetailerBrandEditorScreenState();
}

class _RetailerBrandEditorScreenState
    extends ConsumerState<RetailerBrandEditorScreen> {
  final _tagline = TextEditingController();
  final _about = TextEditingController();
  final _year = TextEditingController();
  final _hours = TextEditingController();
  final _whatsapp = TextEditingController();
  final _instagram = TextEditingController();
  final _facebook = TextEditingController();
  final _youtube = TextEditingController();
  final _newHighlight = TextEditingController();

  RetailerBrandModel _brand = const RetailerBrandModel();
  bool _exists = false;
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;
  String? _phone;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    for (final c in [
      _tagline,
      _about,
      _year,
      _hours,
      _whatsapp,
      _instagram,
      _facebook,
      _youtube,
      _newHighlight,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final user = ref.read(sellerUserProvider).value;
    final phone = WebLinks.sharePhone(user?.phone ?? '');
    if (phone == null) {
      setState(() {
        _loading = false;
        _loadError = 'Add your phone number in your profile first.';
      });
      return;
    }
    try {
      final r = await ref.read(retailerBrandRepositoryProvider).fetch(phone);
      if (!mounted) return;
      final b = r?.brand ?? const RetailerBrandModel();
      _tagline.text = b.tagline;
      _about.text = b.about;
      _year.text = b.establishedYear;
      _hours.text = b.openingHours;
      _whatsapp.text = b.whatsapp;
      _instagram.text = b.instagram;
      _facebook.text = b.facebook;
      _youtube.text = b.youtube;
      setState(() {
        _phone = phone;
        _brand = b;
        _exists = r?.exists ?? false;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = 'Could not load your brand page. Please try again.';
        });
      }
    }
  }

  RetailerBrandModel _fromFields() => _brand.copyWith(
        tagline: _tagline.text,
        about: _about.text,
        establishedYear: _year.text,
        openingHours: _hours.text,
        whatsapp: _whatsapp.text,
        instagram: _instagram.text,
        facebook: _facebook.text,
        youtube: _youtube.text,
      );

  Future<void> _save({RetailerBrandModel? next, bool quiet = false}) async {
    final phone = _phone;
    if (phone == null) return;
    final value = next ?? _fromFields();
    setState(() => _saving = true);
    try {
      await ref
          .read(retailerBrandRepositoryProvider)
          .save(phone, value, isNew: !_exists);
      ref.invalidate(publicRetailerBrandProvider(phone));
      if (!mounted) return;
      setState(() {
        _exists = true;
        _brand = RetailerBrandModel.fromMap(value.toMap());
      });
      if (!quiet) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Brand page saved')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleVisible(bool on) async {
    final next = _fromFields().copyWith(enabled: on);
    setState(() => _brand = next);
    await _save(next: next, quiet: true);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(on
            ? 'Your brand page is live'
            : 'Your brand page is hidden'),
      ),
    );
  }

  void _addHighlight(String raw) {
    final v = raw.trim();
    if (v.isEmpty ||
        _brand.highlights.contains(v) ||
        _brand.highlights.length >= RetailerBrandModel.maxHighlights) {
      return;
    }
    setState(() {
      _brand = _brand.copyWith(highlights: [
        ..._brand.highlights,
        v.length > RetailerBrandModel.maxHighlight
            ? v.substring(0, RetailerBrandModel.maxHighlight)
            : v,
      ]);
      _newHighlight.clear();
    });
  }

  Future<void> _addPhotos() async {
    final phone = _phone;
    if (phone == null) return;
    final room = RetailerBrandModel.maxPhotos - _brand.photos.length;
    if (room <= 0) return;
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: 1600,
      imageQuality: 80,
      limit: room > 1 ? room : null,
    );
    if (picked.isEmpty || !mounted) return;
    setState(() => _uploading = true);
    try {
      final repo = ref.read(retailerBrandRepositoryProvider);
      final files = picked.take(room).map((x) => File(x.path)).toList();
      final tooBig = <File>[];
      for (final f in files) {
        if (await f.length() > 5 * 1024 * 1024) tooBig.add(f);
      }
      final urls = await Future.wait([
        for (final f in files)
          if (!tooBig.contains(f)) repo.uploadPhoto(f, phone),
      ]);
      if (!mounted) return;
      setState(() {
        _brand = _brand.copyWith(
          photos: [..._brand.photos, ...urls]
              .take(RetailerBrandModel.maxPhotos)
              .toList(),
        );
      });
      if (tooBig.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Some photos were over 5 MB')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Photo upload failed. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  BrandPosterData? _poster(StoreModel? profile) {
    final phone = _phone;
    final link = phone == null ? null : WebLinks.shop(phone);
    if (phone == null || link == null) return null;
    final b = _fromFields();
    return BrandPosterData(
      shopName: (profile?.name.isNotEmpty == true) ? profile!.name : 'My shop',
      tagline: b.tagline,
      place: [profile?.city, profile?.state]
          .where((s) => s != null && s.isNotEmpty)
          .join(', '),
      phone: phone,
      logoUrl: profile?.logo,
      bannerUrl: profile?.banner,
      photos: b.photos,
      highlights: b.highlights,
      link: link.replaceFirst(RegExp(r'^https?://'), ''),
    );
  }

  InputDecoration _dec(String label, {String? hint, String? helper}) =>
      InputDecoration(labelText: label, hintText: hint, helperText: helper);

  @override
  Widget build(BuildContext context) {
    final profile = _phone == null
        ? null
        : ref.watch(retailerProfileProvider(_phone!)).value;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('My brand page')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_loadError!, textAlign: TextAlign.center),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                  children: [
                    _visibilityCard(profile),
                    const SizedBox(height: 12),
                    _profileCard(profile),
                    const SizedBox(height: 12),
                    _section('Details', [
                      TextField(
                        controller: _tagline,
                        maxLength: RetailerBrandModel.maxTagline,
                        decoration: _dec('Tagline',
                            hint: 'e.g. Trusted seeds & fertilizers since 1998'),
                      ),
                      TextField(
                        controller: _about,
                        maxLength: RetailerBrandModel.maxAbout,
                        minLines: 3,
                        maxLines: 8,
                        decoration: _dec('About your shop',
                            hint:
                                'What you sell, who you help, why farmers trust you…'),
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _year,
                              maxLength: 4,
                              keyboardType: TextInputType.number,
                              decoration: _dec('Established', hint: '1998'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 2,
                            child: TextField(
                              controller: _hours,
                              maxLength: RetailerBrandModel.maxHours,
                              decoration: _dec('Opening hours',
                                  hint: 'Mon–Sat, 8am – 8pm'),
                            ),
                          ),
                        ],
                      ),
                    ]),
                    const SizedBox(height: 12),
                    _highlightsCard(),
                    const SizedBox(height: 12),
                    _photosCard(),
                    const SizedBox(height: 12),
                    _section('Contact & socials', [
                      TextField(
                        controller: _whatsapp,
                        keyboardType: TextInputType.phone,
                        decoration: _dec('WhatsApp number',
                            helper: 'Leave blank to use your shop phone'),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _instagram,
                        decoration: _dec('Instagram', hint: '@yourshop'),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _facebook,
                        decoration:
                            _dec('Facebook', hint: 'facebook.com/yourshop'),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _youtube,
                        decoration: _dec('YouTube', hint: '@yourshop'),
                      ),
                    ]),
                  ],
                ),
      bottomNavigationBar: _loading || _loadError != null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton.icon(
                  onPressed: _saving || _uploading ? null : () => _save(),
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.save_outlined),
                  label: const Text('Save'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _section(String title, List<Widget> children) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: AppTextStyles.heading3),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      );

  /// Opens the poster with the shop's live product count. The listings are
  /// fetched only when sharing (and reused if Shop Profile already loaded
  /// them), never just for opening this editor; on a slow network the poster
  /// opens without the number rather than waiting.
  Future<void> _sharePoster(BrandPosterData poster) async {
    final phone = _phone;
    int? products;
    if (phone != null) {
      products = await ref
          .read(shopListingsProvider(phone).future)
          .timeout(const Duration(seconds: 4))
          .then<int?>((l) => l.where((x) => x.isActive).length, onError: (_) => null);
    }
    if (!mounted) return;
    showBrandPosterSheet(
      context,
      (products ?? 0) > 0
          ? poster.withStats([(posterCount(products!), 'Products')])
          : poster,
    );
  }

  Widget _visibilityCard(StoreModel? profile) {
    final link = _phone == null ? null : WebLinks.shop(_phone!);
    final poster = _poster(profile);
    return _section('Visibility', [
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _brand.enabled,
        onChanged: _saving ? null : _toggleVisible,
        title: Text(
          _brand.enabled ? 'Live — everyone can see it' : 'Hidden',
          style: AppTextStyles.bodyMedium
              .copyWith(fontWeight: FontWeight.w700),
        ),
        subtitle: const Text(
          'When hidden, only you see it and your link shows your store listing.',
        ),
      ),
      const SizedBox(height: 4),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          FilledButton.icon(
            onPressed: poster == null ? null : () => _sharePoster(poster),
            icon: const Icon(Icons.image_outlined, size: 18),
            label: const Text('Share as image'),
          ),
          if (link != null)
            OutlinedButton.icon(
              onPressed: () => LinkShare.shop(
                context,
                phone: _phone!,
                name: profile?.name ?? 'My shop',
              ),
              icon: const Icon(Icons.link, size: 18),
              label: const Text('Share link'),
            ),
          if (_phone != null)
            OutlinedButton.icon(
              onPressed: () => context.push('/shop/${_phone!}'),
              icon: const Icon(Icons.visibility_outlined, size: 18),
              label: const Text('Preview'),
            ),
        ],
      ),
    ]);
  }

  Widget _profileCard(StoreModel? profile) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 52,
                height: 52,
                child: profile?.logo?.isNotEmpty == true
                    ? CachedNetworkImage(
                        imageUrl: profile!.logo!, fit: BoxFit.cover)
                    : const ColoredBox(
                        color: AppColors.surfaceVariant,
                        child: Icon(Icons.storefront_outlined),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    profile?.name ?? '—',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    'Logo, banner, name & address come from your profile',
                    style: AppTextStyles.caption,
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () => context.push('/profile/edit'),
              child: const Text('Edit'),
            ),
          ],
        ),
      );

  Widget _highlightsCard() {
    final full =
        _brand.highlights.length >= RetailerBrandModel.maxHighlights;
    return _section('Highlights', [
      Text('Up to 8 — tap a suggestion or add your own',
          style: AppTextStyles.caption),
      const SizedBox(height: 8),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final h in _brand.highlights)
            InputChip(
              label: Text(h),
              selected: true,
              showCheckmark: false,
              onDeleted: () => setState(() => _brand = _brand.copyWith(
                    highlights:
                        _brand.highlights.where((x) => x != h).toList(),
                  )),
            ),
          for (final h in RetailerBrandModel.suggestedHighlights)
            if (!_brand.highlights.contains(h))
              ActionChip(
                label: Text('+ $h'),
                onPressed: full ? null : () => _addHighlight(h),
              ),
        ],
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: _newHighlight,
              maxLength: RetailerBrandModel.maxHighlight,
              decoration: const InputDecoration(
                hintText: 'Your own highlight',
                counterText: '',
              ),
              onSubmitted: _addHighlight,
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: full ? null : () => _addHighlight(_newHighlight.text),
            child: const Text('Add'),
          ),
        ],
      ),
    ]);
  }

  Widget _photosCard() {
    final photos = _brand.photos;
    final canAdd = photos.length < RetailerBrandModel.maxPhotos;
    return _section('Shop photos', [
      Text('Up to 8 photos of your shop, stock and team',
          style: AppTextStyles.caption),
      const SizedBox(height: 8),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        children: [
          for (final url in photos)
            Stack(
              fit: StackFit.expand,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.cover,
                    memCacheWidth: 300,
                  ),
                ),
                Positioned(
                  top: 4,
                  right: 4,
                  child: GestureDetector(
                    onTap: () => setState(() => _brand = _brand.copyWith(
                          photos: photos.where((p) => p != url).toList(),
                        )),
                    child: const CircleAvatar(
                      radius: 12,
                      backgroundColor: Colors.black54,
                      child: Icon(Icons.close, size: 14, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          if (canAdd)
            InkWell(
              onTap: _uploading ? null : _addPhotos,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.divider, width: 2),
                ),
                child: Center(
                  child: _uploading
                      ? const CircularProgressIndicator(strokeWidth: 2)
                      : const Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.add_a_photo_outlined),
                            SizedBox(height: 4),
                            Text('Add photo', style: TextStyle(fontSize: 12)),
                          ],
                        ),
                ),
              ),
            ),
        ],
      ),
    ]);
  }
}
