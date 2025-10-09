// lib/core/ads/ad_service.dart
import 'dart:async';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'ad_ids.dart';

/// Simple, session-only caps (no SharedPreferences).
class AdService {
  AdService._();
  static final AdService I = AdService._();

  InterstitialAd? _inter;
  RewardedAd? _rewarded;

  DateTime _lastInterShown = DateTime.fromMillisecondsSinceEpoch(0);
  int _actionsSinceInter = 0;

  Future<void> init() async {
    await MobileAds.instance.initialize();

    // Not const (avoids "const constructor" error)
    await MobileAds.instance.updateRequestConfiguration(
      RequestConfiguration(
        testDeviceIds: const <String>[], // add your device id(s) if needed
      ),
    );

    preloadInterstitial();
    preloadRewarded();
  }

  // ---------- Preload ----------
  void preloadInterstitial() {
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
