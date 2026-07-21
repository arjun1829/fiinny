/// Builds the `/stores` route path with query params that focus the Store
/// tab's map on a specific location — used by every "Directions" action
/// (product detail, brand page, dealers, search suggestions) so they all
/// hand off to the same in-app map instead of launching an external maps app.
String storeFocusRoute({
  required String name,
  String? phone,
  String? address,
  double? lat,
  double? lng,
  String? id,
}) {
  final params = <String, String>{
    'focusName': name,
    if (id != null && id.isNotEmpty) 'focusId': id,
    if (phone != null && phone.isNotEmpty) 'focusPhone': phone,
    if (address != null && address.isNotEmpty) 'focusAddress': address,
    if (lat != null) 'focusLat': lat.toString(),
    if (lng != null) 'focusLng': lng.toString(),
  };
  final query = Uri(queryParameters: params).query;
  return '/stores?$query';
}
