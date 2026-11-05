import 'dart:convert';
import 'dart:math' as math;

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

  /// Google caps a request at 25 intermediate stops, and a full day of 15-minute
  /// breadcrumbs plus visits can exceed that. Splits the waypoints into legs of
  /// at most [legSize] points (sharing their boundary point), routes each, and
  /// stitches the distances and polylines together.
  ///
  /// A leg whose lookup fails falls back to straight-line distance for that leg
  /// only, so one bad request doesn't discard the whole day. Returns null only
  /// when there is nothing to route.
  static Future<RouteResult?> routeLong(
    List<LatLngPoint> waypoints, {
    int legSize = 20,
  }) async {
    if (waypoints.length < 2) return null;
    var km = 0.0;
    final line = <LatLngPoint>[];
    for (var i = 0; i < waypoints.length - 1; i += legSize - 1) {
      final end = math.min(i + legSize, waypoints.length);
      final leg = waypoints.sublist(i, end);
      final r = await route(leg);
      if (r != null) {
        km += r.totalDistanceKm;
        final pl = r.encodedPolyline;
        line.addAll(pl != null && pl.isNotEmpty ? decodePolyline(pl) : leg);
      } else {
        km += straightLineKm(leg);
        line.addAll(leg);
      }
      if (end == waypoints.length) break;
    }
    return RouteResult(
      double.parse(km.toStringAsFixed(2)),
      encodePolyline(line),
    );
  }

  static double haversineKm(LatLngPoint a, LatLngPoint b) {
    const r = 6371.0;
    double rad(double d) => d * math.pi / 180;
    final dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    final h =
        math.pow(math.sin(dLat / 2), 2) +
        math.cos(rad(a.lat)) * math.cos(rad(b.lat)) * math.pow(math.sin(dLng / 2), 2);
    return 2 * r * math.asin(math.min(1, math.sqrt(h)));
  }

  static double straightLineKm(List<LatLngPoint> pts) {
    var km = 0.0;
    for (var i = 1; i < pts.length; i++) {
      km += haversineKm(pts[i - 1], pts[i]);
    }
    return km;
  }

  /// Inverse of [decodePolyline] (Google encoded polyline, 1e5 precision).
  static String encodePolyline(List<LatLngPoint> points) {
    final sb = StringBuffer();
    var pLat = 0, pLng = 0;
    void put(int v) {
      var n = v < 0 ? ~(v << 1) : v << 1;
      while (n >= 0x20) {
        sb.writeCharCode((0x20 | (n & 0x1f)) + 63);
        n >>= 5;
      }
      sb.writeCharCode(n + 63);
    }

    for (final p in points) {
      final lat = (p.lat * 1e5).round(), lng = (p.lng * 1e5).round();
      put(lat - pLat);
      put(lng - pLng);
      pLat = lat;
      pLng = lng;
    }
    return sb.toString();
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
