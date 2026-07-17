import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/hub_model.dart';
import '../data/hubs_repository.dart';

final _repo = HubsRepository();

final hubsListProvider = FutureProvider<List<HubModel>>((ref) {
  return _repo.fetchHubs();
});

final hubDetailProvider =
    FutureProvider.family<HubModel?, String>((ref, id) {
  return _repo.fetchHubById(id);
});
