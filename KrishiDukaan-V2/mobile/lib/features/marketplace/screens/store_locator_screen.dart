import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart' as ll;
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/location_provider.dart' as loc;
import '../../../core/models/store_model.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/utils/geo_utils.dart';
import '../providers/marketplace_provider.dart';
import '../widgets/review_sheet.dart';
import '../widgets/store_detail_sheet.dart';

void _showFullStoreImage(BuildContext context, String imageUrl) {
  showDialog(
    context: context,
    builder: (context) => Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(8),
      child: Stack(
        alignment: Alignment.center,
        children: [
          InteractiveViewer(
            minScale: 0.5,
            maxScale: 4.0,
            child: CachedNetworkImage(
              imageUrl: imageUrl,
              fit: BoxFit.contain,
              placeholder: (context, url) => const Center(child: CircularProgressIndicator()),
              errorWidget: (context, url, error) => const Icon(Icons.error, color: Colors.white),
            ),
          ),
          Positioned(
            top: 10,
            right: 10,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 30),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
        ],
      ),
    ),
  );
}

class StoreLocatorScreen extends ConsumerStatefulWidget {
  const StoreLocatorScreen({super.key});

  @override
  ConsumerState<StoreLocatorScreen> createState() => _StoreLocatorScreenState();
}

class _StoreLocatorScreenState extends ConsumerState<StoreLocatorScreen> {
  final _mapController = MapController();
  final _searchCtrl = TextEditingController();
  final _listScrollCtrl = ScrollController();
  final _cardKeys = <String, GlobalKey>{};

  String? _selectedStoreId;
  String _searchQuery = '';

  // Whether the map is expanded (full screen overlay)
  bool _mapExpanded = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    _listScrollCtrl.dispose();
    super.dispose();
  }

  List<StoreModel> _filteredStores(List<StoreModel> stores) {
    if (_searchQuery.isEmpty) return stores;
    final q = _searchQuery.toLowerCase();
    return stores.where((s) {
      return s.name.toLowerCase().contains(q) ||
          (s.address?.toLowerCase().contains(q) ?? false) ||
          (s.city?.toLowerCase().contains(q) ?? false) ||
          (s.ownerName?.toLowerCase().contains(q) ?? false);
    }).toList();
  }

  void _selectStore(StoreModel store, {bool panMap = true}) {
    setState(() => _selectedStoreId = store.id);

    if (panMap && store.hasLocation) {
      _mapController.move(ll.LatLng(store.lat!, store.lng!), 15);
    }

    // Scroll the list to the selected card
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final key = _cardKeys[store.id];
      if (key?.currentContext != null) {
        Scrollable.ensureVisible(
          key!.currentContext!,
          duration: const Duration(milliseconds: 300),
          alignment: 0.1,
        );
      }
    });
  }

  void _openMapExpanded(StoreModel store) {
    _selectStore(store, panMap: false);
    setState(() => _mapExpanded = true);
    // Pan after overlay is mounted
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (store.hasLocation) {
        _mapController.move(ll.LatLng(store.lat!, store.lng!), 15);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final storesAsync = ref.watch(storesByDistanceProvider);
    final locationAsync = ref.watch(loc.locationProvider);

    // Always use a usable center — don't block on location
    final userLat = locationAsync.value?.lat ?? AppConfig.defaultLat;
    final userLng = locationAsync.value?.lng ?? AppConfig.defaultLng;
    final locationLoading = locationAsync.isLoading;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        titleSpacing: 16,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        flexibleSpace: Container(
          decoration: BoxDecoration(gradient: topBarGradient()),
        ),
        title: Row(
          children: [
            const AppBrandIcon(size: 30),
            const SizedBox(width: 10),
            Text(
              'Store Locator',
              style: AppTextStyles.heading2.copyWith(
                color: Colors.white,
                fontSize: 18,
              ),
            ),
          ],
        ),
      ),
      body: storesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.store_outlined,
                size: 48,
                color: AppColors.onSurfaceVariant,
              ),
              const SizedBox(height: 12),
              Text('Could not load stores', style: AppTextStyles.bodyMedium),
            ],
          ),
        ),
        data: (allStores) {
          final stores = _filteredStores(allStores);
          final selected = stores.firstWhere(
            (s) => s.id == _selectedStoreId,
            orElse: () =>
                stores.isNotEmpty ? stores.first : StoreModel(id: '', name: ''),
          );
          final hasSelected =
              _selectedStoreId != null &&
              stores.any((s) => s.id == _selectedStoreId);

          return Stack(
            children: [
              Column(
                children: [
                  // ── Map strip ────────────────────────────────────────
                  SizedBox(
                    height: 240,
                    child: _buildMap(
                      stores: allStores,
                      userLat: userLat,
                      userLng: userLng,
                      locationLoading: locationLoading,
                    ),
                  ),

                  // ── Search bar ───────────────────────────────────────
                  Container(
                    color: Colors.white,
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TextField(
                          controller: _searchCtrl,
                          onChanged: (v) => setState(() => _searchQuery = v),
                          decoration: InputDecoration(
                            hintText: 'Search stores by name or area...',
                            prefixIcon: const Icon(
                              Icons.search,
                              size: 20,
                              color: AppColors.onSurfaceVariant,
                            ),
                            suffixIcon: _searchQuery.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.clear, size: 18),
                                    onPressed: () {
                                      _searchCtrl.clear();
                                      setState(() => _searchQuery = '');
                                    },
                                  )
                                : null,
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(
                              vertical: 10,
                              horizontal: 12,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(
                                color: AppColors.divider,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(
                                color: AppColors.primary,
                                width: 2,
                              ),
                            ),
                            filled: true,
                            fillColor: AppColors.surfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${stores.length} store${stores.length != 1 ? 's' : ''} found',
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),

                  // ── Store list ───────────────────────────────────────
                  Expanded(
                    child: stores.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.store_outlined,
                                  size: 40,
                                  color: AppColors.onSurfaceVariant,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  _searchQuery.isEmpty
                                      ? 'No stores available'
                                      : 'No stores match "$_searchQuery"',
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    color: AppColors.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          )
                        : ListView.builder(
                            controller: _listScrollCtrl,
                            padding: const EdgeInsets.all(12),
                            itemCount: stores.length,
                            itemBuilder: (_, i) {
                              final store = stores[i];
                              final isSelected =
                                  store.id == _selectedStoreId ||
                                  (!hasSelected && i == 0);
                              _cardKeys[store.id] ??= GlobalKey();
                              return _StoreCard(
                                key: _cardKeys[store.id],
                                store: store,
                                isSelected: isSelected,
                                onTap: () => _selectStore(store),
                                onMapTap: () => _openMapExpanded(store),
                                onCall:
                                    store.phone != null &&
                                        store.phone!.isNotEmpty
                                    ? () => _callStore(store.phone!)
                                    : null,
                                onNavigate: store.hasLocation
                                    ? () => _navigate(store)
                                    : null,
                                onReviewsTap: () {
                                  showStoreReviewsBottomSheet(
                                    context: context,
                                    ref: ref,
                                    store: store,
                                  );
                                },
                                onDetails: () {
                                  showStoreDetailSheet(
                                    context: context,
                                    ref: ref,
                                    store: store,
                                    onCall:
                                        store.phone != null &&
                                            store.phone!.isNotEmpty
                                        ? () => _callStore(store.phone!)
                                        : null,
                                    onNavigate: store.hasLocation
                                        ? () => _navigate(store)
                                        : null,
                                  );
                                },
                              );
                            },
                          ),
                  ),
                ],
              ),

              // ── Expanded map overlay ─────────────────────────────────
              if (_mapExpanded)
                _MapOverlay(
                  mapController: _mapController,
                  stores: allStores,
                  userLat: userLat,
                  userLng: userLng,
                  selectedStoreId: _selectedStoreId,
                  focusedStore: hasSelected ? selected : null,
                  onMarkerTap: (s) => setState(() => _selectedStoreId = s.id),
                  onClose: () => setState(() => _mapExpanded = false),
                  onNavigate: (s) => _navigate(s),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildMap({
    required List<StoreModel> stores,
    required double userLat,
    required double userLng,
    required bool locationLoading,
  }) {
    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: ll.LatLng(userLat, userLng),
        initialZoom: 12,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.karanarjuntechnologies.krishidukan',
        ),
        MarkerLayer(
          markers: [
            // User location marker (only show if not using default)
            if (!locationLoading)
              Marker(
                point: ll.LatLng(userLat, userLng),
                width: 36,
                height: 36,
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.info,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                    boxShadow: const [
                      BoxShadow(
                        color: Colors.black26,
                        blurRadius: 4,
                        offset: Offset(0, 2),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.my_location,
                    color: Colors.white,
                    size: 18,
                  ),
                ),
              ),
            // Store markers
            ...stores.where((s) => s.hasLocation).map((s) {
              final isSelected = s.id == _selectedStoreId;
              return Marker(
                point: ll.LatLng(s.lat!, s.lng!),
                width: isSelected ? 48 : 40,
                height: isSelected ? 48 : 40,
                child: GestureDetector(
                  onTap: () => _selectStore(s, panMap: false),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.primary
                          : AppColors.secondary,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white,
                        width: isSelected ? 3 : 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color:
                              (isSelected
                                      ? AppColors.primary
                                      : AppColors.secondary)
                                  .withValues(alpha: 0.4),
                          blurRadius: isSelected ? 8 : 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Icon(
                      Icons.store,
                      color: Colors.white,
                      size: isSelected ? 24 : 18,
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ],
    );
  }

  Future<void> _callStore(String phone) async {
    final url = Uri.parse('tel:$phone');
    if (await canLaunchUrl(url)) await launchUrl(url);
  }

  Future<void> _navigate(StoreModel store) async {
    final url = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}',
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }
}

// ── Expanded map overlay ──────────────────────────────────────────────────────

class _MapOverlay extends StatelessWidget {
  final MapController mapController;
  final List<StoreModel> stores;
  final double userLat;
  final double userLng;
  final String? selectedStoreId;
  final StoreModel? focusedStore;
  final void Function(StoreModel) onMarkerTap;
  final VoidCallback onClose;
  final void Function(StoreModel) onNavigate;

  const _MapOverlay({
    required this.mapController,
    required this.stores,
    required this.userLat,
    required this.userLng,
    required this.selectedStoreId,
    required this.focusedStore,
    required this.onMarkerTap,
    required this.onClose,
    required this.onNavigate,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        color: Colors.transparent,
        child: Column(
          children: [
            // Map fills most of the screen
            Expanded(
              child: FlutterMap(
                mapController: mapController,
                options: MapOptions(
                  initialCenter: focusedStore?.hasLocation == true
                      ? ll.LatLng(focusedStore!.lat!, focusedStore!.lng!)
                      : ll.LatLng(userLat, userLng),
                  initialZoom: focusedStore?.hasLocation == true ? 15 : 12,
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName:
                        'com.karanarjuntechnologies.krishidukan',
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: ll.LatLng(userLat, userLng),
                        width: 36,
                        height: 36,
                        child: Container(
                          decoration: BoxDecoration(
                            color: AppColors.info,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                          child: const Icon(
                            Icons.my_location,
                            color: Colors.white,
                            size: 18,
                          ),
                        ),
                      ),
                      ...stores.where((s) => s.hasLocation).map((s) {
                        final isSelected = s.id == selectedStoreId;
                        return Marker(
                          point: ll.LatLng(s.lat!, s.lng!),
                          width: isSelected ? 52 : 42,
                          height: isSelected ? 52 : 42,
                          child: GestureDetector(
                            onTap: () => onMarkerTap(s),
                            child: Container(
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.primary
                                    : AppColors.secondary,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: Colors.white,
                                  width: isSelected ? 3 : 2,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color:
                                        (isSelected
                                                ? AppColors.primary
                                                : AppColors.secondary)
                                            .withValues(alpha: 0.5),
                                    blurRadius: isSelected ? 10 : 4,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: Icon(
                                Icons.store,
                                color: Colors.white,
                                size: isSelected ? 26 : 20,
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                ],
              ),
            ),

            // Bottom drawer: back button + focused store info
            Container(
              color: Colors.white,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (focusedStore != null && focusedStore!.name.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Store icon/logo
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child:
                                focusedStore!.logo != null &&
                                    focusedStore!.logo!.isNotEmpty
                                ? GestureDetector(
                                    onTap: () => _showFullStoreImage(context, focusedStore!.logo!),
                                    child: CachedNetworkImage(
                                      memCacheWidth: 1000,
                                      imageUrl: focusedStore!.logo!,
                                      fit: BoxFit.contain,
                                      errorWidget: (_, _, _) => const Icon(
                                        Icons.store,
                                        color: AppColors.primary,
                                      ),
                                    ),
                                  )
                                : const Icon(
                                    Icons.store,
                                    color: AppColors.primary,
                                  ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  focusedStore!.name,
                                  style: AppTextStyles.bodyMedium,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                if (focusedStore!.address != null &&
                                    focusedStore!.address!.isNotEmpty)
                                  Text(
                                    focusedStore!.address!,
                                    style: AppTextStyles.caption.copyWith(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: onClose,
                            icon: const Icon(Icons.list, size: 16),
                            label: const Text('Back to List'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.onSurfaceVariant,
                              side: const BorderSide(color: AppColors.divider),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                        if (focusedStore != null &&
                            focusedStore!.hasLocation) ...[
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () => onNavigate(focusedStore!),
                              icon: const Icon(Icons.navigation, size: 16),
                              label: const Text('Directions'),
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  SizedBox(height: MediaQuery.of(context).padding.bottom),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Store card ────────────────────────────────────────────────────────────────

class _StoreCard extends StatelessWidget {
  final StoreModel store;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback onMapTap;
  final VoidCallback? onCall;
  final VoidCallback? onNavigate;
  final VoidCallback onReviewsTap;
  final VoidCallback onDetails;

  const _StoreCard({
    super.key,
    required this.store,
    required this.isSelected,
    required this.onTap,
    required this.onMapTap,
    this.onCall,
    this.onNavigate,
    required this.onReviewsTap,
    required this.onDetails,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isSelected ? AppColors.primary : AppColors.divider,
          width: isSelected ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: isSelected
                ? AppColors.primary.withValues(alpha: 0.12)
                : AppColors.cardShadow,
            blurRadius: isSelected ? 8 : 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // Icon / logo
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppColors.primary
                            : AppColors.surfaceVariant,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: store.logo != null && store.logo!.isNotEmpty
                          ? GestureDetector(
                              onTap: () => _showFullStoreImage(context, store.logo!),
                              child: CachedNetworkImage(
                                memCacheWidth: 1000,
                                imageUrl: store.logo!,
                                fit: BoxFit.contain,
                                errorWidget: (_, _, _) => Icon(
                                  Icons.store,
                                  color: isSelected
                                      ? Colors.white
                                      : AppColors.onSurfaceVariant,
                                  size: 20,
                                ),
                              ),
                            )
                          : Icon(
                              Icons.store,
                              color: isSelected
                                  ? Colors.white
                                  : AppColors.onSurfaceVariant,
                              size: 20,
                            ),
                    ),
                    const SizedBox(width: 12),

                    // Name + metadata
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            store.name,
                            style: AppTextStyles.bodyMedium.copyWith(
                              color: isSelected
                                  ? AppColors.primary
                                  : AppColors.onSurface,
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: isSelected ? 2 : 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (store.ownerName != null &&
                              store.ownerName!.isNotEmpty)
                            Text(
                              store.ownerName!,
                              style: AppTextStyles.caption.copyWith(
                                color: AppColors.onSurfaceVariant,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              if (store.distanceKm != null) ...[
                                const Icon(
                                  Icons.near_me,
                                  color: AppColors.primary,
                                  size: 12,
                                ),
                                const SizedBox(width: 2),
                                Text(
                                  GeoUtils.formatDistance(store.distanceKm!),
                                  style: AppTextStyles.caption.copyWith(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              if (store.averageRating != null &&
                                  store.averageRating! > 0) ...[
                                const Icon(
                                  Icons.star,
                                  color: Colors.orange,
                                  size: 12,
                                ),
                                const SizedBox(width: 2),
                                Text(
                                  store.averageRating!.toStringAsFixed(1),
                                  style: AppTextStyles.caption.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                if (store.totalReviews != null)
                                  Text(
                                    ' (${store.totalReviews})',
                                    style: AppTextStyles.caption.copyWith(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                              ],
                            ],
                          ),
                          if (store.isManufacturer)
                            Container(
                              margin: const EdgeInsets.only(top: 4),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.secondary.withValues(
                                  alpha: 0.15,
                                ),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                'BRAND / MANUFACTURER',
                                style: AppTextStyles.caption.copyWith(
                                  color: AppColors.secondary,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 9,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),

                    // MAP button
                    if (store.hasLocation)
                      GestureDetector(
                        onTap: onMapTap,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.map_outlined,
                                color: Colors.white,
                                size: 12,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'MAP',
                                style: AppTextStyles.caption.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),

                // Address - only show when selected/expanded
                if (isSelected &&
                    store.address != null &&
                    store.address!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        size: 14,
                        color: AppColors.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          [
                            store.address,
                            if (store.city != null) store.city,
                            if (store.state != null) store.state,
                          ].where((s) => s != null && s.isNotEmpty).join(', '),
                          style: AppTextStyles.caption.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],

                // Action buttons - only show when selected/expanded
                if (isSelected) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      if (onCall != null) ...[
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: onCall,
                            icon: const Icon(Icons.phone_outlined, size: 14),
                            label: const Text('Call'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.primary,
                              side: const BorderSide(color: AppColors.primary),
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              textStyle: AppTextStyles.caption.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onReviewsTap,
                          icon: const Icon(
                            Icons.rate_review_outlined,
                            size: 14,
                          ),
                          label: Text('Reviews (${store.totalReviews ?? 0})'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(color: AppColors.primary),
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            textStyle: AppTextStyles.caption.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                      if (onNavigate != null) ...[
                        const SizedBox(width: 8),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: onNavigate,
                            icon: const Icon(Icons.navigation, size: 14),
                            label: const Text('Directions'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              textStyle: AppTextStyles.caption.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: onDetails,
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceVariant,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.info_outline,
                            size: 14,
                            color: AppColors.onSurface,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            store.isManufacturer
                                ? 'View details & brand page'
                                : 'View store details',
                            style: AppTextStyles.caption.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Icon(
                            Icons.chevron_right,
                            size: 16,
                            color: AppColors.onSurfaceVariant,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
