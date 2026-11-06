/// A retailer's brand page — the shop's own public page (krishidukan.com/
/// shop/{phone}), the retailer counterpart of a manufacturer's brand page.
///
/// Stored at `retailerBrandPages/{E164 phone}`. Name, logo, banner and
/// address are NOT here: they stay on the shop's profile so there is one
/// source of truth. Limits and parsing mirror web's app/lib/retailer-brand.ts
/// and the `validRetailerBrandPage` rule in firestore.rules.
class RetailerBrandModel {
  static const maxTagline = 120;
  static const maxAbout = 2000;
  static const maxPhotos = 8;
  static const maxHours = 120;
  static const maxHighlights = 8;
  static const maxHighlight = 40;

  static const suggestedHighlights = [
    'Home delivery',
    'Genuine products',
    'Expert crop advice',
    'Soil testing',
    'Seeds & saplings',
    'Credit for farmers',
    'Bulk orders',
    'Open on Sundays',
  ];

  /// Public visibility. Off = only the owner sees it.
  final bool enabled;
  final String tagline;
  final String about;
  final String establishedYear;
  final List<String> photos;
  final String openingHours;
  final List<String> highlights;

  /// WhatsApp number for the Chat button; blank = the shop phone.
  final String whatsapp;
  final String instagram;
  final String facebook;
  final String youtube;

  const RetailerBrandModel({
    this.enabled = false,
    this.tagline = '',
    this.about = '',
    this.establishedYear = '',
    this.photos = const [],
    this.openingHours = '',
    this.highlights = const [],
    this.whatsapp = '',
    this.instagram = '',
    this.facebook = '',
    this.youtube = '',
  });

  static String _str(dynamic v, int max) {
    if (v is! String) return '';
    final t = v.trim();
    return t.length > max ? t.substring(0, max) : t;
  }

  static String _https(dynamic v) {
    final s = _str(v, 300);
    return s.toLowerCase().startsWith('https://') ? s : '';
  }

  static const _socialHosts = {
    'instagram': 'https://instagram.com/',
    'facebook': 'https://facebook.com/',
    'youtube': 'https://youtube.com/@',
  };

  /// A social link as typed — "https://…", "instagram.com/shop" or "@shop" —
  /// as an https URL, or '' when it can't be one. Same rule as web's socialUrl.
  static String socialUrl(String kind, dynamic raw) {
    var v = _str(raw, 300);
    if (v.isEmpty) return '';
    final handle = RegExp(r'^@?[\w.-]{2,60}$');
    if (handle.hasMatch(v) && !v.contains('.')) {
      return _socialHosts[kind]! + v.replaceFirst('@', '');
    }
    if (RegExp(r'^@[\w.-]{2,60}$').hasMatch(v)) {
      return _socialHosts[kind]! + v.substring(1);
    }
    if (v.toLowerCase().startsWith('http://')) v = 'https://${v.substring(7)}';
    if (!v.toLowerCase().startsWith('https://')) v = 'https://$v';
    final uri = Uri.tryParse(v);
    return (uri != null && uri.host.contains('.')) ? uri.toString() : '';
  }

  factory RetailerBrandModel.fromMap(Map<String, dynamic>? d) {
    if (d == null) return const RetailerBrandModel();
    final social = d['socialLinks'] is Map
        ? Map<String, dynamic>.from(d['socialLinks'] as Map)
        : const <String, dynamic>{};
    final year =
        _str(d['establishedYear'], 20).replaceAll(RegExp(r'\D'), '');
    return RetailerBrandModel(
      enabled: d['enabled'] == true,
      tagline: _str(d['tagline'], maxTagline),
      about: _str(d['about'], maxAbout),
      establishedYear: year.length > 4 ? year.substring(0, 4) : year,
      photos: (d['photos'] is List ? d['photos'] as List : const [])
          .map(_https)
          .where((s) => s.isNotEmpty)
          .take(maxPhotos)
          .toList(),
      openingHours: _str(d['openingHours'], maxHours),
      highlights: (d['highlights'] is List ? d['highlights'] as List : const [])
          .map((h) => _str(h, maxHighlight))
          .where((s) => s.isNotEmpty)
          .take(maxHighlights)
          .toList(),
      whatsapp: _str(d['whatsapp'], 16).replaceAll(RegExp(r'[^\d+]'), ''),
      instagram: socialUrl('instagram', social['instagram']),
      facebook: socialUrl('facebook', social['facebook']),
      youtube: socialUrl('youtube', social['youtube']),
    );
  }

  /// The fields written to Firestore — the rules reject any other key.
  Map<String, dynamic> toMap() {
    final clean = RetailerBrandModel.fromMap({
      'enabled': enabled,
      'tagline': tagline,
      'about': about,
      'establishedYear': establishedYear,
      'photos': photos,
      'openingHours': openingHours,
      'highlights': highlights,
      'whatsapp': whatsapp,
      'socialLinks': {
        'instagram': instagram,
        'facebook': facebook,
        'youtube': youtube,
      },
    });
    return {
      'enabled': enabled,
      'tagline': clean.tagline,
      'about': clean.about,
      'establishedYear': clean.establishedYear,
      'photos': clean.photos,
      'openingHours': clean.openingHours,
      'highlights': clean.highlights,
      'whatsapp': clean.whatsapp,
      'socialLinks': {
        if (clean.instagram.isNotEmpty) 'instagram': clean.instagram,
        if (clean.facebook.isNotEmpty) 'facebook': clean.facebook,
        if (clean.youtube.isNotEmpty) 'youtube': clean.youtube,
      },
    };
  }

  RetailerBrandModel copyWith({
    bool? enabled,
    String? tagline,
    String? about,
    String? establishedYear,
    List<String>? photos,
    String? openingHours,
    List<String>? highlights,
    String? whatsapp,
    String? instagram,
    String? facebook,
    String? youtube,
  }) =>
      RetailerBrandModel(
        enabled: enabled ?? this.enabled,
        tagline: tagline ?? this.tagline,
        about: about ?? this.about,
        establishedYear: establishedYear ?? this.establishedYear,
        photos: photos ?? this.photos,
        openingHours: openingHours ?? this.openingHours,
        highlights: highlights ?? this.highlights,
        whatsapp: whatsapp ?? this.whatsapp,
        instagram: instagram ?? this.instagram,
        facebook: facebook ?? this.facebook,
        youtube: youtube ?? this.youtube,
      );

  bool get hasContent =>
      tagline.isNotEmpty ||
      about.isNotEmpty ||
      photos.isNotEmpty ||
      highlights.isNotEmpty ||
      openingHours.isNotEmpty;
}
