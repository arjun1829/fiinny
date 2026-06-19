import 'package:flutter/foundation.dart' show kIsWeb;
import '../constants/app_config.dart';

/// Resolves an image URL for the current platform.
///
/// On Flutter **web**, cross-origin images whose host doesn't send CORS headers
/// fail to render (CanvasKit fetches them with crossOrigin=anonymous). To make
/// them display during web testing we route them through our own `/api/img`
/// proxy, which re-serves the bytes with `Access-Control-Allow-Origin`.
///
/// On native (Android/iOS) there is no CORS restriction, so the original URL is
/// returned unchanged.
String resolveImageUrl(String? url) {
  if (url == null || url.isEmpty) return '';
  if (!kIsWeb) return url;
  // Leave data URIs and already-proxied/same-origin URLs alone.
  if (url.startsWith('data:')) return url;
  if (!url.startsWith('http')) return url;
  if (url.startsWith('${AppConfig.apiBaseUrl}/api/img')) return url;
  return '${AppConfig.apiBaseUrl}/api/img?url=${Uri.encodeComponent(url)}';
}
