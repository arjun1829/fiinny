import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:geolocator/geolocator.dart';

import '../constants/app_config.dart';
import '../constants/indian_states.dart';
import '../utils/delivery_utils.dart';
import 'places_service.dart';

/// The structured address a place or a GPS fix resolves to.
///
/// Mirrors what the website's checkout fills from a Google result
/// (`applyPlaceToFields` in app/views/CartView.tsx): area, city, district,
/// state and pincode. [state] is always an entry of [kIndianStates] (or '' when
/// the place had none) — the state decides a pan-India seller's in-state vs
/// out-of-state delivery charge, so it must be a recognised name, not free text.
class AddressFields {
  final String area;
  final String city;
  final String district;
  final String state;
  final String pincode;

  /// Full one-line address as Google formats it, without the trailing country.
  final String formatted;
  final double? lat;
  final double? lng;

  const AddressFields({
    this.area = '',
    this.city = '',
    this.district = '',
    this.state = '',
    this.pincode = '',
    this.formatted = '',
    this.lat,
    this.lng,
  });

  GeoPoint? get geo => (lat != null && lng != null) ? GeoPoint(lat!, lng!) : null;
}

/// The entry of [kIndianStates] that names the same state as [raw], or null.
/// Uses the same canonical comparison as the server (canonicalState), so
/// "Jammu and Kashmir", "NCT of Delhi" and "Orissa" all find their entry.
String? matchIndianState(String? raw) {
  final want = canonicalState(raw);
  if (want.isEmpty) return null;
  for (final s in kIndianStates) {
    if (canonicalState(s) == want) return s;
  }
  return null;
}

/// Maps a Google place onto address fields, with the website's rules: the area
/// is the most precise street-level part available (street number + route,
/// else premise, else the formatted address before the city, else the
/// neighbourhood), so the delivery address is exact, not just the locality.
AddressFields addressFromPlace(PlaceDetails p) {
  final city = (p.city ?? '').trim();
  var area = [p.streetNumber, p.route]
      .where((s) => s != null && s.trim().isNotEmpty)
      .join(' ')
      .trim();
  if (area.isEmpty && (p.premise ?? '').trim().isNotEmpty) {
    area = p.premise!.trim();
  }
  final formatted = (p.formattedAddress ?? '')
      .replaceFirst(RegExp(r',\s*India$'), '')
      .trim();
  if (area.isEmpty && formatted.isNotEmpty) {
    final cut = city.isNotEmpty ? formatted.indexOf(city) : -1;
    area = (cut > 0 ? formatted.substring(0, cut) : formatted.split(',').first)
        .replaceFirst(RegExp(r',\s*$'), '')
        .trim();
  }
  if (area.isEmpty) area = (p.sublocality ?? '').trim();

  final state = matchIndianState(p.state) ?? '';
  final pin = (p.pincode ?? '').replaceAll(RegExp(r'\D'), '');
  return AddressFields(
    area: area,
    city: city.isNotEmpty ? city : (p.sublocality ?? '').trim(),
    district: (p.district ?? '').trim(),
    state: state,
    pincode: pin.length == 6 ? pin : '',
    formatted: formatted,
    lat: p.lat,
    lng: p.lng,
  );
}

/// What to offer when a location request can't proceed.
enum LocationFix { none, locationSettings, appSettings }

class AddressLocatorException implements Exception {
  final String message;
  final LocationFix fix;
  const AddressLocatorException(this.message, {this.fix = LocationFix.none});
  @override
  String toString() => message;
}

class AddressLocator {
  AddressLocator._();

  /// Opens the settings screen for a [LocationFix].
  static Future<void> openFix(LocationFix fix) async {
    switch (fix) {
      case LocationFix.locationSettings:
        await Geolocator.openLocationSettings();
      case LocationFix.appSettings:
        await Geolocator.openAppSettings();
      case LocationFix.none:
        break;
    }
  }

  /// GPS fix → reverse geocode → address fields. Throws
  /// [AddressLocatorException] with a message fit to show the user (location
  /// off, permission denied / blocked, no fix in time).
  static Future<AddressFields> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const AddressLocatorException(
          'Location is turned off on your phone.',
          fix: LocationFix.locationSettings);
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      throw const AddressLocatorException(
          'Location permission is blocked for KrishiDukan.',
          fix: LocationFix.appSettings);
    }
    if (permission == LocationPermission.denied) {
      throw const AddressLocatorException(
          'Allow location access to fill your address automatically.');
    }

    final Position pos;
    try {
      pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
    } catch (_) {
      throw const AddressLocatorException(
          'Could not get your location. Try again outside or near a window.');
    }

    final place = await PlacesService.reverseGeocode(
        pos.latitude, pos.longitude, AppConfig.googleMapsApiKey);
    if (place == null) {
      // A fix without an address: keep the coordinates, let the user type.
      return AddressFields(lat: pos.latitude, lng: pos.longitude);
    }
    final fields = addressFromPlace(place);
    return AddressFields(
      area: fields.area,
      city: fields.city,
      district: fields.district,
      state: fields.state,
      pincode: fields.pincode,
      formatted: fields.formatted,
      lat: pos.latitude,
      lng: pos.longitude,
    );
  }
}
