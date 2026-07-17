class AppConfig {
  AppConfig._();

  // Defaults to production so payments work out of the box on devices —
  // localhost on a phone/emulator points at the device itself, which silently
  // breaks every payment call. Override for local dev:
  //   flutter run --dart-define=API_BASE_URL=http://localhost:3001
  static const _isUat = String.fromEnvironment('APP_FLAVOR') == 'uat';

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: _isUat ? 'https://karan-arjun-uat.web.app' : 'https://krishidukan.com',
  );

  // Razorpay test key — swap with live key via --dart-define in release build
  static const razorpayKeyId = String.fromEnvironment(
    'RAZORPAY_KEY_ID',
    defaultValue: 'rzp_test_SmPxtEcNJ25LUj',
  );

  static const googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
    defaultValue: 'AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778',
  );

  // Default location: Pune, Maharashtra (used when GPS unavailable)
  static const defaultLat = 18.5204;
  static const defaultLng = 73.8567;

  static const firestorePageSize = 20;

  // Customer support contact channels (shared with the website).
  static const supportEmail = 'support@krishidukan.com';
  static const supportPhone = '+918658032751';
  // Digits only (no '+') for the WhatsApp deep link.
  static const supportWhatsApp = '918658032751';
}
