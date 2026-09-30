import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/services/places_service.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/loading_overlay.dart';
import '../../auth/data/auth_repository.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../../marketplace/providers/marketplace_provider.dart';

/// Editable profile / "complete your profile" screen.
///
/// Shown right after signup and after a seller's first subscription purchase
/// (reason == 'new_account'), and reachable any time from the Profile tab.
/// Collects the fields the web requires: name, and for sellers a business name
/// plus address/city/state/pincode.
class ProfileEditScreen extends ConsumerStatefulWidget {
  /// 'new_account' when part of the signup/first-purchase flow; null when the
  /// user opened it manually to edit.
  final String? reason;

  /// Set by a `profile_incomplete` notification. Any non-null value turns on
  /// missing-field highlighting; the value itself is the backend's
  /// pipe-separated list of what was missing when the reminder was sent. The
  /// list is only used for the banner wording — which fields actually get
  /// outlined is recomputed from the live form, so a reminder that arrived
  /// before the user filled something in cannot flag a field they just fixed.
  final String? highlight;

  const ProfileEditScreen({super.key, this.reason, this.highlight});

  @override
  ConsumerState<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends ConsumerState<ProfileEditScreen> {
  final _formKey = GlobalKey<FormState>();
  final _repo = AuthRepository();

  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _secondaryPhoneCtrl = TextEditingController();
  final _businessCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();
  final _gstinCtrl = TextEditingController();
  final _mapsUrlCtrl = TextEditingController();
  final _websiteCtrl = TextEditingController();
  final _instagramCtrl = TextEditingController();
  final _facebookCtrl = TextEditingController();
  final _whatsappCtrl = TextEditingController();
  final _youtubeCtrl = TextEditingController();

  bool _saving = false;
  bool _prefilled = false;

  // Set by "Use my current location"; saved as the shop's map pin (`geo`).
  GeoPoint? _geo;
  bool _locating = false;
  String? _error;

  // Shop/profile logo + banner — picked files shown immediately, uploaded on Save.
  File? _logoFile;
  String? _existingLogoUrl;
  bool _uploadingLogo = false;
  File? _bannerFile;
  String? _existingBannerUrl;
  bool _uploadingBanner = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _secondaryPhoneCtrl.dispose();
    _businessCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _pincodeCtrl.dispose();
    _gstinCtrl.dispose();
    _mapsUrlCtrl.dispose();
    _websiteCtrl.dispose();
    _instagramCtrl.dispose();
    _facebookCtrl.dispose();
    _whatsappCtrl.dispose();
    _youtubeCtrl.dispose();
    super.dispose();
  }

  /// The canonical GSTIN + Google Maps link live on retailers/{phone} (what
  /// the web dashboard edits), so when the users-doc mirrors are empty pull
  /// them from there — otherwise values set on web would look blank here.
  Future<void> _prefillFromRoleDoc(String role, String phone) async {
    final col = role == 'manufacturer' ? 'manufacturers' : 'retailers';
    try {
      final snap = await FirebaseFirestore.instance
          .collection(col)
          .doc(phone)
          .get();
      final d = snap.data();
      if (!mounted || d == null) return;
      final gstin = d['gstin'] as String?;
      if (gstin != null && gstin.isNotEmpty && _gstinCtrl.text.isEmpty) {
        _gstinCtrl.text = gstin;
      }
      final mapsUrl = d['googleMapsUrl'] as String?;
      if (mapsUrl != null && mapsUrl.isNotEmpty && _mapsUrlCtrl.text.isEmpty) {
        _mapsUrlCtrl.text = mapsUrl;
      }
      final logo = d['logo'] as String?;
      if (logo != null && logo.isNotEmpty && _existingLogoUrl == null) {
        setState(() => _existingLogoUrl = logo);
      }
      // secondaryPhone / website / banner / socialLinks live only on the role
      // doc (and profiles/{phone}) — never mirrored to users/{phone}, so this
      // is the only place to prefill them from.
      void fill(TextEditingController c, Object? v) {
        final s = (v as String?)?.trim() ?? '';
        if (s.isNotEmpty && c.text.isEmpty) c.text = s;
      }
      fill(_secondaryPhoneCtrl, d['secondaryPhone']);
      fill(_websiteCtrl, d['website']);
      final social = d['socialLinks'];
      if (social is Map) {
        fill(_instagramCtrl, social['instagram']);
        fill(_facebookCtrl, social['facebook']);
        fill(_whatsappCtrl, social['whatsapp']);
        fill(_youtubeCtrl, social['youtube']);
      }
      final banner = d['banner'] as String?;
      if (banner != null && banner.isNotEmpty && _existingBannerUrl == null) {
        setState(() => _existingBannerUrl = banner);
      }
    } catch (_) {}
  }

  String? _required(String? v) =>
      (v == null || v.trim().isEmpty) ? 'Required' : null;

  /// Shared camera/gallery picker with the same 5 MB guard for both the logo
  /// and the banner. `maxWidth` differs so a wide banner keeps its resolution.
  Future<File?> _pickImage({required int maxWidth}) async {
    final picker = ImagePicker();
    final source = await showDialog<ImageSource>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Select image source'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.camera),
            child: const Text('Camera'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.gallery),
            child: const Text('Gallery'),
          ),
        ],
      ),
    );
    if (source == null) return null;
    final xFile = await picker.pickImage(
      source: source,
      maxWidth: maxWidth.toDouble(),
      imageQuality: 85,
    );
    if (xFile == null || !mounted) return null;
    final file = File(xFile.path);
    // Matches storage.rules' 5 MB cap on profile-images/** — fail fast with a
    // clear message instead of letting the upload get rejected server-side.
    final bytes = await file.length();
    if (bytes > 5 * 1024 * 1024) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Image must be less than 5MB')),
        );
      }
      return null;
    }
    return file;
  }

  Future<void> _pickLogo() async {
    final f = await _pickImage(maxWidth: 1024);
    if (f != null) setState(() => _logoFile = f);
  }

  Future<void> _pickBanner() async {
    final f = await _pickImage(maxWidth: 1600);
    if (f != null) setState(() => _bannerFile = f);
  }

  Future<void> _save(String role, String phone) async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final dashRepo = DashboardRepository();

      String? logoUrl = _existingLogoUrl;
      if (_logoFile != null) {
        setState(() => _uploadingLogo = true);
        try {
          logoUrl = await dashRepo.uploadProfileLogo(_logoFile!, phone);
        } finally {
          if (mounted) setState(() => _uploadingLogo = false);
        }
      }

      String? bannerUrl = _existingBannerUrl;
      if (_bannerFile != null) {
        setState(() => _uploadingBanner = true);
        try {
          bannerUrl = await dashRepo.uploadProfileBanner(_bannerFile!, phone);
        } finally {
          if (mounted) setState(() => _uploadingBanner = false);
        }
      }

      final social = <String, String>{
        'instagram': _instagramCtrl.text.trim(),
        'facebook': _facebookCtrl.text.trim(),
        'whatsapp': _whatsappCtrl.text.trim(),
        'youtube': _youtubeCtrl.text.trim(),
      };

      await _repo.saveProfile(
        phone: phone,
        role: role,
        name: _nameCtrl.text.trim(),
        email: _emailCtrl.text.trim(),
        businessName: _businessCtrl.text.trim(),
        address: _addressCtrl.text.trim(),
        city: _cityCtrl.text.trim(),
        state: _stateCtrl.text.trim(),
        pincode: _pincodeCtrl.text.trim(),
        gstin: _gstinCtrl.text.trim().toUpperCase(),
        googleMapsUrl: _mapsUrlCtrl.text.trim(),
        logoUrl: logoUrl,
        secondaryPhone: _secondaryPhoneCtrl.text.trim(),
        website: _websiteCtrl.text.trim(),
        bannerUrl: bannerUrl,
        // Only send the map for sellers, and only when at least one link is set,
        // so a non-seller save never writes an empty socialLinks map.
        socialLinks: (role == 'retailer' || role == 'manufacturer') &&
                social.values.any((v) => v.isNotEmpty)
            ? social
            : null,
        geo: _geo,
      );

      ref.invalidate(currentUserProvider);
      // The avatar on Profile reads retailerProfileProvider, which is keyed
      // by phone and won't otherwise know the logo doc just changed.
      ref.invalidate(retailerProfileProvider(phone));
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Profile saved'),
          backgroundColor: AppColors.success,
        ),
      );

      // Route onward. During signup/first purchase, continue into the app;
      // otherwise just return to wherever they came from.
      if (widget.reason == 'new_account') {
        final isSeller = role == 'retailer' || role == 'manufacturer';
        context.go(isSeller ? '/dashboard' : '/');
      } else if (context.canPop()) {
        context.pop();
      } else {
        context.go('/profile');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Could not save profile. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(currentUserProvider);

    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) => const Scaffold(
          body: Center(child: Text('Failed to load profile.'))),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: Center(child: Text('Not logged in.')));
        }

        // Prefill once from the loaded user doc.
        if (!_prefilled) {
          _nameCtrl.text = user.name;
          _emailCtrl.text = user.email ?? '';
          _businessCtrl.text = user.businessName ?? '';
          _addressCtrl.text = user.address ?? '';
          _cityCtrl.text = user.city ?? '';
          _stateCtrl.text = user.state ?? '';
          _pincodeCtrl.text = user.pincode ?? '';
          _gstinCtrl.text = user.gstin ?? '';
          _mapsUrlCtrl.text = user.googleMapsUrl ?? '';
          // Always fetch for sellers — not just when gstin/mapsUrl are
          // empty — since this is also the only place the existing logo
          // (never mirrored to users/{phone}) can be prefilled from.
          if (user.isSeller) {
            _prefillFromRoleDoc(user.role, user.phone);
          }
          _prefilled = true;
        }

        final isSeller = user.isSeller;
        final isNew = widget.reason == 'new_account';

        return LoadingOverlay(
          isLoading: _saving,
          message: 'Saving…',
          child: Scaffold(
            backgroundColor: AppColors.background,
            appBar: AppBar(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              title: Text(isNew ? 'Complete Your Profile' : 'Edit Profile',
                  style: AppTextStyles.heading2.copyWith(color: Colors.white)),
              automaticallyImplyLeading: !isNew,
            ),
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_highlighting) _MissingBanner(missing: _missingNow(isSeller)),
                    if (isNew)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(
                          isSeller
                              ? 'Add your shop details so customers can find and trust you.'
                              : 'Add a few details to finish setting up your account.',
                          style: AppTextStyles.body
                              .copyWith(color: AppColors.onSurfaceVariant),
                        ),
                      ),

                    // Shop banner + logo — sellers only, same fields
                    // (retailers/manufacturers/{phone}.banner/.logo, mirrored
                    // to profiles/{phone}) the web dashboard's uploaders set.
                    if (isSeller) ...[
                      _BannerPicker(
                        file: _bannerFile,
                        existingUrl: _existingBannerUrl,
                        uploading: _uploadingBanner,
                        onTap: _pickBanner,
                      ),
                      const SizedBox(height: 12),
                      Center(child: _LogoPicker(
                        file: _logoFile,
                        existingUrl: _existingLogoUrl,
                        uploading: _uploadingLogo,
                        onTap: _pickLogo,
                      )),
                      const SizedBox(height: 24),
                    ],

                    Text('Your Details', style: AppTextStyles.heading3),
                    const SizedBox(height: 12),
                    _field(_nameCtrl,
                        isSeller ? 'Owner name' : 'Full Name',
                        Icons.person_outline,
                        validator: _required, highlightIfEmpty: true),
                    const SizedBox(height: 12),
                    _field(_emailCtrl, 'Email (optional)', Icons.email_outlined,
                        keyboardType: TextInputType.emailAddress),
                    if (isSeller) ...[
                      const SizedBox(height: 12),
                      _field(_secondaryPhoneCtrl,
                          'Secondary mobile (optional)', Icons.phone_outlined,
                          keyboardType: TextInputType.phone,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(10),
                          ],
                          validator: (v) {
                            final s = v?.trim() ?? '';
                            if (s.isEmpty) return null;
                            return s.length == 10
                                ? null
                                : 'Enter exactly 10 digits';
                          }),
                    ],

                    if (isSeller) ...[
                      const SizedBox(height: 24),
                      Text('Shop Details', style: AppTextStyles.heading3),
                      const SizedBox(height: 12),
                      _field(_businessCtrl, 'Shop / Business Name',
                          Icons.storefront_outlined,
                          validator: _required, highlightIfEmpty: true),
                      const SizedBox(height: 12),
                      _locationButton(
                          hint: 'Tap while you are at your shop — it also '
                              'pins your shop on the store map.'),
                      const SizedBox(height: 12),
                      _field(_addressCtrl, 'Address', Icons.home_outlined,
                          maxLines: 2,
                          validator: _required,
                          highlightIfEmpty: true),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _field(_cityCtrl, 'City',
                                Icons.location_city_outlined,
                                validator: _required),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _field(
                                _stateCtrl, 'State', Icons.map_outlined),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _field(_pincodeCtrl, 'Pincode', Icons.pin_outlined,
                          keyboardType: TextInputType.number,
                          highlightIfEmpty: true,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(6),
                          ]),
                      const SizedBox(height: 12),
                      // Printed on invoices (web + mobile). 15-char GSTIN.
                      // Required to switch on Online Delivery — the toggle in
                      // Settings enforces it, matching web/admin.
                      _field(_gstinCtrl, 'GSTIN (required for Online Delivery)',
                          Icons.receipt_long_outlined,
                          inputFormatters: [
                            LengthLimitingTextInputFormatter(15),
                            FilteringTextInputFormatter.allow(
                                RegExp(r'[a-zA-Z0-9]')),
                            TextInputFormatter.withFunction(
                              (oldValue, newValue) => newValue.copyWith(
                                  text: newValue.text.toUpperCase()),
                            ),
                          ],
                          validator: (v) {
                            final s = v?.trim() ?? '';
                            if (s.isEmpty) return null;
                            return s.length == 15
                                ? null
                                : 'GSTIN must be 15 characters';
                          }),
                      const SizedBox(height: 12),
                      // Shown to buyers in the Store Locator "Directions"
                      // flow instead of raw coordinates — paste the "Share"
                      // link of your Google Business / Maps listing.
                      _field(_mapsUrlCtrl, 'Google Maps store link (optional)',
                          Icons.map_outlined,
                          keyboardType: TextInputType.url,
                          validator: (v) {
                            final s = v?.trim() ?? '';
                            if (s.isEmpty) return null;
                            return s.startsWith('http')
                                ? null
                                : 'Paste a full link starting with https://';
                          }),
                      Padding(
                        padding: const EdgeInsets.only(top: 4, left: 4),
                        child: Text(
                          'Open your shop on Google Maps → Share → Copy link, '
                          'and paste it here. Buyers will see your Google '
                          'listing with photos & reviews.',
                          style: AppTextStyles.caption
                              .copyWith(color: AppColors.onSurfaceVariant),
                        ),
                      ),

                      const SizedBox(height: 24),
                      Text('Website & Social', style: AppTextStyles.heading3),
                      const SizedBox(height: 12),
                      _field(_websiteCtrl, 'Website (optional)',
                          Icons.language_outlined,
                          keyboardType: TextInputType.url,
                          validator: (v) {
                            final s = v?.trim() ?? '';
                            if (s.isEmpty) return null;
                            return s.startsWith('http')
                                ? null
                                : 'Start with https://';
                          }),
                      const SizedBox(height: 12),
                      _field(_instagramCtrl, 'Instagram (optional)',
                          Icons.camera_alt_outlined),
                      const SizedBox(height: 12),
                      _field(_facebookCtrl, 'Facebook (optional)',
                          Icons.facebook_outlined),
                      const SizedBox(height: 12),
                      _field(_whatsappCtrl, 'WhatsApp (optional)',
                          Icons.chat_outlined,
                          keyboardType: TextInputType.phone),
                      const SizedBox(height: 12),
                      _field(_youtubeCtrl, 'YouTube (optional)',
                          Icons.play_circle_outline),
                    ] else ...[
                      const SizedBox(height: 24),
                      Text('Delivery Address (optional)',
                          style: AppTextStyles.heading3),
                      const SizedBox(height: 12),
                      _locationButton(),
                      const SizedBox(height: 12),
                      _field(_addressCtrl, 'Address', Icons.home_outlined,
                          maxLines: 2),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _field(_cityCtrl, 'City',
                                Icons.location_city_outlined),
                          ),
                          const SizedBox(width: 12),
                          SizedBox(
                            width: 120,
                            child: _field(_pincodeCtrl, 'Pincode',
                                Icons.pin_outlined,
                                keyboardType: TextInputType.number,
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly,
                                  LengthLimitingTextInputFormatter(6),
                                ]),
                          ),
                        ],
                      ),
                    ],

                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_error!,
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.error)),
                      ),
                    ],

                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: FilledButton(
                        onPressed:
                            _saving ? null : () => _save(user.role, user.phone),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(isNew ? 'Save & Continue' : 'Save',
                            style: AppTextStyles.button),
                      ),
                    ),
                    if (isNew && !isSeller) ...[
                      const SizedBox(height: 8),
                      Center(
                        child: TextButton(
                          onPressed: _saving ? null : () => context.go('/'),
                          child: const Text('Skip for now'),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// True once the user arrived from a "complete your profile" reminder.
  bool get _highlighting => widget.highlight != null;

  /// Required-and-still-empty fields, recomputed on every build so an outline
  /// clears the moment the user types into it.
  List<String> _missingNow(bool isSeller) {
    final missing = <String>[];
    if (_nameCtrl.text.trim().isEmpty) missing.add('Full Name');
    if (isSeller && _businessCtrl.text.trim().isEmpty) {
      missing.add('Shop / Business Name');
    }
    if (_addressCtrl.text.trim().isEmpty && _cityCtrl.text.trim().isEmpty) {
      missing.add('Address');
    }
    if (_pincodeCtrl.text.trim().isEmpty) missing.add('Pincode');
    return missing;
  }

  /// "Use my current location": GPS fix → Google reverse geocode → fills
  /// address, city, state and pincode (the same fill the web profile's
  /// button does), and keeps the coordinates for the shop's map pin.
  Future<void> _useCurrentLocation() async {
    final messenger = ScaffoldMessenger.of(context);
    void say(String msg, {SnackBarAction? action}) => messenger.showSnackBar(
        SnackBar(content: Text(msg), action: action));

    setState(() => _locating = true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        say('Location is turned off on your phone.',
            action: SnackBarAction(
                label: 'Turn on', onPressed: Geolocator.openLocationSettings));
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        say('Location permission is blocked for KrishiDukan.',
            action: SnackBarAction(
                label: 'Settings', onPressed: Geolocator.openAppSettings));
        return;
      }
      if (permission == LocationPermission.denied) {
        say('Allow location access to fill your address automatically.');
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      final place = await PlacesService.reverseGeocode(
          pos.latitude, pos.longitude, AppConfig.googleMapsApiKey);
      if (!mounted) return;

      setState(() {
        _geo = GeoPoint(pos.latitude, pos.longitude);
        if (place == null) return;
        String clean(String? v) => (v ?? '').trim();
        // Drop the trailing country — every address here is in India.
        final line = clean(place.formattedAddress)
            .replaceFirst(RegExp(r',\s*India$'), '');
        if (line.isNotEmpty) _addressCtrl.text = line;
        if (clean(place.city).isNotEmpty) _cityCtrl.text = clean(place.city);
        if (clean(place.state).isNotEmpty) _stateCtrl.text = clean(place.state);
        final pin = clean(place.pincode).replaceAll(RegExp(r'\D'), '');
        if (pin.length == 6) _pincodeCtrl.text = pin;
      });
      say(place == null
          ? 'Location found, but the address could not be read. Please type it.'
          : 'Address filled from your location. Check it before saving.');
    } catch (_) {
      if (mounted) {
        say('Could not get your location. Try again outside or near a window.');
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Widget _locationButton({String? hint}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _locating ? null : _useCurrentLocation,
            icon: _locating
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : Icon(_geo != null ? Icons.check_circle : Icons.my_location,
                    size: 18),
            label: Text(_locating
                ? 'Finding your location…'
                : _geo != null
                    ? 'Location added — tap to refresh'
                    : 'Use my current location'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary),
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        if (hint != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(hint,
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.onSurfaceVariant)),
          ),
      ],
    );
  }

  Widget _field(
    TextEditingController controller,
    String label,
    IconData icon, {
    String? Function(String?)? validator,
    TextInputType? keyboardType,
    int maxLines = 1,
    List<TextInputFormatter>? inputFormatters,
    bool highlightIfEmpty = false,
  }) {
    final flagged =
        _highlighting && highlightIfEmpty && controller.text.trim().isEmpty;

    return TextFormField(
      controller: controller,
      validator: validator,
      keyboardType: keyboardType,
      maxLines: maxLines,
      inputFormatters: inputFormatters,
      style: AppTextStyles.body,
      // Only while highlighting: rebuild per keystroke so the amber outline
      // disappears as soon as the field has content.
      onChanged: _highlighting ? (_) => setState(() {}) : null,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: flagged ? AppColors.error : null),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        enabledBorder: flagged
            ? OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide:
                    const BorderSide(color: AppColors.error, width: 1.5),
              )
            : null,
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
      ),
    );
  }
}

/// "Still missing…" callout shown when the screen is opened from a profile
/// completion reminder. Turns green once every required field has content, so
/// the user gets confirmation before they even hit Save.
class _MissingBanner extends StatelessWidget {
  final List<String> missing;
  const _MissingBanner({required this.missing});

  @override
  Widget build(BuildContext context) {
    final done = missing.isEmpty;
    final color = done ? AppColors.success : AppColors.error;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(done ? Icons.check_circle_outline : Icons.error_outline,
              color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  done ? 'All set — tap Save' : 'Complete your profile',
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.w800, color: color),
                ),
                const SizedBox(height: 3),
                Text(
                  done
                      ? 'Everything we need is filled in.'
                      : 'Still missing: ${missing.join(", ")}. '
                          'A complete profile helps buyers find and trust your store.',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Tappable circular avatar with a camera badge — shows the freshly-picked
/// file if there is one, else the existing logo URL, else an icon
/// placeholder. Upload itself happens on Save (see `_save`), not on pick, so
/// there's a single write path and no orphaned-then-abandoned edit state.
class _LogoPicker extends StatelessWidget {
  final File? file;
  final String? existingUrl;
  final bool uploading;
  final VoidCallback onTap;
  const _LogoPicker({
    required this.file,
    required this.existingUrl,
    required this.uploading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasExisting = existingUrl != null && existingUrl!.isNotEmpty;

    return GestureDetector(
      onTap: uploading ? null : onTap,
      child: Stack(
        children: [
          CircleAvatar(
            radius: 44,
            backgroundColor: AppColors.primaryContainer,
            backgroundImage: file != null
                ? FileImage(file!)
                : hasExisting
                    ? CachedNetworkImageProvider(existingUrl!) as ImageProvider
                    : null,
            child: (file == null && !hasExisting)
                ? const Icon(Icons.storefront_outlined,
                    size: 36, color: AppColors.primary)
                : null,
          ),
          if (uploading)
            const Positioned.fill(
              child: CircleAvatar(
                backgroundColor: Colors.black38,
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
                ),
              ),
            )
          else
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                  border: Border.fromBorderSide(
                      BorderSide(color: Colors.white, width: 2)),
                ),
                child: const Icon(Icons.camera_alt,
                    size: 16, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}

/// Wide tappable banner strip — freshly-picked file, else existing URL, else a
/// dashed "add a banner" placeholder. Upload happens on Save, same as the logo.
class _BannerPicker extends StatelessWidget {
  final File? file;
  final String? existingUrl;
  final bool uploading;
  final VoidCallback onTap;
  const _BannerPicker({
    required this.file,
    required this.existingUrl,
    required this.uploading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasExisting = existingUrl != null && existingUrl!.isNotEmpty;

    return GestureDetector(
      onTap: uploading ? null : onTap,
      child: Container(
        height: 120,
        width: double.infinity,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: AppColors.primaryContainer,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
          image: file != null
              ? DecorationImage(image: FileImage(file!), fit: BoxFit.cover)
              : hasExisting
                  ? DecorationImage(
                      image: CachedNetworkImageProvider(existingUrl!),
                      fit: BoxFit.cover)
                  : null,
        ),
        child: uploading
            ? const Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                ),
              )
            : (file == null && !hasExisting)
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.add_photo_alternate_outlined,
                            color: AppColors.primary),
                        const SizedBox(height: 4),
                        Text('Add a shop banner (optional)',
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.onSurfaceVariant)),
                      ],
                    ),
                  )
                : Align(
                    alignment: Alignment.bottomRight,
                    child: Container(
                      margin: const EdgeInsets.all(8),
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.camera_alt,
                          size: 16, color: Colors.white),
                    ),
                  ),
      ),
    );
  }
}
