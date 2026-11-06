import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';
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
import '../providers/selected_location_provider.dart';
import '../widgets/location_picker_sheet.dart';
import '../widgets/review_sheet.dart';
import '../widgets/route_planner_sheet.dart';
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
              placeholder: (context, url) =>
                  const Center(child: CircularProgressIndicator()),
              errorWidget: (context, url, error) =>
                  const Icon(Icons.error, color: Colors.white),
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
  // Set when arriving from a "Directions" tap elsewhere in the app (product,
  // brand, dealer, search suggestion) — the target may not be part of the
  // public storesByDistanceProvider result set, so it's merged in manually
  // and the expanded map is opened on it automatically.
  final StoreModel? initialFocusStore;

  const StoreLocatorScreen({super.key, this.initialFocusStore});

  @override
  ConsumerState<StoreLocatorScreen> createState() => _StoreLocatorScreenState();
}

class _StoreLocatorScreenState extends ConsumerState<StoreLocatorScreen> {
  // Two separate controllers: the map strip and the expanded overlay are
  // distinct GoogleMap widget instances (google_maps_flutter hands back a
  // fresh controller per widget via onMapCreated — unlike flutter_map's single
  // shared MapController), so each needs its own camera handle.
  GoogleMapController? _stripMapController;
  GoogleMapController? _overlayMapController;
  final _searchCtrl = TextEditingController();

  // Index-based scrolling: a lazy ListView + GlobalKey/ensureVisible could
  // only scroll to cards that were already built, so selecting a distant
  // store from the map silently did nothing. ScrollablePositionedList can
  // jump to any index, built or not.
  final _itemScrollCtrl = ItemScrollController();

  // The currently rendered (filtered) list — captured during build so
  // _selectStore can translate a store id into a list index.
  List<StoreModel> _visibleStores = const [];

  // A marker tapped while the fullscreen map overlay is up can't scroll a
  // list that's hidden behind the overlay — remember it and scroll on close.
  String? _pendingScrollStoreId;

  String? _selectedStoreId;
  String _searchQuery = '';
  Timer? _searchDebounce;

  // Ephemeral (resets each app launch) — the persisted part of the location
  // preference is the area itself (`selectedLocationProvider`), not the
  // radius. null = "All", no distance cutoff.
  double? _radiusKm = 50;

  // Whether the map is expanded (full screen overlay)
  bool _mapExpanded = false;

  StoreModel? _externalFocusStore;

  @override
  void initState() {
    super.initState();
    _applyIncomingFocus(widget.initialFocusStore);
  }

  @override
  void didUpdateWidget(covariant StoreLocatorScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The screen stays alive inside the bottom-nav's IndexedStack, so a
    // second "Directions" tap while this tab is already mounted arrives as
    // a widget update, not a fresh initState.
    if (widget.initialFocusStore?.id != oldWidget.initialFocusStore?.id ||
        widget.initialFocusStore?.lat != oldWidget.initialFocusStore?.lat ||
        widget.initialFocusStore?.lng != oldWidget.initialFocusStore?.lng) {
      _applyIncomingFocus(widget.initialFocusStore);
    }
  }

  void _applyIncomingFocus(StoreModel? store) {
    if (store == null) return;
    _externalFocusStore = store;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _openMapExpanded(store);
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _stripMapController?.dispose();
    _overlayMapController?.dispose();
    super.dispose();
  }

  /// Declutters the map/list to stores within [radiusKm] of (lat, lng).
  /// [keepId] (the deep-link focus store, if any) always survives regardless
  /// of distance — a store someone was specifically directed to must never
  /// be silently hidden by an unrelated area/radius choice. Stores with no
  /// usable location are kept when radiusKm is null (today's behavior) but
  /// dropped once a numeric radius is active, since there's no way to verify
  /// they're actually in range.
  List<StoreModel> _applyRadius(
    List<StoreModel> stores,
    double lat,
    double lng,
    double? radiusKm, {
    String? keepId,
  }) {
    if (radiusKm == null) return stores;
    return stores.where((s) {
      if (keepId != null && s.id == keepId) return true;
      if (!s.hasLocation) return false;
      final d = s.distanceKm ?? GeoUtils.distanceKm(lat, lng, s.lat!, s.lng!);
      return d <= radiusKm;
    }).toList();
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

  Future<void> _animateTo(
    GoogleMapController? controller,
    double lat,
    double lng,
    double zoom,
  ) async {
    if (controller == null) return;
    await controller.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(lat, lng), zoom),
    );
  }

  void _selectStore(StoreModel store, {bool panMap = true}) {
    setState(() => _selectedStoreId = store.id);

    if (panMap && store.hasLocation) {
      _animateTo(_stripMapController, store.lat!, store.lng!, 15);
    }

    if (_mapExpanded) {
      // List is hidden behind the overlay — scroll once it closes.
      _pendingScrollStoreId = store.id;
    } else {
      _scrollListToStore(store.id);
    }
  }

  void _scrollListToStore(String storeId) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_itemScrollCtrl.isAttached) return;
      final index = _visibleStores.indexWhere((s) => s.id == storeId);
      if (index < 0) return;
      _itemScrollCtrl.scrollTo(
        index: index,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
        alignment: 0.05,
      );
    });
  }

  void _openMapExpanded(StoreModel store) {
    // The overlay's initial camera position is set from the focused store, so
    // it opens already centered — its onMapCreated callback anims it too, in
    // case the initial camera was cut short by a fast mount.
    _selectStore(store, panMap: false);
    setState(() => _mapExpanded = true);
  }

  @override
  Widget build(BuildContext context) {
    final storesAsync = ref.watch(storesByDistanceProvider);
    final locationAsync = ref.watch(loc.locationProvider);
    final manualLoc = ref.watch(selectedLocationProvider);

    // Always use a usable center — don't block on location. A manually
    // picked browsing area (if set) always wins over live GPS.
    final userLat =
        manualLoc?.lat ?? locationAsync.value?.lat ?? AppConfig.defaultLat;
    final userLng =
        manualLoc?.lng ?? locationAsync.value?.lng ?? AppConfig.defaultLng;
    final locationLoading = manualLoc == null && locationAsync.isLoading;
    final locationNameAsync = ref.watch(loc.locationNameProvider);
    final areaLabel =
        manualLoc?.label ??
        locationNameAsync.value ??
        (locationLoading ? 'Locating…' : 'Current Location');

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        titleSpacing: 16,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.onSurface,
        systemOverlayStyle: topBarOverlayStyle,
        flexibleSpace: const TopBarBackdrop(),
        title: Row(
          children: [
            const AppBrandIcon(size: 30),
            const SizedBox(width: 10),
            Text(
              'Store Locator',
              style: AppTextStyles.heading2.copyWith(
                color: AppColors.onSurface,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
      // Read .value directly instead of storesAsync.when(...) — Riverpod
      // keeps the previous value available (hasValue stays true) while a
      // FutureProvider silently refreshes in the background (e.g. every time
      // selectedLocationProvider/locationProvider resolve). Routing the whole
      // screen — including the persistent GoogleMap — through .when()'s
      // `loading` branch meant every background refresh replaced the entire
      // body with a bare spinner and remounted a brand new GoogleMap,
      // reading as "the screen goes white and the map reloads" on a loop.
      // Only the very first load (no cached value yet) shows the spinner now.
      body: !storesAsync.hasValue
          ? (storesAsync.hasError
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.store_outlined,
                          size: 48,
                          color: AppColors.onSurfaceVariant,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Could not load stores',
                          style: AppTextStyles.bodyMedium,
                        ),
                      ],
                    ),
                  )
                : const Center(child: CircularProgressIndicator()))
          : Builder(
              builder: (context) {
                final rawStores = storesAsync.value!;
                // Merge in a store passed from outside (product/brand/dealer/search)
                // that might not be part of the public directory, so its pin and
                // info drawer always render correctly.
                final focus = _externalFocusStore;
                final allStores =
                    focus != null && !rawStores.any((s) => s.id == focus.id)
                    ? [...rawStores, focus]
                    : rawStores;
                // Radius declutters both the map and the list; the deep-link focus
                // store (if any) always survives it. Text search only affects the
                // list, matching the existing behavior where the map ignores it.
                final radiusFiltered = _applyRadius(
                  allStores,
                  userLat,
                  userLng,
                  _radiusKm,
                  keepId: focus?.id,
                );
                final stores = _filteredStores(radiusFiltered);
                _visibleStores = stores;
                final selected = stores.firstWhere(
                  (s) => s.id == _selectedStoreId,
                  orElse: () => stores.isNotEmpty
                      ? stores.first
                      : StoreModel(id: '', name: ''),
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
                            stores: radiusFiltered,
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
                              // ── Location chip ─ tap to pick a different area or
                              // switch back to current location.
                              InkWell(
                                onTap: () => showLocationPickerSheet(
                                  context: context,
                                  ref: ref,
                                ),
                                borderRadius: BorderRadius.circular(10),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 6,
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Icons.location_on_outlined,
                                        size: 16,
                                        color: AppColors.primary,
                                      ),
                                      const SizedBox(width: 6),
                                      Expanded(
                                        child: Text(
                                          areaLabel,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: AppTextStyles.bodySmall
                                              .copyWith(
                                                color: AppColors.primary,
                                                fontWeight: FontWeight.w700,
                                              ),
                                        ),
                                      ),
                                      const Icon(
                                        Icons.expand_more,
                                        size: 16,
                                        color: AppColors.primary,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              TextField(
                                controller: _searchCtrl,
                                // Waits for a pause in typing: each update
                                // rebuilds the maps and all their markers.
                                onChanged: (v) {
                                  _searchDebounce?.cancel();
                                  _searchDebounce = Timer(
                                    const Duration(milliseconds: 250),
                                    () {
                                      if (mounted) {
                                        setState(() => _searchQuery = v);
                                      }
                                    },
                                  );
                                },
                                decoration: InputDecoration(
                                  hintText: 'Search stores by name or area...',
                                  prefixIcon: const Icon(
                                    Icons.search,
                                    size: 20,
                                    color: AppColors.onSurfaceVariant,
                                  ),
                                  suffixIcon: _searchQuery.isNotEmpty
                                      ? IconButton(
                                          icon: const Icon(
                                            Icons.clear,
                                            size: 18,
                                          ),
                                          onPressed: () {
                                            _searchDebounce?.cancel();
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
                              const SizedBox(height: 8),
                              // ── Radius chips ─ purely local/instant filter, no
                              // network round-trip.
                              Wrap(
                                spacing: 8,
                                children: [
                                  _RadiusChip(
                                    label: '25 km',
                                    selected: _radiusKm == 25,
                                    onTap: () => setState(() => _radiusKm = 25),
                                  ),
                                  _RadiusChip(
                                    label: '50 km',
                                    selected: _radiusKm == 50,
                                    onTap: () => setState(() => _radiusKm = 50),
                                  ),
                                  _RadiusChip(
                                    label: '100 km',
                                    selected: _radiusKm == 100,
                                    onTap: () =>
                                        setState(() => _radiusKm = 100),
                                  ),
                                  _RadiusChip(
                                    label: 'All',
                                    selected: _radiusKm == null,
                                    onTap: () =>
                                        setState(() => _radiusKm = null),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _radiusKm == null
                                    ? '${stores.length} store${stores.length != 1 ? 's' : ''} found'
                                    : '${stores.length} store${stores.length != 1 ? 's' : ''} found within ${_radiusKm!.round()} km',
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
                                        _searchQuery.isNotEmpty
                                            ? 'No stores match "$_searchQuery"'
                                            : (_radiusKm != null &&
                                                  allStores.isNotEmpty)
                                            // The radius, not an empty DB, is
                                            // why nothing shows — always give a
                                            // one-tap way back to a non-empty
                                            // view instead of a dead end.
                                            ? 'No stores within ${_radiusKm!.round()} km of $areaLabel'
                                            : 'No stores available',
                                        textAlign: TextAlign.center,
                                        style: AppTextStyles.bodyMedium
                                            .copyWith(
                                              color: AppColors.onSurfaceVariant,
                                            ),
                                      ),
                                      if (_searchQuery.isEmpty &&
                                          _radiusKm != null &&
                                          allStores.isNotEmpty) ...[
                                        const SizedBox(height: 12),
                                        OutlinedButton(
                                          onPressed: () =>
                                              setState(() => _radiusKm = null),
                                          child: const Text('Show all stores'),
                                        ),
                                      ],
                                    ],
                                  ),
                                )
                              : ScrollablePositionedList.builder(
                                  itemScrollController: _itemScrollCtrl,
                                  padding: const EdgeInsets.all(12),
                                  itemCount: stores.length,
                                  itemBuilder: (_, i) {
                                    final store = stores[i];
                                    final isSelected =
                                        store.id == _selectedStoreId ||
                                        (!hasSelected && i == 0);
                                    return _StoreCard(
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
                                          ? () => _navigate(
                                              store,
                                              allStores: allStores,
                                              userLat: userLat,
                                              userLng: userLng,
                                              hasUserLocation:
                                                  locationAsync.value != null,
                                            )
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
                                              ? () => _navigate(
                                                  store,
                                                  allStores: allStores,
                                                  userLat: userLat,
                                                  userLng: userLng,
                                                  hasUserLocation:
                                                      locationAsync.value !=
                                                      null,
                                                )
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
                        onMapCreated: (c) {
                          _overlayMapController = c;
                          final focused = hasSelected ? selected : null;
                          if (focused != null && focused.hasLocation) {
                            _animateTo(c, focused.lat!, focused.lng!, 15);
                          }
                        },
                        stores: radiusFiltered,
                        userLat: userLat,
                        userLng: userLng,
                        selectedStoreId: _selectedStoreId,
                        focusedStore: hasSelected ? selected : null,
                        onMarkerTap: (s) => _selectStore(s, panMap: false),
                        onClose: () {
                          setState(() => _mapExpanded = false);
                          final pending = _pendingScrollStoreId;
                          _pendingScrollStoreId = null;
                          if (pending != null) _scrollListToStore(pending);
                        },
                        onNavigate: (s) => _navigate(
                          s,
                          allStores: allStores,
                          userLat: userLat,
                          userLng: userLng,
                          hasUserLocation: locationAsync.value != null,
                        ),
                        onDetails: (s) {
                          showStoreDetailSheet(
                            context: context,
                            ref: ref,
                            store: s,
                            onCall: s.phone != null && s.phone!.isNotEmpty
                                ? () => _callStore(s.phone!)
                                : null,
                            onNavigate: s.hasLocation
                                ? () => _navigate(
                                    s,
                                    allStores: allStores,
                                    userLat: userLat,
                                    userLng: userLng,
                                    hasUserLocation:
                                        locationAsync.value != null,
                                  )
                                : null,
                          );
                        },
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
    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(userLat, userLng),
            zoom: 12,
          ),
          onMapCreated: (c) => _stripMapController = c,
          style: _mapStyleJson,
          zoomControlsEnabled: false,
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          compassEnabled: false,
          rotateGesturesEnabled: false,
          tiltGesturesEnabled: false,
          markers: _buildStoreMarkers(
            stores: stores,
            userLat: userLat,
            userLng: userLng,
            locationLoading: locationLoading,
            selectedStoreId: _selectedStoreId,
            onStoreTap: (s) => _selectStore(s, panMap: false),
          ),
        ),
        // top-right, not bottom-right — Google's mandatory map attribution
        // ("Map data © Google · Terms" on web, the Google logo on native)
        // always renders in the bottom corners and can't be hidden (Maps
        // Platform ToS), so a bottom-right FAB sits directly on top of it.
        Positioned(
          top: 12,
          right: 12,
          child: FloatingActionButton.small(
            heroTag: 'recenter_map',
            backgroundColor: Colors.white,
            foregroundColor: AppColors.primary,
            onPressed: () =>
                _animateTo(_stripMapController, userLat, userLng, 14),
            child: const Icon(Icons.my_location),
          ),
        ),
      ],
    );
  }

  Future<void> _callStore(String phone) async {
    final url = Uri.parse('tel:$phone');
    if (await canLaunchUrl(url)) await launchUrl(url);
  }

  /// Opens the From → To route planner (Google-Maps-style) for [store].
  /// Inside it, the store's own Google Business listing is surfaced when the
  /// owner has added one; otherwise navigation falls back to coordinates.
  void _navigate(
    StoreModel store, {
    required List<StoreModel> allStores,
    required double userLat,
    required double userLng,
    required bool hasUserLocation,
  }) {
    showRoutePlannerSheet(
      context,
      stores: allStores,
      destination: store,
      userLat: userLat,
      userLng: userLng,
      hasUserLocation: hasUserLocation,
    );
  }
}

// ── Expanded map overlay ──────────────────────────────────────────────────────

class _MapOverlay extends StatelessWidget {
  final void Function(GoogleMapController) onMapCreated;
  final List<StoreModel> stores;
  final double userLat;
  final double userLng;
  final String? selectedStoreId;
  final StoreModel? focusedStore;
  final void Function(StoreModel) onMarkerTap;
  final VoidCallback onClose;
  final void Function(StoreModel) onNavigate;
  final void Function(StoreModel) onDetails;

  const _MapOverlay({
    required this.onMapCreated,
    required this.stores,
    required this.userLat,
    required this.userLng,
    required this.selectedStoreId,
    required this.focusedStore,
    required this.onMarkerTap,
    required this.onClose,
    required this.onNavigate,
    required this.onDetails,
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
              child: GoogleMap(
                initialCameraPosition: CameraPosition(
                  target: focusedStore?.hasLocation == true
                      ? LatLng(focusedStore!.lat!, focusedStore!.lng!)
                      : LatLng(userLat, userLng),
                  zoom: focusedStore?.hasLocation == true ? 15 : 12,
                ),
                onMapCreated: onMapCreated,
                style: _mapStyleJson,
                zoomControlsEnabled: false,
                myLocationButtonEnabled: false,
                mapToolbarEnabled: false,
                compassEnabled: false,
                rotateGesturesEnabled: false,
                tiltGesturesEnabled: false,
                markers: _buildStoreMarkers(
                  stores: stores,
                  userLat: userLat,
                  userLng: userLng,
                  locationLoading: false,
                  selectedStoreId: selectedStoreId,
                  onStoreTap: onMarkerTap,
                  emphasizeSelected: true,
                ),
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
                                    onTap: () => _showFullStoreImage(
                                      context,
                                      focusedStore!.logo!,
                                    ),
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
                  // Was only Back to List + Directions here — a store found
                  // via search and opened on the map had no way to reach the
                  // same call/reviews/products/brand-page actions the list
                  // card's "View store details" already offered, so this
                  // reuses the identical sheet.
                  if (focusedStore != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      child: InkWell(
                        onTap: () => onDetails(focusedStore!),
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
                                focusedStore!.isManufacturer
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

// ── Radius chip ───────────────────────────────────────────────────────────────

class _RadiusChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _RadiusChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      showCheckmark: false,
      labelStyle: AppTextStyles.caption.copyWith(
        color: selected ? Colors.white : AppColors.onSurfaceVariant,
        fontWeight: FontWeight.w700,
      ),
      backgroundColor: AppColors.surfaceVariant,
      selectedColor: AppColors.primary,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
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
                              onTap: () =>
                                  _showFullStoreImage(context, store.logo!),
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

// ── Marker + style helpers (shared by the strip map and the expanded overlay) ─

/// Builds the marker set for a Google Map instance: a blue "you are here" pin
/// plus one pin per store with a location. Selected stores render green and
/// (on the full-screen overlay, [emphasizeSelected]) with a higher zIndex so
/// they sit above their neighbours instead of being occluded.
Set<Marker> _buildStoreMarkers({
  required List<StoreModel> stores,
  required double userLat,
  required double userLng,
  required bool locationLoading,
  required String? selectedStoreId,
  required void Function(StoreModel) onStoreTap,
  bool emphasizeSelected = false,
}) {
  final markers = <Marker>{};

  if (!locationLoading) {
    markers.add(
      Marker(
        markerId: const MarkerId('__user_location__'),
        position: LatLng(userLat, userLng),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
        anchor: const Offset(0.5, 0.5),
        zIndexInt: 0,
        consumeTapEvents: true,
      ),
    );
  }

  for (final s in stores.where((s) => s.hasLocation)) {
    final isSelected = s.id == selectedStoreId;
    markers.add(
      Marker(
        markerId: MarkerId(s.id),
        position: LatLng(s.lat!, s.lng!),
        icon: BitmapDescriptor.defaultMarkerWithHue(
          isSelected ? BitmapDescriptor.hueGreen : BitmapDescriptor.hueRed,
        ),
        zIndexInt: isSelected && emphasizeSelected ? 2 : 1,
        infoWindow: InfoWindow(title: s.name),
        onTap: () => onStoreTap(s),
      ),
    );
  }

  return markers;
}

/// Minimal Google Maps JSON style: hides POI labels (restaurants, ATMs, etc.)
/// so store pins stay the visual focus — mirrors the web StoreLocatorView's
/// mapOptions.styles (`featureType: 'poi', elementType: 'labels', visibility: 'off'`).
const String _mapStyleJson = '''
[
  {
    "featureType": "poi",
    "elementType": "labels",
    "stylers": [{ "visibility": "off" }]
  }
]
''';
