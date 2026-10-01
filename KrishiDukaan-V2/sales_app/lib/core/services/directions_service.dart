import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/app_config.dart';
import 'location_service.dart';

class RouteResult {
  final double totalDistanceKm;
  final String? encodedPolyline;
  const RouteResult(this.totalDistanceKm, this.encodedPolyline);
}

/// Road distance + route shape for an ordered list of waypoints.
///
/// Delegates to the existing `/api/directions` Next.js route rather than
/// calling the Google Routes API from the device: that route already holds the
/// server-side billing key and falls back to OSRM when Google is unavailable,
/// and keeping it server-side means no Routes-enabled key ships in the APK.
class DirectionsService {
  DirectionsService._();

  static Future<RouteResult?> route(List<LatLngPoint> waypoints) async {
    if (waypoints.length < 2) return null;
    try {
      final res = await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/directions'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'waypoints': [
                for (final w in waypoints) {'lat': w.lat, 'lng': w.lng},
              ],
            }),
          )
          .timeout(const Duration(seconds: 20));

      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final km = data['totalDistanceKm'];
      if (km is! num) return null;
      return RouteResult(km.toDouble(), data['encodedPolyline'] as String?);
    } catch (_) {
      // Distance is a nice-to-have on the session summary. Never let it block
      // the rep from ending their day — the caller stores null and moves on.
      return null;
    }
  }

  /// Decodes a Google encoded polyline into points for the map overlay.
  static List<LatLngPoint> decodePolyline(String encoded) {
    final points = <LatLngPoint>[];
    var index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      int shift = 0, result = 0, b;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);

      shift = 0;
      result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);

      points.add(LatLngPoint(lat / 1e5, lng / 1e5));
    }
    return points;
  }
}
