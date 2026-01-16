
import '../ai/tx_extractor.dart';
import '../categorization/category_rules.dart';
import '../user_overrides.dart';
import '../../config/app_config.dart';
import '../merchants/merchant_alias_service.dart';
import '../merchants/brand_service.dart';
import '../crowd/crowd_sourcing_service.dart';

/// Result object for enriched transaction data
class EnrichedTxn {
  final String category;
  final String subcategory;
  final String merchantName; // Clean, human-readable name (e.g. "Uber")
  final double confidence;
  final String source; // 'user_override', 'llm', 'rules'
  final List<String> tags;

  const EnrichedTxn({
    required this.category,
    required this.subcategory,
    required this.merchantName,
    required this.confidence,
    required this.source,
    required this.tags,
  });
}

class EnrichmentService {
  EnrichmentService._();
  static final EnrichmentService instance = EnrichmentService._();

  /// Main entry point to enrich a transaction.
  ///
  /// [rawText]: The full SMS or Email body (masked is fine).
  /// [amount]: Transaction amount.
  /// [date]: Transaction date.
  /// [userId]: For looking up user overrides.
  /// [hints]: Optional hints from regex (e.g. "regex thinks this is a debit").
  Future<EnrichedTxn> enrichTransaction({
    required String userId,
    required String rawText,
    required double amount,
    required DateTime date,
    List<String> hints = const [],
    String? merchantRegex, // Optional regex-extracted merchant name
    String currency = 'INR', // Default to INR for backward compatibility
    String regionCode = 'IN',
  }) async {
    // 1. Check User Overrides (Highest Priority)
    // We need a "key" to look up overrides. We'll try to extract a rough key first.
    // Since we don't have the clean merchant name yet, we might miss some overrides
    // if they are keyed by the *clean* name.
    // However, the old system keyed by "merchantKey" which was often just the raw string or a simple guess.
    // For now, we will skip this check *here* and do it *after* we get a merchant name,
    // OR we can try to guess a key now.
    // BETTER APPROACH: Let's get the merchant name from LLM/Rules first, then check overrides.

    // 2. LLM Call (Primary Engine)
    if (AiConfig.llmOn) {
      try {
        // Scrub known legal/footer noise to prevent LLM confusion
        var cleanedText = rawText;
        const noisePhrases = [
          'any errors or omissions',
          'we maintain strict',
          'security standards',
          'please do not reply',
          'system generated',
        ];
        for (final phrase in noisePhrases) {
          cleanedText =
              cleanedText.replaceAll(RegExp(phrase, caseSensitive: false), '');
        }

        if (merchantRegex != null && merchantRegex.trim().isNotEmpty) {
          final m = merchantRegex.trim();
          // Quick check to ensure regex didn't pick up noise
          bool isNoise = false;
          for (final phrase in noisePhrases) {
            if (m.toLowerCase().contains(phrase)) {
              isNoise = true;
              break;
            }
          }
          if (!isNoise) {
            // We modify the hints list (copy it) or just append string
            cleanedText = "Possible Merchant: $m\n" + cleanedText;
          }
        }

        final enrichedDesc = hints.join('; ') + '; ' + cleanedText;

        final labels = await TxExtractor.labelUnknown([
          TxRaw(
            amount: amount,
            currency: currency,
            regionCode: regionCode,
            merchant: 'UNKNOWN', // Let LLM figure it out from desc
            desc: enrichedDesc,
            date: date.toIso8601String(),
          )
        ]);

        if (labels.isNotEmpty) {
          final l = labels.first;

          // Check override with the LLM-derived merchant name
          final overrideCat = await UserOverrides.getCategoryForMerchant(
              userId, l.merchantNorm.toUpperCase());
          if (overrideCat != null) {
            return EnrichedTxn(
              category: overrideCat,
              subcategory:
                  l.subcategory, // Keep LLM subcategory if available, or empty?
              merchantName: l.merchantNorm,
              confidence: 1.0,
              source: 'user_override',
              tags: l.labels,
            );
          }

          // Return LLM result
          return EnrichedTxn(
            category: l.category,
            subcategory: l.subcategory,
            merchantName: l.merchantNorm,
            confidence: l.confidence,
            source: 'llm',
            tags: l.labels,
          );
        }
      } catch (e) {
        // debugPrint('[EnrichmentService] LLM failed: $e');
        // Fallthrough to rules
      }
    }

    // 3. Rules Fallback (Secondary)
    // Use the robust MerchantAlias + BrandService first
    String cleanMerchant = 'Unknown';
    if (merchantRegex != null && merchantRegex.trim().isNotEmpty) {
      // Normalize the regex-extracted name (e.g. "ZOMATO LIMITED" -> "ZOMATO")
      cleanMerchant = MerchantAlias.normalize(merchantRegex);
    }

    // ... (inside enrichTransaction)

    // Try to find a curated brand profile
    final brand = BrandService.instance.getProfile(cleanMerchant);
    if (brand != null) {
      // High confidence brand match
      return EnrichedTxn(
        category: brand.defaultCategory ?? 'Others',
        subcategory: brand.defaultSubcategory ?? 'others',
        merchantName: brand.displayName,
        confidence: 0.95,
        source: 'brand_registry',
        tags: const [],
      );
    }

    // [NEW] Check Crowd-Sourced Dictionary (The "Hive Mind")
    // Ensure it's initialized (noop if already loaded)
    await CrowdSourcingService.instance.init();
    final crowdMatch = CrowdSourcingService.instance.lookup(
        cleanMerchant != 'Unknown' ? cleanMerchant : (merchantRegex ?? ''));
    if (crowdMatch != null) {
      return EnrichedTxn(
        category: crowdMatch['nav'] ?? 'Others',
        subcategory: crowdMatch['sub'] ?? 'others',
        merchantName: cleanMerchant != 'Unknown'
            ? cleanMerchant
            : (merchantRegex ?? 'Unknown'),
        confidence: (crowdMatch['c'] as num?)?.toDouble() ?? 0.85,
        source: 'crowd_hive',
        tags: const [],
      );
    }

    // If no brand profile or crowd match, fall back to heuristic rules
    final ruleResult = CategoryRules.categorizeMerchant(rawText, merchantRegex);

    // If rules gave a decent name, use it, otherwise use our normalized one
    // Actually CategoryRules doesn't return a name, it returns a category.
    // We use 'cleanMerchant' as the name if it's not 'Unknown', else 'Unknown'.
    final finalName = (cleanMerchant != 'Unknown' && cleanMerchant.isNotEmpty)
        ? cleanMerchant
        : (merchantRegex ?? 'Unknown');

    return EnrichedTxn(
      category: ruleResult.category,
      subcategory: ruleResult.subcategory,
      merchantName: finalName, // Normalized name
      confidence: ruleResult.confidence,
      source: 'rules',
      tags: ruleResult.tags,
    );
  }
}
