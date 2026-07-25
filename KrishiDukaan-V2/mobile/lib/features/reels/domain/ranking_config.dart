import 'signals/affinity_signal.dart';
import 'signals/commercial_signal.dart';
import 'signals/engagement_signal.dart';
import 'signals/freshness_signal.dart';
import 'signals/geo_signal.dart';
import 'signals/ranking_signal.dart';
import 'signals/season_signal.dart';

/// Signal weights, keyed by [RankingSignal.id] so Remote Config can ship a
/// flat `{"geo": 0.30, ...}` map straight into this constructor with no
/// client-side reshaping. Unknown ids score 0 rather than throwing, so a
/// weights payload that lags one app version behind a new signal degrades
/// gracefully instead of crashing the feed.
class RankingWeights {
  final Map<String, double> _byId;
  const RankingWeights(this._byId);

  double operator [](String signalId) => _byId[signalId] ?? 0.0;

  static const standard = RankingWeights({
    'geo': 0.30,
    'freshness': 0.20,
    'affinity': 0.20,
    'engagement': 0.15,
    'commercial': 0.10,
    'season': 0.05,
  });

  /// Weighting for a brand-new user we know nothing about: lean hard on
  /// locality and recency, since affinity signals are all empty anyway.
  static const coldStart = RankingWeights({
    'geo': 0.40,
    'freshness': 0.30,
    'affinity': 0.0,
    'engagement': 0.20,
    'commercial': 0.10,
    'season': 0.0,
  });
}

/// Every signal the ranker scores with.
///
/// **To add a new ranking idea:** write a class implementing [RankingSignal]
/// under `signals/`, add an instance here, and give it a weight in
/// [RankingWeights] above (and in [RankingWeights.coldStart] if it needs
/// viewer history to mean anything). Nothing in `domain/reel_ranker.dart` or
/// the providers that call it needs to change.
const List<RankingSignal> rankingSignals = [
  GeoSignal(),
  FreshnessSignal(),
  EngagementSignal(),
  AffinitySignal(),
  CommercialSignal(),
  SeasonSignal(),
];
