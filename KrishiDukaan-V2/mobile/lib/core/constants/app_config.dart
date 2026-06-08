class AppConfig {
  AppConfig._();

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://krishidukan.com',
  );

  // Razorpay test key — swap with live key via --dart-define in release build
  static const razorpayKeyId = String.fromEnvironment(
    'RAZORPAY_KEY_ID',
    defaultValue: 'rzp_test_SmPxtEcNJ25LUj',
  );

  // Default location: Pune, Maharashtra (used when GPS unavailable)
  static const defaultLat = 18.5204;
  static const defaultLng = 73.8567;

  static const firestorePageSize = 20;
}
