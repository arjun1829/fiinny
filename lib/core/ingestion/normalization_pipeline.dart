import '../ingestion/raw_transaction_event.dart';
import '../../models/transaction.dart';
import '../config/region_profile.dart';
import '../../services/parsing_enrichment.dart';

class NormalizationPipeline {
  final RegionProfile region;

  NormalizationPipeline({required this.region});

  final ParsingEnrichment _enricher = ParsingEnrichment();

  /// Main entry point: Process a batch of raw events into clean transactions
  Future<List<Transaction>> process(List<RawTransactionEvent> events) async {
    if (events.isEmpty) {
      return [];
    }

    // Ensure enrichment data is loaded
    await _enricher.ensureLoaded();

    // 1. Deduplicate (Merge SMS & Email)
    final uniqueEvents = _deduplicate(events);

    // 2. Convert to Transaction objects
    final transactions = <Transaction>[];
    for (final event in uniqueEvents) {
      final tx = await _normalize(event);
      if (tx != null) {
        transactions.add(tx);
      }
    }

    return transactions;
  }

  /// Deduplicate events that look like the same transaction
  List<RawTransactionEvent> _deduplicate(List<RawTransactionEvent> events) {
    // Simple strategy: Group by (Amount + Date(Day) + AccountHint)
    // If multiple exist, prefer Email > SMS
    // In a real system, we'd merge metadata. Here we pick the "best" source.

    final Map<String, List<RawTransactionEvent>> groups = {};

    for (final e in events) {
      // Key: 120.50_2023-10-27_1234
      final key =
          '${e.amount.toStringAsFixed(2)}_${e.timestamp.year}-${e.timestamp.month}-${e.timestamp.day}_${e.accountHint ?? "NOHINT"}';
      groups.putIfAbsent(key, () => []).add(e);
    }

    final result = <RawTransactionEvent>[];

    groups.forEach((key, group) {
      if (group.length == 1) {
        result.add(group.first);
      } else {
        // Conflict resolution: Prefer Email over SMS
        // Sort: Email first
        group.sort((a, b) {
          if (a.sourceChannel == TransactionSourceChannel.email) {
            return -1;
          }
          if (b.sourceChannel == TransactionSourceChannel.email) {
            return 1;
          }
          return 0;
        });
        result.add(group.first);
      }
    });

    return result;
  }

  Future<Transaction?> _normalize(RawTransactionEvent event) async {
    // 1. FX Conversion
    double fxRate = 1.0;
    double amountBase = event.amount;

    if (event.currency != region.defaultCurrency) {
      // NOTE: Real-time FX service not yet available.
      // Using static fallback rates for common pairs.
      if (event.currency == 'USD' && region.defaultCurrency == 'INR') {
        fxRate = 84.0;
      } else if (event.currency == 'EUR' && region.defaultCurrency == 'INR') {
        fxRate = 90.0;
      }
      amountBase = event.amount * fxRate;
    }

    // 2. Category & Merchant Normalization
    // Use ParsingEnrichment rule-based engine
    final refined = await _enricher.refineFields(
      merchantRaw: event.merchantName,
      fallbackCategory: 'Uncategorized',
    );

    final String merchant =
        refined['merchant'] ?? event.merchantName ?? 'Unknown Merchant';
    final String category = refined['category'] ?? 'Uncategorized';

    return Transaction(
      id: 'tx_${event.eventId}', // Deterministic ID
      date: event.timestamp,
      merchant: merchant,
      amount: amountBase,
      description: event.rawText,

      regionCode: region.countryCode,
      baseCurrency: region.defaultCurrency,
      originalCurrency: event.currency,
      amountOriginal: event.amount,
      fxRate: fxRate,

      sourceChannels: [event.sourceChannel],
      instrumentType: event.instrumentType,
      // instrumentId: resolveAccount(event.accountHint),

      category: category,
      metadata: event.extraMetadata,
    );
  }
}
