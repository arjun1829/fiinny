import 'package:flutter/foundation.dart';

import '../connector.dart';
import '../raw_transaction_event.dart';

class AndroidSmsConnector extends SourceConnector {
  AndroidSmsConnector({required super.region, required super.userId});

  // Cache for recent message keys to avoid duplicates in realtime listener.
  // Kept if we decide to re-implement backfill.
  // static const int _recentCap = 400;
  // final ListQueue<String> _recent = ListQueue<String>(_recentCap);

  bool get _isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  @override
  Future<void> initialize() async {
    if (!_isAndroid) {
      return;
    }
    if (!region.allowSmsIngestion) {
      return;
    }

    // Check permissions? Usually handled by UI before calling this.
  }

  @override
  Future<List<RawTransactionEvent>> backfill({int days = 90}) async {
    // SMS ingestion is temporarily disabled or moved to native channel.
    // Return empty list to satisfy contract.
    return [];
  }

  @override
  Future<List<RawTransactionEvent>> syncDelta({DateTime? lastSync}) async {
    final days =
        lastSync == null ? 30 : DateTime.now().difference(lastSync).inDays + 1;
    return backfill(days: days);
  }
}
