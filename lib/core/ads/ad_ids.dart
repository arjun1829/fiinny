// lib/core/ads/ad_ids.dart
// import 'dart:io';
import 'package:flutter/foundation.dart';

/// Toggle to force TEST ads even in release (handy for QA/internal builds).
/// Use: --dart-define=FORCE_TEST_ADS=true
const bool forceTestAds =
    bool.fromEnvironment('FORCE_TEST_ADS', defaultValue: false);

class AdIds {
  // ---------- REAL App IDs ----------
  // ---------- REAL App IDs ----------
  static const _androidAppIdReal = 'ca-app-pub-3087779657197986~6549865319';
  static const _iosAppIdReal = 'ca-app-pub-3087779657197986~5816186389';

  // ---------- REAL UNIT IDs (ANDROID) ----------
  static const _androidBannerReal = 'ca-app-pub-3087779657197986/1206857538';
  static const _androidInterReal = 'ca-app-pub-3087779657197986/8573393427';
  static const _androidNativeReal = 'ca-app-pub-3087779657197986/4168896940';
  static const _androidRewardReal = ''; // None provided in new set

  // ---------- REAL UNIT IDs (iOS) ----------
  static const _iosBannerReal = 'ca-app-pub-3087779657197986/2308202123';
  static const _iosInterReal = 'ca-app-pub-3087779657197986/9231868975';
  static const _iosNativeReal = 'ca-app-pub-3087779657197986/2060790116';
  static const _iosRewardReal = ''; // None provided in new set

  // ---------- Google TEST IDs ----------
  static const _androidAppIdTest = 'ca-app-pub-3940256099942544~3347511713';
  static const _iosAppIdTest = 'ca-app-pub-3940256099942544~1458002511';
  static const _androidBannerTest = 'ca-app-pub-3940256099942544/6300978111';
  static const _iosBannerTest = 'ca-app-pub-3940256099942544/2934735716';
  static const _androidInterTest = 'ca-app-pub-3940256099942544/1033173712';
  static const _iosInterTest = 'ca-app-pub-3940256099942544/4411468910';
  static const _androidNativeTest =
      'ca-app-pub-3940256099942544/2247696110'; // Standard Test Native Advanced
  static const _androidRewardTest = 'ca-app-pub-3940256099942544/5224354917';
  static const _iosRewardTest = 'ca-app-pub-3940256099942544/1712485313';

  // ---------- Switch logic: prefer real identifiers whenever configured ----------
  static bool get _useReal {
    // Always try to use real IDs first for "original ads"
    if (_hasRealIdsForCurrentPlatform) return true;
    return false;
  }

  /// Whether production AdMob identifiers are present for the current platform.
  static bool get hasRealIdsForCurrentPlatform => _hasRealIdsForCurrentPlatform;

  /// True when the runtime is falling back to Google's public test identifiers.
  static bool get isUsingTestIds => !_useReal;

  static bool get _hasRealIdsForCurrentPlatform {
    if (kIsWeb) return false;
    if (defaultTargetPlatform == TargetPlatform.android) {
      return _looksConfigured(_androidAppIdReal, isAppId: true) &&
          _looksConfigured(_androidBannerReal) &&
          _looksConfigured(_androidInterReal) &&
          _looksConfigured(_androidNativeReal);
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return _looksConfigured(_iosAppIdReal, isAppId: true) &&
          _looksConfigured(_iosBannerReal) &&
          _looksConfigured(_iosInterReal) &&
          _looksConfigured(_iosNativeReal);
    }
    return false;
  }

  static bool _looksConfigured(String value, {bool isAppId = false}) {
    if (value.isEmpty) return false;
    if (value.contains('xxxx') ||
        value.contains('zzzz') ||
        value.contains('fill')) {
      return false;
    }
    final pattern = isAppId
        ? RegExp(r'^ca-app-pub-\d{16}~\d{10}$')
        : RegExp(r'^ca-app-pub-\d{16}/\d{10}$');
    return pattern.hasMatch(value);
  }

  static String get appId => kIsWeb
      ? ''
      : (defaultTargetPlatform == TargetPlatform.android
          ? (_useReal ? _androidAppIdReal : _androidAppIdTest)
          : (_useReal ? _iosAppIdReal : _iosAppIdTest));

  static String get banner => kIsWeb
      ? ''
      : (defaultTargetPlatform == TargetPlatform.android
          ? (_useReal ? _androidBannerReal : _androidBannerTest)
          : (_useReal ? _iosBannerReal : _iosBannerTest));

  static String get interstitial => kIsWeb
      ? ''
      : (defaultTargetPlatform == TargetPlatform.android
          ? (_useReal ? _androidInterReal : _androidInterTest)
          : (_useReal ? _iosInterReal : _iosInterTest));

  static String get native => kIsWeb
      ? ''
      : (defaultTargetPlatform == TargetPlatform.android
          ? (_useReal ? _androidNativeReal : _androidNativeTest)
          : (_useReal
              ? _iosNativeReal
              : '')); // No iOS Test Native ID defined/needed yet

  static String get rewarded => kIsWeb
      ? ''
      : (defaultTargetPlatform == TargetPlatform.android
          ? (_useReal ? _androidRewardReal : _androidRewardTest)
          : (_useReal ? _iosRewardReal : _iosRewardTest));
}
