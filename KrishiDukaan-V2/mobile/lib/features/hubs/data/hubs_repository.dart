import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/models/hub_model.dart';
import 'initial_hubs.dart';

class HubsRepository {
  final _db = FirebaseFirestore.instance;

  /// Fetches crop hubs from Firestore 'hubs' collection.
  /// Falls back to [kInitialHubs] if Firestore is empty or unavailable.
  Future<List<HubModel>> fetchHubs() async {
    try {
      final snap = await _db
          .collection('hubs')
          .orderBy('name')
          .get();
      if (snap.docs.isNotEmpty) {
        return snap.docs.map(HubModel.fromFirestore).toList();
      }
    } catch (e) {
      // ignore — fall through to hardcoded fallback
    }
    return kInitialHubs;
  }

  /// Fetches a single hub by its document ID.
  Future<HubModel?> fetchHubById(String id) async {
    try {
      final doc = await _db.collection('hubs').doc(id).get();
      if (doc.exists) return HubModel.fromFirestore(doc);
    } catch (_) {}
    // Try fallback list
    try {
      return kInitialHubs.firstWhere((h) => h.id == id);
    } catch (_) {
      return null;
    }
  }
}
