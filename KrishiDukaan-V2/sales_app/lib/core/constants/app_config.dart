/// Build-time configuration. Override any value with --dart-define.
class AppConfig {
  AppConfig._();

  /// `--dart-define=APP_FLAVOR=uat` points the app at the karan-arjun-uat
  /// Firebase project and the UAT web host, exactly like the customer app.
  static const isUat = String.fromEnvironment('APP_FLAVOR') == 'uat';

  /// Host that serves /api/directions — the route-distance proxy the web
  /// /sales dashboard already uses (Google Routes API with an OSRM fallback).
  /// Reusing it keeps the Maps billing key server-side instead of shipping a
  /// Routes-enabled key inside the APK.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: isUat
        ? 'https://karan-arjun-uat.web.app'
        : 'https://krishidukan.com',
  );

  /// Maps SDK key — rendering only (also set in AndroidManifest / AppDelegate).
  static const googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  );

  /// Fallback map centre when a session has no usable coordinates (Pune).
  static const defaultLat = 18.5204;
  static const defaultLng = 73.8567;

  static const supportEmail = 'support@krishidukan.com';
  static const supportPhone = '+918658032751';
}
