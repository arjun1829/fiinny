// lib/core/ads/ad_service.dart
import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'ad_ids.dart';

const bool kDiagBuild = bool.fromEnvironment('DIAG_BUILD', defaultValue: true);

/// Simple, session-only caps (no SharedPreferences).
class AdService {
  AdService._();
  static final AdService I = AdService._();

  InterstitialAd? _inter;
  RewardedAd? _rewarded;

  DateTime _lastInterShown = DateTime.fromMillisecondsSinceEpoch(0);
  int _actionsSinceInter = 0;

  bool _adsEnabled = false;
  Future<void>? _inFlightInit;

  bool get isEnabled => _adsEnabled;

  Future<void> init() {
    if (_adsEnabled) {
      return SynchronousFuture<void>(null);
    }

    final pending = _inFlightInit;
    if (pending != null) {
      return pending;
    }

    final future = _initializeInternal();
    _inFlightInit = future;

    return future.whenComplete(() {
      if (identical(_inFlightInit, future)) {
        _inFlightInit = null;
      }
    });
  }

  static Future<void> initLater() async {
    if (kDiagBuild && Platform.isIOS) {
      debugPrint('[AdService] Skipping ads init for diagnostic iOS build.');
      return;
    }

    await AdService.I.init();
  }

  Future<void> _initializeInternal() async {
    if (!_shouldEnableAds()) {
      _adsEnabled = false;
      return;
    }

    try {
      await MobileAds.instance.initialize();

      await MobileAds.instance.updateRequestConfiguration(
        RequestConfiguration(
          testDeviceIds: const <String>[],
        ),
      );

      _adsEnabled = true;

      preloadInterstitial();
      preloadRewarded();
    } catch (err, stackTrace) {
      _adsEnabled = false;
      debugPrint('[AdService] Google Mobile Ads init failed: $err\n$stackTrace');
    }
  }

  bool _shouldEnableAds() {
    if (kIsWeb) return false;
    if (!(Platform.isAndroid || Platform.isIOS)) return false;

    if (!AdIds.hasRealIdsForCurrentPlatform) {
      if (kReleaseMode && !forceTestAds) {
        debugPrint(
          '[AdService] Skipping Google Mobile Ads init on '
          '${Platform.operatingSystem} – real AdMob IDs are not configured.',
        );
        return false;
      }

      if (Platform.isIOS && AdIds.isUsingTestIds) {
        debugPrint('[AdService] Using Google test ads on iOS.');
      }
    }

    return true;
  }

  // ---------- Preload ----------
  void preloadInterstitial() {
    if (!_adsEnabled) return;
    if (_inter != null) return;
    InterstitialAd.load(
      adUnitId: AdIds.interstitial,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          // Set full screen callbacks once
          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdShowedFullScreenContent: (ad) {},
            onAdDismissedFullScreenContent: (ad) {
              ad.dispose();
              _inter = null;
              // Prepare the next one
              preloadInterstitial();
            },
            onAdFailedToShowFullScreenContent: (ad, err) {
              ad.dispose();
              _inter = null;
              preloadInterstitial();
            },
            onAdImpression: (ad) {},
            onAdClicked: (ad) {},
          );
          _inter = ad;
        },
        onAdFailedToLoad: (err) {
          _inter = null;
          // Optional: backoff/retry later; for now, a simple lazy retry next call
        },
      ),
    );
  }

  void preloadRewarded() {
    if (!_adsEnabled) return;
    if (_rewarded != null) return;
    RewardedAd.load(
      adUnitId: AdIds.rewarded,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdShowedFullScreenContent: (ad) {},
            onAdDismissedFullScreenContent: (ad) {
              ad.dispose();
              _rewarded = null;
              preloadRewarded();
            },
            onAdFailedToShowFullScreenContent: (ad, err) {
              ad.dispose();
              _rewarded = null;
              preloadRewarded();
            },
            onAdImpression: (ad) {},
            onAdClicked: (ad) {},
          );
          _rewarded = ad;
        },
        onAdFailedToLoad: (err) {
          _rewarded = null;
        },
      ),
    );
  }

  // ---------- Interstitial logic ----------
  Future<void> maybeShowInterstitial({
    int minActions = 6,
    Duration minGap = const Duration(minutes: 2),
  }) async {
    if (!_adsEnabled) return;
    _actionsSinceInter++;
    final now = DateTime.now();

    final allowed = _actionsSinceInter >= minActions &&
        now.difference(_lastInterShown) >= minGap &&
        _inter != null;

    if (!allowed) return;

    final ad = _inter!;
    _inter = null; // prevent double-show
    await ad.show(); // callbacks handle dispose + preload
    _lastInterShown = now;
    _actionsSinceInter = 0;
  }

  // ---------- Rewarded logic ----------
  // Keep signature (int,String) to avoid breaking callers.
  Future<bool> showRewarded({required void Function(int, String) onReward}) async {
    if (!_adsEnabled) return false;
    final ad = _rewarded;
    if (ad == null) {
      preloadRewarded();
      return false;
    }

    _rewarded = null; // prevent double-show
    bool granted = false;

    await ad.show(onUserEarnedReward: (ad, rewardItem) {
      granted = true;
      // reward.amount is num; cast to int to match existing signature
      onReward(rewardItem.amount.toInt(), rewardItem.type);
    });

    // Dispose handled by fullScreenContentCallback; ensure next preload
    return granted;
  }
}
