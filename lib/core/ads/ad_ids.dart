// lib/core/ads/ad_ids.dart
import 'dart:io';
import 'package:flutter/foundation.dart';

/// Toggle to force TEST ads even in release (handy for QA/internal builds).
const bool forceTestAds = false;

class AdIds {
  // ---------- REAL App IDs ----------
  static const _androidAppIdReal = 'ca-app-pub-5891610127665684~2144640230';
  static const _iosAppIdReal     = 'ca-app-pub-xxxxxxxxxxxxxxxx~zzzzzzzzzz'; // fill later

  // ---------- REAL UNIT IDs (ANDROID) ----------
  static const _androidBannerReal = 'ca-app-pub-5891610127665684/1238736762'; // Dashboard_Banner
  static const _androidInterReal  = 'ca-app-pub-5891610127665684/5161685814'; // TxSuccess_Interstitial
  static const _androidRewardReal = 'ca-app-pub-5891610127665684/6770265044'; // Insights_Rewarded

  // ---------- REAL UNIT IDs (iOS) ----------
  static const _iosBannerReal = 'ca-app-pub-xxxxxxxxxxxxxxxx/dddddddddd'; // fill later
  static const _iosInterReal  = 'ca-app-pub-xxxxxxxxxxxxxxxx/eeeeeeeeee'; // fill later
  static const _iosRewardReal = 'ca-app-pub-xxxxxxxxxxxxxxxx/ffffffffff'; // fill later

  // ---------- Google TEST IDs (keep) ----------
  static const _androidAppIdTest  = 'ca-app-pub-3940256099942544~3347511713';
  static const _iosAppIdTest      = 'ca-app-pub-3940256099942544~1458002511';
  static const _androidBannerTest = 'ca-app-pub-3940256099942544/6300978111';
  static const _iosBannerTest     = 'ca-app-pub-3940256099942544/2934735716';
  static const _androidInterTest  = 'ca-app-pub-3940256099942544/1033173712';
  static const _iosInterTest      = 'ca-app-pub-3940256099942544/4411468910';
  static const _androidRewardTest = 'ca-app-pub-3940256099942544/5224354917';
  static const _iosRewardTest     = 'ca-app-pub-3940256099942544/1712485313';

  // ---------- Switch logic: test in debug, real in release ----------
  static bool get _useReal => kReleaseMode && !forceTestAds;

  static String get appId => Platform.isAndroid
      ? (_useReal ? _androidAppIdReal : _androidAppIdTest)
      : (_useReal ? _iosAppIdReal     : _iosAppIdTest);

  static String get banner => Platform.isAndroid
      ? (_useReal ? _androidBannerReal : _androidBannerTest)
      : (_useReal ? _iosBannerReal     : _iosBannerTest);

  static String get interstitial => Platform.isAndroid
      ? (_useReal ? _androidInterReal : _androidInterTest)
      : (_useReal ? _iosInterReal     : _iosInterTest);

  static String get rewarded => Platform.isAndroid
      ? (_useReal ? _androidRewardReal : _androidRewardTest)
      : (_useReal ? _iosRewardReal     : _iosRewardTest);
}
