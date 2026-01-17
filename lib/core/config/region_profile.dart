import 'bank_profiles.dart';

class RegionProfile {
  final String countryCode; // ISO 3166-1 alpha-2 (e.g., IN, US)
  final List<String> supportedLanguages; // e.g., ['en-IN', 'hi-IN']
  final String defaultCurrency; // ISO 4217 (e.g., INR, USD)
  final String currencySymbol; // e.g., ₹, $

  // Data Source Permissions
  final bool allowSmsIngestion;
  final bool allowGmailIngestion;
  final List<String> supportedAggregators; // ['PLAID', 'TRUELAYER', etc.]
  final bool allowManualUpload;

  // Payment Rails & Keywords
  final List<String> instantPaymentSchemes; // ['UPI', 'IMPS', 'FedNow']
  final List<String> localP2PKeywords; // ['upi', 'vpa', 'zelle']

  // Bank Profiles
  final List<BankProfile> majorBanks;

  // Compliance
  final bool requireOpenBankingConsent;

  const RegionProfile({
    required this.countryCode,
    required this.supportedLanguages,
    required this.defaultCurrency,
    required this.currencySymbol,
    this.allowSmsIngestion = false,
    this.allowGmailIngestion = false,
    this.supportedAggregators = const [],
    this.allowManualUpload = true,
    this.instantPaymentSchemes = const [],
    this.localP2PKeywords = const [],
    this.majorBanks = const [],
    this.requireOpenBankingConsent = false,
  });

  // ── Predefined Profiles ────────────────────────────────────────────────────

  static const RegionProfile india = RegionProfile(
    countryCode: 'IN',
    supportedLanguages: ['en-IN', 'hi-IN'],
    defaultCurrency: 'INR',
    currencySymbol: '₹',
    allowSmsIngestion: true,
    allowGmailIngestion: true,
    supportedAggregators: [], // Add AA (Account Aggregator) later if needed
    instantPaymentSchemes: ['UPI', 'IMPS', 'NEFT', 'RTGS'],
    localP2PKeywords: ['upi', 'vpa', 'paytm', 'gpay', 'phonepe'],
    majorBanks: indiaMajorBanks,
    requireOpenBankingConsent: false, // Not strictly required for SMS/Gmail
  );

  static const RegionProfile unitedStates = RegionProfile(
    countryCode: 'US',
    supportedLanguages: ['en-US'],
    defaultCurrency: 'USD',
    currencySymbol: '\$',
    allowSmsIngestion:
        false, // SMS read not allowed on iOS, limited on Android US
    allowGmailIngestion: true,
    supportedAggregators: ['PLAID'],
    instantPaymentSchemes: ['FedNow', 'RTP', 'Zelle'],
    localP2PKeywords: ['zelle', 'venmo', 'cash app'],
    majorBanks: [
      BankProfile(
        code: 'CHASE',
        display: 'Chase Bank',
        domains: ['chase.com'],
        headerHints: ['chase'],
      ),
      BankProfile(
        code: 'BOA',
        display: 'Bank of America',
        domains: ['bankofamerica.com'],
        headerHints: ['bank of america', 'boa'],
      ),
      BankProfile(
        code: 'WELLS',
        display: 'Wells Fargo',
        domains: ['wellsfargo.com'],
        headerHints: ['wells fargo'],
      ),
      BankProfile(
        code: 'CITI',
        display: 'Citi',
        domains: ['citi.com', 'citibank.com'],
        headerHints: ['citi', 'citibank'],
      ),
    ],
    requireOpenBankingConsent: true,
  );

  static const RegionProfile global = RegionProfile(
    countryCode: 'GLOBAL',
    supportedLanguages: ['en-US'],
    defaultCurrency: 'USD',
    currencySymbol: '\$',
    allowSmsIngestion: false,
    allowGmailIngestion: true,
    supportedAggregators: [],
    instantPaymentSchemes: [],
    localP2PKeywords: [],
    majorBanks: [],
    requireOpenBankingConsent: true,
  );

  static RegionProfile getByCode(String code) {
    switch (code.toUpperCase()) {
      case 'IN':
        return india;
      case 'US':
        return unitedStates;
      default:
        return global;
    }
  }
}
