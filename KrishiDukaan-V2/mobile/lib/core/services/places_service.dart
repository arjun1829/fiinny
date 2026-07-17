import 'dart:convert';
import 'package:http/http.dart' as http;

class PlaceSuggestion {
  final String placeId;
  final String description;
  const PlaceSuggestion({required this.placeId, required this.description});
}

class PlaceDetails {
  final String name;
  final String? sublocality;
  final String? city;
  final String? state;
  final String? pincode;
  final String? formattedAddress;
  final double? lat;
  final double? lng;
  const PlaceDetails({
    required this.name,
    this.sublocality,
    this.city,
    this.state,
    this.pincode,
    this.formattedAddress,
    this.lat,
    this.lng,
  });
}

class PlacesService {
  static const _base = 'https://maps.googleapis.com/maps/api';

  static Future<List<PlaceSuggestion>> autocomplete(
      String input, String apiKey) async {
    if (input.trim().isEmpty) return [];
    try {
      final uri = Uri.parse('$_base/place/autocomplete/json'
          '?input=${Uri.encodeComponent(input)}'
          '&components=country:in'
          '&types=establishment'
          '&key=$apiKey');
      final res = await http.get(uri).timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final predictions = data['predictions'] as List? ?? [];
      return predictions
          .map((p) => PlaceSuggestion(
                placeId: p['place_id'] as String,
                description: p['description'] as String,
              ))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<PlaceDetails?> getDetails(
      String placeId, String apiKey) async {
    try {
      final uri = Uri.parse('$_base/place/details/json'
          '?place_id=$placeId'
          '&fields=name,formatted_address,address_components,geometry'
          '&key=$apiKey');
      final res = await http.get(uri).timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final result = data['result'] as Map<String, dynamic>?;
      if (result == null) return null;
      return _parseResult(result);
    } catch (_) {
      return null;
    }
  }

  static Future<PlaceDetails?> reverseGeocode(
      double lat, double lng, String apiKey) async {
    try {
      final uri = Uri.parse(
          '$_base/geocode/json?latlng=$lat,$lng&key=$apiKey');
      final res = await http.get(uri).timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final results = data['results'] as List?;
      if (results == null || results.isEmpty) return null;
      return _parseResult(results.first as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static PlaceDetails _parseResult(Map<String, dynamic> result) {
    String? neighborhood, sublocality, locality, admin3, admin2, state, pincode;
    final components = result['address_components'] as List? ?? [];
    
    for (final c in components) {
      final types = (c['types'] as List).cast<String>();
      final name = c['long_name'] as String?;
      
      if (types.contains('neighborhood')) neighborhood ??= name;
      if (types.contains('sublocality_level_3')) sublocality ??= name;
      if (types.contains('sublocality_level_2')) sublocality ??= name;
      if (types.contains('sublocality_level_1')) sublocality ??= name;
      if (types.contains('sublocality')) sublocality ??= name;
      if (types.contains('locality')) locality ??= name;
      if (types.contains('administrative_area_level_3')) admin3 ??= name;
      if (types.contains('administrative_area_level_2')) admin2 ??= name;
      if (types.contains('administrative_area_level_1')) state ??= name;
      if (types.contains('postal_code')) pincode ??= name;
    }

    String? bestSub = neighborhood ?? sublocality ?? admin3 ?? locality;
    String? bestCity;
    
    if (locality != null && locality != bestSub) {
      bestCity = locality;
    } else if (admin2 != null && admin2 != bestSub) {
      bestCity = admin2;
    } else {
      bestCity = state;
    }

    final geo = result['geometry'] as Map<String, dynamic>?;
    final loc = geo?['location'] as Map<String, dynamic>?;
    final name = (result['name'] as String?)?.isNotEmpty == true
        ? result['name'] as String
        : result['formatted_address'] as String? ?? '';
        
    return PlaceDetails(
      name: name,
      sublocality: bestSub,
      city: bestCity,
      state: state,
      pincode: pincode,
      formattedAddress: result['formatted_address'] as String?,
      lat: (loc?['lat'] as num?)?.toDouble(),
      lng: (loc?['lng'] as num?)?.toDouble(),
    );
  }

  /// Parses lat/lng from a standard Google Maps URL.
  /// Handles `@lat,lng` in path and `?q=lat,lng` query param.
  static ({double lat, double lng})? parseMapsUrl(String url) {
    final atMatch =
        RegExp(r'@(-?\d+\.?\d*),(-?\d+\.?\d*)').firstMatch(url);
    if (atMatch != null) {
      final lat = double.tryParse(atMatch.group(1)!);
      final lng = double.tryParse(atMatch.group(2)!);
      if (lat != null && lng != null) return (lat: lat, lng: lng);
    }
    final qMatch =
        RegExp(r'[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)').firstMatch(url);
    if (qMatch != null) {
      final lat = double.tryParse(qMatch.group(1)!);
      final lng = double.tryParse(qMatch.group(2)!);
      if (lat != null && lng != null) return (lat: lat, lng: lng);
    }
    return null;
  }

  /// Follows a redirect (e.g. maps.app.goo.gl shortened links)
  /// to extract the full Maps URL, then parses coordinates.
  static Future<({double lat, double lng})?> resolveShortUrl(
      String url) async {
    try {
      final client = http.Client();
      final req = http.Request('GET', Uri.parse(url))
        ..followRedirects = false;
      final res =
          await client.send(req).timeout(const Duration(seconds: 6));
      client.close();
      final location = res.headers['location'] ?? '';
      if (location.isNotEmpty) return parseMapsUrl(location);
    } catch (_) {}
    return null;
  }
}
