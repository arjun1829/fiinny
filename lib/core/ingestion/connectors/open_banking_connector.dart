import '../connector.dart';
import '../raw_transaction_event.dart';

class OpenBankingConnector extends SourceConnector {
  OpenBankingConnector({required super.region, required super.userId});

  @override
  Future<void> initialize() async {
    if (region.supportedAggregators.isEmpty) {
      return;
    }
    // Note: Plaid/TrueLayer SDK initialization would happen here.
    // Currently disabled until aggregator credentials are configured.
  }

  @override
  Future<List<RawTransactionEvent>> backfill({int days = 90}) async {
    // Placeholder: Return empty list or mock data
    return [];
  }

  @override
  Future<List<RawTransactionEvent>> syncDelta({DateTime? lastSync}) async {
    return [];
  }
}
