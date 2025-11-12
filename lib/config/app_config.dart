// lib/config/app_config.dart
class AppConfig {
  /// Base URL of your Cloudflare Worker `/quotes` endpoint.
  /// You can override this at build time with --dart-define.
  static const quotesBaseUrl = String.fromEnvironment(
    'QUOTES_BASE_URL',
    defaultValue: 'https://fiinny-proxy.fiinny-tools.workers.dev/quotes',
  );

  /// Network timeouts (ms) – tweak as you like.
  static const connectTimeoutMs = 6000;
  static const receiveTimeoutMs = 8000;
}

class AiConfig {
  /// Cloud Run base URL for the AI proxy
  static const String baseUrl =
      'https://ai-proxy-1085936196639.asia-south1.run.app';

  /// Must match INTERNAL_API_KEY on Cloud Run / in your .env
  static const String apiKey = 'fiinny-local-dev-secret';

  /// Global kill-switch for LLM usage (rules still run either way)
  static const bool llmOn = true;

  /// Toggle if you schedule weekly insights via cron later
  static const bool weeklyBatchOn = true;

  /// If rules confidence is below this, we call the LLM fallback
  static const double confThresh = 0.70;

  /// Extra guard to ensure we always send minimal/redacted fields
  static const bool redactionOn = true;

  /// Optional: HTTP timeouts (ms)
  static const int connectTimeoutMs = 8000;
  static const int readTimeoutMs = 15000;
}
