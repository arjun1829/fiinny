import 'dart:io';
import '../connector.dart';
import '../raw_transaction_event.dart';

class ManualUploadConnector extends SourceConnector {
  ManualUploadConnector({required super.region, required super.userId});

  @override
  Future<void> initialize() async {
    // No specific initialization needed
  }

  @override
  Future<List<RawTransactionEvent>> backfill({int days = 90}) async {
    // Manual uploads are triggered by user action, not backfill
    return [];
  }

  @override
  Future<List<RawTransactionEvent>> syncDelta({DateTime? lastSync}) async {
    return [];
  }

  /// Specific method for this connector to process a file
  Future<List<RawTransactionEvent>> processFile(File file) async {
    if (!region.allowManualUpload) {
      return [];
    }

    // Note: CSV/PDF parsing logic to be implemented here in future
    // 1. Detect file type
    // 2. Parse rows
    // 3. Map to RawTransactionEvent
    throw UnimplementedError('Manual file upload parsing not yet implemented');
  }
}
