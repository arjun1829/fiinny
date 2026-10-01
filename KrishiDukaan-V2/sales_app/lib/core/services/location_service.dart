import 'package:geolocator/geolocator.dart';

/// Thrown when a fresh GPS fix could not be obtained. Every caller in this app
/// treats that as fatal rather than falling back to a default or cached point:
/// a dealer visit stamped with stale or invented coordinates is worse than no
/// visit at all, because the whole purpose of the record is proving where the
/// rep actually was.
class LocationException implements Exception {
  final String message;
  const LocationException(this.message);
  @override
  String toString() => message;
}

class LatLngPoint {
  final double lat;
  final double lng;
  const LatLngPoint(this.lat, this.lng);
}

class LocationService {
  LocationService._();

  /// Requests permission if needed, then returns a fresh high-accuracy fix.
  /// Throws [LocationException] with a message meant for the rep to read.
  static Future<LatLngPoint> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationException(
        'Location is switched off. Turn on GPS and try again.',
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw const LocationException(
        'Location permission is needed to record your work. Please allow it and try again.',
      );
    }
    if (permission == LocationPermission.deniedForever) {
      throw const LocationException(
        'Location permission is permanently denied. Enable it for KrishiDukaan Sales in your phone settings.',
      );
    }

    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      return LatLngPoint(pos.latitude, pos.longitude);
    } catch (_) {
      // A timeout usually means indoors / weak signal. Last known position is
      // acceptable here ONLY as a same-session approximation, so it is still
      // rejected if the device has never had a fix.
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) return LatLngPoint(last.latitude, last.longitude);
      throw const LocationException(
        'Could not get your location. Move to an open area and try again.',
      );
    }
  }
}
