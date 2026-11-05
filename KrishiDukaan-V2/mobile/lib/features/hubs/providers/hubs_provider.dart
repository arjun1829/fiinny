import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/hub_model.dart';
import '../data/hubs_repository.dart';

final _repo = HubsRepository();

/// How long hub data is reused before it is read again. It used to be kept
/// for the whole app session, so hub images changed in Admin > Hubs didn't
/// appear until the app was fully closed and reopened.
const _hubsTtl = Duration(minutes: 15);

/// Re-reads [ref]'s provider [_hubsTtl] after it was built: right away while
/// a screen shows it, otherwise the next time one does.
void _refreshAfterTtl(Ref ref) {
  final timer = Timer(_hubsTtl, ref.invalidateSelf);
  ref.onDispose(timer.cancel);
}

final hubsListProvider = FutureProvider<List<HubModel>>((ref) {
  _refreshAfterTtl(ref);
  return _repo.fetchHubs();
});

final hubDetailProvider =
    FutureProvider.family<HubModel?, String>((ref, id) async {
  _refreshAfterTtl(ref);
  // Already loaded with the list (Home's Shop by Crop / the Hubs tab)?
  // Then opening one costs no extra read.
  final cached = ref.read(hubsListProvider).value;
  for (final h in cached ?? const <HubModel>[]) {
    if (h.id == id) return h;
  }
  return _repo.fetchHubById(id);
});
