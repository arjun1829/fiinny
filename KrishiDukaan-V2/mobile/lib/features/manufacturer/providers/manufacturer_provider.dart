import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/network_retailer_model.dart';
import '../data/manufacturer_repository.dart';

final _repo = ManufacturerRepository();

final manufacturerRepoProvider = Provider((_) => _repo);

final retailerNetworkProvider =
    StreamProvider.family<List<NetworkRetailerModel>, String>(
        (ref, phone) => _repo.watchNetwork(phone));

final networkStatsProvider =
    FutureProvider.family<Map<String, int>, String>(
        (ref, phone) => _repo.fetchNetworkStats(phone));

final manufacturerCatalogProvider =
    StreamProvider.family<List<CatalogModel>, String>(
        (ref, phone) => _repo.watchManufacturerCatalog(phone));

final manufacturerAnalyticsProvider =
    FutureProvider.family<Map<String, int>, String>(
        (ref, phone) => _repo.fetchAnalytics(phone));

final brandPageDataProvider =
    FutureProvider.family<Map<String, dynamic>?, String>(
        (ref, phone) => _repo.fetchBrandPage(phone));
