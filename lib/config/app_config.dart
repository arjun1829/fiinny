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
