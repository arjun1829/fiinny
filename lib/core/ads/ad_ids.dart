// lib/core/ads/ad_ids.dart
import 'dart:io';
import 'package:flutter/foundation.dart';

/// Toggle to force TEST ads even in release (handy for QA/internal builds).
/// Use: --dart-define=FORCE_TEST_ADS=true
const bool forceTestAds =
    bool.fromEnvironment('FORCE_TEST_ADS', defaultValue: false);

class AdIds {
  // ---------- REAL App IDs ----------
  static const _androidAppIdReal = 'ca-app-pub-5891610127665684~7171759721';
  static const _iosAppIdReal     = 'ca-app-pub-5891610127665684~2144640230';

  // ---------- REAL UNIT IDs (ANDROID) ----------
  static const _androidBannerReal = 'ca-app-pub-5891610127665684/1649712954'; // Dashboard_Banner
  static const _androidInterReal  = 'ca-app-pub-5891610127665684/1651774466'; // TxSuccess_Interstitial
  static const _androidRewardReal = 'ca-app-pub-5891610127665684/8515531876'; // Insights_Rewarded

  // ---------- REAL UNIT IDs (iOS) ----------
  static const _iosBannerReal = 'ca-app-pub-5891610127665684/1238736762'; // Dashboard_Banner
  static const _iosInterReal  = 'ca-app-pub-5891610127665684/5161685814'; // TxSuccess_Interstitial
  static const _iosRewardReal = 'ca-app-pub-5891610127665684/6770265044'; // Insights_Rewarded

  // ---------- Google TEST IDs ----------
  static const _androidAppIdTest  = 'ca-app-pub-3940256099942544~3347511713';
  static const _iosAppIdTest      = 'ca-app-pub-3940256099942544~1458002511';
  static const _androidBannerTest = 'ca-app-pub-3940256099942544/6300978111';
  static const _iosBannerTest     = 'ca-app-pub-3940256099942544/2934735716';
  static const _androidInterTest  = 'ca-app-pub-3940256099942544/1033173712';
  static const _iosInterTest      = 'ca-app-pub-3940256099942544/4411468910';
  static const _androidRewardTest = 'ca-app-pub-3940256099942544/5224354917';
  static const _iosRewardTest     = 'ca-app-pub-3940256099942544/1712485313';

  // ---------- Switch logic: test in debug, real in release ----------
  static bool get _useReal =>
      kReleaseMode && !forceTestAds && _hasRealIdsForCurrentPlatform;

  /// Whether production AdMob identifiers are present for the current platform.
  static bool get hasRealIdsForCurrentPlatform => _hasRealIdsForCurrentPlatform;

  /// True when the runtime is falling back to Google's public test identifiers.
  static bool get isUsingTestIds => !_useReal;

  static bool get _hasRealIdsForCurrentPlatform {
    if (Platform.isAndroid) {
      return _looksConfigured(_androidAppIdReal, isAppId: true) &&
          _looksConfigured(_androidBannerReal) &&
          _looksConfigured(_androidInterReal) &&
          _looksConfigured(_androidRewardReal);
    }
    if (Platform.isIOS) {
      return _looksConfigured(_iosAppIdReal, isAppId: true) &&
          _looksConfigured(_iosBannerReal) &&
          _looksConfigured(_iosInterReal) &&
          _looksConfigured(_iosRewardReal);
    }
    return false;
  }

  static bool _looksConfigured(String value, {bool isAppId = false}) {
    if (value.isEmpty) return false;
    if (value.contains('xxxx') || value.contains('zzzz') || value.contains('fill')) return false;
    final pattern = isAppId
        ? RegExp(r'^ca-app-pub-\d{16}~\d{10}$')
        : RegExp(r'^ca-app-pub-\d{16}/\d{10}$');
    return pattern.hasMatch(value);
  }

  static String get appId => Platform.isAndroid
      ? (_useReal ? _androidAppIdReal : _androidAppIdTest)
      : (_useReal ? _iosAppIdReal : _iosAppIdTest);

  static String get banner => Platform.isAndroid
      ? (_useReal ? _androidBannerReal : _androidBannerTest)
      : (_useReal ? _iosBannerReal : _iosBannerTest);

  static String get interstitial => Platform.isAndroid
      ? (_useReal ? _androidInterReal : _androidInterTest)
      : (_useReal ? _iosInterReal : _iosInterTest);

  static String get rewarded => Platform.isAndroid
      ? (_useReal ? _androidRewardReal : _androidRewardTest)
      : (_useReal ? _iosRewardReal : _iosRewardTest);
}
