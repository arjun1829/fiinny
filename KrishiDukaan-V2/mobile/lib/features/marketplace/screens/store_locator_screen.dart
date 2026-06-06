import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/location_provider.dart' as loc;

class StoreLocatorScreen extends ConsumerWidget {
  const StoreLocatorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locationAsync = ref.watch(loc.locationProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Store Locator',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: locationAsync.when(
        loading: () => const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Getting your location...'),
            ],
          ),
        ),
        error: (_, _) => _buildMap(
          context,
          AppConfig.defaultLat,
          AppConfig.defaultLng,
        ),
        data: (location) => _buildMap(context, location.lat, location.lng),
      ),
    );
  }

  Widget _buildMap(BuildContext context, double lat, double lng) {
    return FlutterMap(
      options: MapOptions(
        initialCenter: LatLng(lat, lng),
        initialZoom: 12,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.karanarjuntechnologies.krishidukan',
        ),
        MarkerLayer(
          markers: [
            // Current user location marker
            Marker(
              point: LatLng(lat, lng),
              width: 40,
              height: 40,
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.info,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: const Icon(Icons.my_location,
                    color: Colors.white, size: 20),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
