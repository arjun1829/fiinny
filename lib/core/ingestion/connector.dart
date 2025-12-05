import '../config/region_profile.dart';
import 'raw_transaction_event.dart';

abstract class SourceConnector {
  final RegionProfile region;
  final String userId;

  SourceConnector({required this.region, required this.userId});

  /// Initialize the connector (e.g., check permissions, load tokens)
  Future<void> initialize();

  /// Fetch new transactions since [lastSync]
  Future<List<RawTransactionEvent>> syncDelta({DateTime? lastSync});

  /// Perform a full backfill (optional)
  Future<List<RawTransactionEvent>> backfill({int days = 90});
}
