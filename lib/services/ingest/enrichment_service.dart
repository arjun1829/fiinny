import 'package:flutter/foundation.dart';
import '../ai/tx_extractor.dart';
import '../categorization/category_rules.dart';
import '../user_overrides.dart';
import '../../config/app_config.dart';

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
          cleanedText = cleanedText.replaceAll(RegExp(phrase, caseSensitive: false), '');
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
          final overrideCat = await UserOverrides.getCategoryForMerchant(userId, l.merchantNorm.toUpperCase());
          if (overrideCat != null) {
             return EnrichedTxn(
              category: overrideCat,
              subcategory: l.subcategory, // Keep LLM subcategory if available, or empty?
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
        debugPrint('[EnrichmentService] LLM failed: $e');
        // Fallthrough to rules
      }
    }

    // 3. Rules Fallback (Secondary)
    // If LLM is off or failed, we use the deterministic rules.
    // We need a "merchantKey" for the rules. We'll try to guess one from the text.
    // This is a bit circular because the rules *help* find the category.
    // We'll pass the raw text as the key if we have nothing else.
    // We pass the merchantRegex if we have it, to help the rules
    final ruleResult = CategoryRules.categorizeMerchant(rawText, merchantRegex);
    
    // Use the regex extracted name if available, otherwise "Unknown"
    String fallbackMerchant = (merchantRegex != null && merchantRegex.trim().isNotEmpty) 
        ? merchantRegex.trim() 
        : 'Unknown'; 
    // (Simple regex extraction could go here, but we removed it from the other files. 
    //  We might need to bring back a *simple* version here or just accept "Unknown" for offline mode).

    return EnrichedTxn(
      category: ruleResult.category,
      subcategory: ruleResult.subcategory,
      merchantName: fallbackMerchant,
      confidence: ruleResult.confidence,
      source: 'rules',
      tags: ruleResult.tags,
    );
  }
}
