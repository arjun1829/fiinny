import '../constants/app_config.dart';

/// Builders for the public website URLs we put in share messages.
///
/// Every URL here MUST correspond to a real route on the Next.js site, and
/// the slug format MUST match the web's builders (buildProductSlug in
/// app/lib/seo/products-server.ts, buildReelSlug in app/lib/seo/reels-server.ts):
/// `{kebab-name}-{docId}` — the web resolves by the trailing doc id, so the
/// name part is cosmetic but makes links readable and SEO-friendly.
///
/// Base comes from AppConfig.apiBaseUrl so UAT builds share UAT links.
class WebLinks {
  WebLinks._();

  static String get _base => AppConfig.apiBaseUrl;

  static String _slug(String name, String id) {
    var base = name
        .toLowerCase()
        .replaceAll(RegExp(r'[^\w\s-]'), '')
        .trim()
        .replaceAll(RegExp(r'\s+'), '-')
        .replaceAll(RegExp(r'-+'), '-');
    if (base.length > 70) base = base.substring(0, 70);
    return base.isEmpty ? id : '$base-$id';
  }

  static String product(String name, String id) =>
      '$_base/?view=product&product=$id';

  /// Reel page with title/thumbnail link preview.
  static String reel(String title, String id) =>
      '$_base/reels/${_slug(title, id)}';

  /// Manufacturer invite. There is no /signup route on the web — the SPA
  /// reads ?inviteCode= on the home URL and opens the signup view itself.
  static String invite(String inviteCode) =>
      '$_base/?inviteCode=${Uri.encodeComponent(inviteCode)}';
}
