import 'dart:math';

import '../../../../core/models/reel_model.dart';
import '../ranking_context.dart';
import 'ranking_signal.dart';

/// Engagement **rate**, not raw counts.
///
/// Ranking on `likesCount` alone is a rich-get-richer trap: reels that got an
/// early boost keep winning and new sellers never surface. Dividing by views
/// measures whether people who saw it actually responded. The +50 floor stops
/// a reel with 2 views and 1 like from scoring a perfect 1.0.
class EngagementSignal extends RankingSignal {
  const EngagementSignal();

  @override
  String get id => 'engagement';

  @override
  double score(ReelModel reel, RankingContext ctx, SignalInputs inputs) {
    final weighted = reel.likesCount + (reel.commentsCount * 3);
    final denom = max(reel.viewsCount, 50);
    return (weighted / denom).clamp(0.0, 1.0);
  }
}
