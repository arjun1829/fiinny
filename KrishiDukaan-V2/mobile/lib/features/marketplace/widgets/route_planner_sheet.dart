import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/store_model.dart';
import '../../../core/utils/geo_utils.dart';

/// Google-Maps-style From → To planner for the Store Locator.
///
/// The user picks a source (their live location or any store) and a
/// destination, sees the distance + rough drive time, then hands off to
/// Google Maps for turn-by-turn. When the destination store has its own
/// Google Business listing URL on the profile, that listing is surfaced
/// (photos/reviews/timings) and preferred over bare coordinates for the
/// "view on map" action.
Future<void> showRoutePlannerSheet(
  BuildContext context, {
  required List<StoreModel> stores,
  required StoreModel destination,
  required double userLat,
  required double userLng,
  required bool hasUserLocation,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _RoutePlannerSheet(
      stores: stores,
      initialDestination: destination,
      userLat: userLat,
      userLng: userLng,
      hasUserLocation: hasUserLocation,
    ),
  );
}

/// One end of the route: the user's live location, or a store.
class _Endpoint {
  final StoreModel? store; // null = "Your location"
  const _Endpoint.user() : store = null;
  const _Endpoint.store(StoreModel this.store);

  bool get isUser => store == null;
  String get title => isUser ? 'Your location' : store!.name;
  String? get subtitle => isUser ? null : store!.fullAddress;
}

class _RoutePlannerSheet extends StatefulWidget {
  final List<StoreModel> stores;
  final StoreModel initialDestination;
  final double userLat;
  final double userLng;
  final bool hasUserLocation;

  const _RoutePlannerSheet({
    required this.stores,
    required this.initialDestination,
    required this.userLat,
    required this.userLng,
    required this.hasUserLocation,
  });

  @override
  State<_RoutePlannerSheet> createState() => _RoutePlannerSheetState();
}

class _RoutePlannerSheetState extends State<_RoutePlannerSheet> {
  late _Endpoint _from;
  late _Endpoint _to;

  @override
  void initState() {
    super.initState();
    _from = const _Endpoint.user();
    _to = _Endpoint.store(widget.initialDestination);
  }

  (double, double)? _coordsOf(_Endpoint e) {
    if (e.isUser) {
      return widget.hasUserLocation ? (widget.userLat, widget.userLng) : null;
    }
    final s = e.store!;
    return s.hasLocation ? (s.lat!, s.lng!) : null;
  }

  double? get _distanceKm {
    final a = _coordsOf(_from);
    final b = _coordsOf(_to);
    if (a == null || b == null) return null;
    return GeoUtils.distanceKm(a.$1, a.$2, b.$1, b.$2);
  }

  /// Rough drive time at ~32 km/h (mixed rural/town roads). Clearly labelled
  /// as approximate — real routing happens in Google Maps.
  String? get _driveTime {
    final km = _distanceKm;
    if (km == null) return null;
    final mins = (km / 32 * 60).round().clamp(1, 100000);
    if (mins < 60) return '~$mins min drive';
    return '~${mins ~/ 60} hr ${mins % 60} min drive';
  }

  bool get _sameEndpoints =>
      (_from.isUser && _to.isUser) ||
      (!_from.isUser && !_to.isUser && _from.store!.id == _to.store!.id);

  Future<void> _startNavigation() async {
    final dest = _coordsOf(_to);
    if (dest == null) return;
    final params = <String>[
      'api=1',
      // Omit origin when starting from the user's live position — Google Maps
      // then uses its own GPS fix, which beats our one-shot reading.
      if (!_from.isUser && _coordsOf(_from) != null)
        'origin=${_coordsOf(_from)!.$1},${_coordsOf(_from)!.$2}',
      'destination=${dest.$1},${dest.$2}',
    ];
    final url =
        Uri.parse('https://www.google.com/maps/dir/?${params.join('&')}');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _openGoogleListing(String link) async {
    final url = Uri.parse(link);
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _pickEndpoint({required bool isFrom}) async {
    final picked = await showModalBottomSheet<_Endpoint>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EndpointPicker(
        stores: widget.stores,
        allowUserLocation: widget.hasUserLocation,
      ),
    );
    if (picked != null && mounted) {
      setState(() => isFrom ? _from = picked : _to = picked);
    }
  }

  void _swap() => setState(() {
        final t = _from;
        _from = _to;
        _to = t;
      });

  @override
  Widget build(BuildContext context) {
    final distanceKm = _distanceKm;
    final toStore = _to.store;
    final googleListing =
        (toStore != null && toStore.hasGoogleListing) ? toStore.googleMapsUrl : null;
    final canNavigate = !_sameEndpoints && _coordsOf(_to) != null;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            children: [
              const Icon(Icons.directions_rounded,
                  color: AppColors.primary, size: 22),
              const SizedBox(width: 8),
              Text('Directions', style: AppTextStyles.heading3),
            ],
          ),
          const SizedBox(height: 14),

          // ── From / To with connector + swap (Google Maps style) ─────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.divider),
            ),
            child: Row(
              children: [
                // Dots-and-line connector
                Column(
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: AppColors.info,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                    ),
                    Container(
                      width: 2,
                      height: 34,
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.divider,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                    const Icon(Icons.location_on,
                        color: Colors.red, size: 18),
                  ],
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    children: [
                      _EndpointRow(
                        endpoint: _from,
                        hint: 'Choose starting point',
                        onTap: () => _pickEndpoint(isFrom: true),
                      ),
                      const Divider(height: 10),
                      _EndpointRow(
                        endpoint: _to,
                        hint: 'Choose destination',
                        onTap: () => _pickEndpoint(isFrom: false),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: _swap,
                  tooltip: 'Swap',
                  icon: const Icon(Icons.swap_vert_rounded,
                      color: AppColors.onSurfaceVariant),
                ),
              ],
            ),
          ),

          // ── Route summary ────────────────────────────────────────────────
          const SizedBox(height: 14),
          if (_sameEndpoints)
            Text(
              'Pick two different places to see the route.',
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant),
            )
          else if (distanceKm != null)
            Row(
              children: [
                _SummaryChip(
                  icon: Icons.route_outlined,
                  label: GeoUtils.formatDistance(distanceKm),
                ),
                const SizedBox(width: 8),
                if (_driveTime != null)
                  _SummaryChip(
                      icon: Icons.schedule_rounded, label: _driveTime!),
              ],
            )
          else
            Text(
              _from.isUser && !widget.hasUserLocation
                  ? 'Turn on location to measure from your position — '
                    'navigation still works.'
                  : 'Exact location not available for one of the places.',
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant),
            ),
          if (distanceKm != null && !_sameEndpoints)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Straight-line estimate — exact route in Google Maps.',
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.onSurfaceVariant),
              ),
            ),

          // ── Destination's own Google Business listing ────────────────────
          if (googleListing != null) ...[
            const SizedBox(height: 12),
            InkWell(
              onTap: () => _openGoogleListing(googleListing),
              borderRadius: BorderRadius.circular(14),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.storefront_rounded,
                          color: AppColors.primary, size: 20),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${toStore!.name} on Google',
                              style: AppTextStyles.bodyMedium
                                  .copyWith(fontWeight: FontWeight.w700),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                          Text('Photos, reviews & live timings',
                              style: AppTextStyles.caption.copyWith(
                                  color: AppColors.onSurfaceVariant)),
                        ],
                      ),
                    ),
                    const Icon(Icons.open_in_new_rounded,
                        size: 18, color: AppColors.primary),
                  ],
                ),
              ),
            ),
          ],

          // ── Start ────────────────────────────────────────────────────────
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton.icon(
              onPressed: canNavigate ? _startNavigation : null,
              icon: const Icon(Icons.navigation_rounded, size: 20),
              label: const Text('Start in Google Maps',
                  style: AppTextStyles.button),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EndpointRow extends StatelessWidget {
  final _Endpoint endpoint;
  final String hint;
  final VoidCallback onTap;

  const _EndpointRow({
    required this.endpoint,
    required this.hint,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    endpoint.title,
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (endpoint.subtitle != null &&
                      endpoint.subtitle!.isNotEmpty)
                    Text(
                      endpoint.subtitle!,
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.onSurfaceVariant),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            const Icon(Icons.keyboard_arrow_down_rounded,
                size: 18, color: AppColors.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _SummaryChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.primary),
          const SizedBox(width: 5),
          Text(label,
              style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.primary, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

// ── Endpoint picker: "Your location" + searchable store list ────────────────

class _EndpointPicker extends StatefulWidget {
  final List<StoreModel> stores;
  final bool allowUserLocation;

  const _EndpointPicker({
    required this.stores,
    required this.allowUserLocation,
  });

  @override
  State<_EndpointPicker> createState() => _EndpointPickerState();
}

class _EndpointPickerState extends State<_EndpointPicker> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = _query.toLowerCase();
    final stores = widget.stores.where((s) {
      if (!s.hasLocation) return false; // routing needs coordinates
      if (q.isEmpty) return true;
      return s.name.toLowerCase().contains(q) ||
          (s.city?.toLowerCase().contains(q) ?? false) ||
          (s.address?.toLowerCase().contains(q) ?? false);
    }).toList();

    return Container(
      height: MediaQuery.of(context).size.height * 0.72,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          TextField(
            controller: _searchCtrl,
            autofocus: true,
            onChanged: (v) => setState(() => _query = v),
            decoration: InputDecoration(
              hintText: 'Search stores…',
              prefixIcon: const Icon(Icons.search, size: 20),
              isDense: true,
              filled: true,
              fillColor: AppColors.surfaceVariant,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView(
              children: [
                if (widget.allowUserLocation)
                  ListTile(
                    leading: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: AppColors.info.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.my_location,
                          color: AppColors.info, size: 20),
                    ),
                    title: const Text('Your location',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    onTap: () =>
                        Navigator.pop(context, const _Endpoint.user()),
                  ),
                if (widget.allowUserLocation) const Divider(height: 1),
                ...stores.map(
                  (s) => ListTile(
                    leading: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer
                            .withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.store_outlined,
                          color: AppColors.primary, size: 20),
                    ),
                    title: Text(s.name,
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text(
                      [
                        if (s.distanceKm != null)
                          GeoUtils.formatDistance(s.distanceKm!),
                        if (s.city != null && s.city!.isNotEmpty) s.city!,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onTap: () => Navigator.pop(context, _Endpoint.store(s)),
                  ),
                ),
                if (stores.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: Text('No stores found')),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
