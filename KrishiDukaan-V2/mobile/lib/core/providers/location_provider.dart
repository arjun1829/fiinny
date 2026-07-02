import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../constants/app_config.dart';
import '../services/places_service.dart';

class LatLng {
  final double lat;
  final double lng;
  const LatLng(this.lat, this.lng);
}

/// Provides user's current location. Throws 'permission_denied' when the user
/// has not granted location access; falls back to Pune for other errors.
final locationProvider = FutureProvider<LatLng>((ref) async {
  final permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    throw Exception('permission_denied');
  }

  try {
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.medium,
        timeLimit: Duration(seconds: 10),
      ),
    );
    return LatLng(pos.latitude, pos.longitude);
  } catch (_) {
    return const LatLng(AppConfig.defaultLat, AppConfig.defaultLng);
  }
});

/// Resolves user's LatLng coordinates to a user-friendly address string (e.g. "Pune, Maharashtra").
final locationNameProvider = FutureProvider<String>((ref) async {
  final latLng = await ref.watch(locationProvider.future);
  try {
    final details = await PlacesService.reverseGeocode(
      latLng.lat,
      latLng.lng,
      AppConfig.googleMapsApiKey,
    );
    if (details != null) {
      if (details.sublocality != null && details.sublocality!.isNotEmpty) {
        if (details.city != null && details.city!.isNotEmpty) {
          return '${details.sublocality}, ${details.city}';
        }
        return details.sublocality!;
      }
      if (details.city != null && details.city!.isNotEmpty) {
        if (details.state != null && details.state!.isNotEmpty) {
          return '${details.city}, ${details.state}';
        }
        return details.city!;
      }
      if (details.formattedAddress != null && details.formattedAddress!.isNotEmpty) {
        return details.formattedAddress!;
      }
    }
  } catch (_) {}
  return 'Pune, Maharashtra';
});
