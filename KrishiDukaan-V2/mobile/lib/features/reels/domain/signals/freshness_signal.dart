import 'dart:math';

import '../../../../core/models/reel_model.dart';
import '../ranking_context.dart';
import 'ranking_signal.dart';

/// Exponential recency decay with a ~7 day half-life.
class FreshnessSignal extends RankingSignal {
  const FreshnessSignal();

  @override
  String get id => 'freshness';

  @override
  double score(ReelModel reel, RankingContext ctx, SignalInputs inputs) {
    final ageDays = ctx.now.difference(reel.createdAt).inHours / 24.0;
    if (ageDays < 0) return 1.0;
    return exp(-ageDays / 7.0);
  }
}
