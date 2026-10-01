import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/directions_service.dart';
import '../../../core/services/location_service.dart' as loc;
import '../../dealers/data/dealer_visit.dart';
import '../data/day_session.dart';

/// The day drawn on a map: start pin, a numbered pin per visit in route order,
/// end pin, and the road route between them.
///
/// Prefers the stored encodedPolyline (the actual roads driven, as returned by
/// the Routes API when the day was closed). Falls back to straight lines
/// between stops when there is none — an older session, or a day where the
/// distance lookup failed — which is visibly cruder but still shows the shape
/// of the day rather than an empty map.
class RouteMap extends StatefulWidget {
  const RouteMap({super.key, required this.session, required this.visits});

  final DaySession session;
  final List<DealerVisit> visits;

  @override
  State<RouteMap> createState() => _RouteMapState();
}

class _RouteMapState extends State<RouteMap> {
  GoogleMapController? _controller;

  List<loc.LatLngPoint> get _stops => [
    widget.session.startGeo,
    for (final v in sortVisits(widget.visits))
      if (v.geo != null) v.geo!,
    if (widget.session.endGeo != null) widget.session.endGeo!,
  ];

  @override
  Widget build(BuildContext context) {
    final ordered = sortVisits(widget.visits);
    final markers = <Marker>{
      Marker(
        markerId: const MarkerId('start'),
        position: LatLng(
          widget.session.startGeo.lat,
          widget.session.startGeo.lng,
        ),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        infoWindow: const InfoWindow(title: 'Day start'),
      ),
      for (var i = 0; i < ordered.length; i++)
        if (ordered[i].geo != null)
          Marker(
            markerId: MarkerId('visit_${ordered[i].id}'),
            position: LatLng(ordered[i].geo!.lat, ordered[i].geo!.lng),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueAzure,
            ),
            infoWindow: InfoWindow(
              title: '${i + 1}. ${ordered[i].dealerName}',
              snippet: ordered[i].purposeLabel,
            ),
          ),
      if (widget.session.endGeo != null)
        Marker(
          markerId: const MarkerId('end'),
          position: LatLng(
            widget.session.endGeo!.lat,
            widget.session.endGeo!.lng,
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
          infoWindow: const InfoWindow(title: 'Day end'),
        ),
    };

    final encoded = widget.session.encodedPolyline;
    final linePoints = encoded != null && encoded.isNotEmpty
        ? DirectionsService.decodePolyline(encoded)
        : _stops;

    final polylines = <Polyline>{
      if (linePoints.length >= 2)
        Polyline(
          polylineId: const PolylineId('route'),
          points: [for (final p in linePoints) LatLng(p.lat, p.lng)],
          color: AppColors.primary,
          width: 4,
          // A dashed-looking thin line would misrepresent the straight-line
          // fallback as a real route, so only the width differs.
          patterns: encoded == null || encoded.isEmpty
              ? [PatternItem.dash(18), PatternItem.gap(10)]
              : const [],
        ),
    };

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: 300,
        child: GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(
              widget.session.startGeo.lat,
              widget.session.startGeo.lng,
            ),
            zoom: 13,
          ),
          markers: markers,
          polylines: polylines,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
          onMapCreated: (c) {
            _controller = c;
            _fit(linePoints);
          },
        ),
      ),
    );
  }

  /// Frames every point of the day, so the rep never lands on a map zoomed into
  /// one pin with the rest of the route off-screen.
  Future<void> _fit(List<loc.LatLngPoint> points) async {
    if (_controller == null || points.length < 2) return;
    var minLat = points.first.lat, maxLat = points.first.lat;
    var minLng = points.first.lng, maxLng = points.first.lng;
    for (final p in points) {
      minLat = p.lat < minLat ? p.lat : minLat;
      maxLat = p.lat > maxLat ? p.lat : maxLat;
      minLng = p.lng < minLng ? p.lng : minLng;
      maxLng = p.lng > maxLng ? p.lng : maxLng;
    }
    // A zero-area bounds (every stop at the same spot) makes the SDK throw.
    if ((maxLat - minLat).abs() < 1e-6 && (maxLng - minLng).abs() < 1e-6) {
      return;
    }

    await Future<void>.delayed(const Duration(milliseconds: 250));
    await _controller?.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        56,
      ),
    );
  }
}
