import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme.dart';
import '../../data/firestore_repository.dart';
import '../../shared/mock_data.dart';
import '../../shared/models.dart';

class StoresScreen extends ConsumerStatefulWidget {
  const StoresScreen({super.key});

  @override
  ConsumerState<StoresScreen> createState() => _StoresScreenState();
}

class _StoresScreenState extends ConsumerState<StoresScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  String? _selectedStoreId;
  GoogleMapController? _mapController;

  @override
  void dispose() {
    _searchCtrl.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  List<Store> _applySearch(List<Store> stores) {
    if (_query.isEmpty) return stores;
    final q = _query.toLowerCase();
    return stores
        .where((s) =>
            s.name.toLowerCase().contains(q) ||
            s.address.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _getDirections(Store s) async {
    if (s.lat == 0 && s.lng == 0) return;
    final url =
        'https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}';
    if (await canLaunchUrl(Uri.parse(url))) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _callStore(Store s) async {
    if (s.phone.isEmpty) return;
    final uri = Uri.parse('tel:${s.phone}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  void _showDetail(BuildContext context, Store s) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _StoreDetailSheet(
        store: s,
        onDirections: () => _getDirections(s),
        onCall: () => _callStore(s),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(storesStreamProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nearby Stores'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: 'Search stores or area…',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _query.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _query = '');
                        },
                      )
                    : null,
              ),
            ),
          ),
        ),
      ),
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text('Could not load stores: $e',
                style: const TextStyle(color: AppColors.muted)),
          ),
          data: (live) {
            final all = live.isEmpty ? mockStores : live;
            final displayed = _applySearch(all);

            // Build markers for stores that have valid coordinates.
            final markers = <Marker>{};
            for (final s in all) {
              if (s.lat == 0 && s.lng == 0) continue;
              markers.add(Marker(
                markerId: MarkerId(s.id),
                position: LatLng(s.lat, s.lng),
                infoWindow: InfoWindow(title: s.name, snippet: s.address),
                icon: _selectedStoreId == s.id
                    ? BitmapDescriptor.defaultMarkerWithHue(
                        BitmapDescriptor.hueGreen)
                    : BitmapDescriptor.defaultMarker,
                onTap: () => setState(() => _selectedStoreId = s.id),
              ));
            }

            // Default camera: centre of India if no stores, else first store.
            final firstWithCoords = all.firstWhere(
              (s) => s.lat != 0 || s.lng != 0,
              orElse: () => all.first,
            );
            final initialTarget = (firstWithCoords.lat != 0 || firstWithCoords.lng != 0)
                ? LatLng(firstWithCoords.lat, firstWithCoords.lng)
                : const LatLng(20.5937, 78.9629);

            return Column(
              children: [
                // Google Map
                ClipRRect(
                  borderRadius: const BorderRadius.all(Radius.circular(20)),
                  child: Container(
                    height: 200,
                    margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Stack(
                      children: [
                        GoogleMap(
                          initialCameraPosition: CameraPosition(
                            target: initialTarget,
                            zoom: 11,
                          ),
                          markers: markers,
                          onMapCreated: (c) => _mapController = c,
                          myLocationButtonEnabled: false,
                          zoomControlsEnabled: false,
                          mapToolbarEnabled: false,
                        ),
                        Positioned(
                          top: 10,
                          right: 10,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '${displayed.length} store${displayed.length != 1 ? 's' : ''} found',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                // Store list
                Expanded(
                  child: displayed.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.search_off,
                                  size: 48, color: AppColors.muted),
                              const SizedBox(height: 8),
                              Text('No stores match "$_query"',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.muted)),
                              const Text('Try a different search',
                                  style: TextStyle(
                                      color: AppColors.muted, fontSize: 12)),
                            ],
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: displayed.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (_, i) {
                            final s = displayed[i];
                            final isSelected = s.id == _selectedStoreId;
                            return _StoreTile(
                              store: s,
                              isSelected: isSelected,
                              onTap: () {
                                setState(() => _selectedStoreId = s.id);
                                if (s.lat != 0 || s.lng != 0) {
                                  _mapController?.animateCamera(
                                    CameraUpdate.newLatLngZoom(
                                        LatLng(s.lat, s.lng), 14),
                                  );
                                }
                              },
                              onDirections: () => _getDirections(s),
                              onCall: () => _callStore(s),
                              onDetails: () => _showDetail(context, s),
                            );
                          },
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ─── Store Tile ───────────────────────────────────────────────────────────────

class _StoreTile extends StatelessWidget {
  const _StoreTile({
    required this.store,
    required this.isSelected,
    required this.onTap,
    required this.onDirections,
    required this.onCall,
    required this.onDetails,
  });
  final Store store;
  final bool isSelected;
  final VoidCallback onTap, onDirections, onCall, onDetails;

  @override
  Widget build(BuildContext context) {
    final isOpen = store.status.toLowerCase().contains('open');
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.06)
              : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.border,
            width: isSelected ? 2 : 1,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  )
                ]
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.storefront, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(store.name,
                                style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                    color: isSelected
                                        ? AppColors.primary
                                        : AppColors.text)),
                          ),
                          if (isSelected)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: const Text('SELECTED',
                                  style: TextStyle(
                                      fontSize: 9,
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.5)),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: isOpen ? Colors.green : Colors.red,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(store.status,
                              style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(store.address,
                          style: const TextStyle(
                              color: AppColors.muted, fontSize: 12)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.directions_walk,
                              size: 13, color: AppColors.muted),
                          const SizedBox(width: 3),
                          Text('${store.distanceKm} km away',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted)),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            // Stock tags
            if (store.stock.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: store.stock
                    .map((item) => Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceAlt,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Text(item,
                              style: const TextStyle(
                                  fontSize: 10, fontWeight: FontWeight.w600)),
                        ))
                    .toList(),
              ),
            ],
            // Action buttons
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: onDirections,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(38),
                      textStyle: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                    icon: const Icon(Icons.directions_outlined, size: 16),
                    label: const Text('Directions'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onDetails,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(38),
                      textStyle: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                    icon: const Icon(Icons.info_outline, size: 16),
                    label: const Text('Details'),
                  ),
                ),
                if (store.phone.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: onCall,
                    icon: const Icon(Icons.call_outlined),
                    color: AppColors.primary,
                    style: IconButton.styleFrom(
                      backgroundColor:
                          AppColors.primary.withValues(alpha: 0.08),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: AppColors.border),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Store Detail Bottom Sheet ────────────────────────────────────────────────

class _StoreDetailSheet extends StatelessWidget {
  const _StoreDetailSheet({
    required this.store,
    required this.onDirections,
    required this.onCall,
  });
  final Store store;
  final VoidCallback onDirections, onCall;

  @override
  Widget build(BuildContext context) {
    final isOpen = store.status.toLowerCase().contains('open');
    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(store.name,
                          style: const TextStyle(
                              fontSize: 22, fontWeight: FontWeight.w800)),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                      style: IconButton.styleFrom(
                          backgroundColor: AppColors.surfaceAlt),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // Status
                _DetailRow(
                  icon: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: isOpen ? Colors.green : Colors.red,
                      shape: BoxShape.circle,
                    ),
                  ),
                  label: 'Status',
                  value: store.status,
                ),
                const SizedBox(height: 12),
                // Address
                _DetailRow(
                  icon: const Icon(Icons.location_on_outlined,
                      size: 18, color: AppColors.primary),
                  label: 'Address',
                  value: store.address,
                ),
                if (store.phone.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _DetailRow(
                    icon: const Icon(Icons.phone_outlined,
                        size: 18, color: Colors.green),
                    label: 'Phone',
                    value: store.phone,
                    valueColor: Colors.green.shade700,
                  ),
                ],
                const SizedBox(height: 12),
                _DetailRow(
                  icon: const Icon(Icons.near_me_outlined,
                      size: 18, color: AppColors.muted),
                  label: 'Distance',
                  value: '${store.distanceKm} km away',
                ),
                // Stock
                if (store.stock.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const Text('Products in Stock',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: AppColors.muted,
                          letterSpacing: 0.3)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: store.stock
                        .map((item) => Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 5),
                              decoration: BoxDecoration(
                                color:
                                    AppColors.primary.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                    color: AppColors.primary
                                        .withValues(alpha: 0.20)),
                              ),
                              child: Text(item,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.w700)),
                            ))
                        .toList(),
                  ),
                ],
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: onDirections,
                        icon: const Icon(Icons.directions_outlined, size: 16),
                        label: const Text('Get Directions'),
                      ),
                    ),
                    if (store.phone.isNotEmpty) ...[
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onCall,
                          icon: const Icon(Icons.call_outlined, size: 16),
                          label: const Text('Call Store'),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });
  final Widget icon;
  final String label, value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Center(child: icon),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 9,
                      color: AppColors.muted,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5)),
              const SizedBox(height: 2),
              Text(value,
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: valueColor ?? AppColors.text)),
            ],
          ),
        ),
      ],
    );
  }
}
