import 'dart:math';

import '../../../../core/models/reel_model.dart';
import '../ranking_context.dart';
import 'ranking_signal.dart';

/// Overlap between the reel's crop tags and what is in season for the
/// viewer. Requires a `cropTags: []` field on reel docs, which does not
/// exist yet — returns neutral 0.0 until reels carry tags, so this signal
/// costs nothing while dormant.
class SeasonSignal extends RankingSignal {
  const SeasonSignal();

  @override
  String get id => 'season';

  @override
  double score(ReelModel reel, RankingContext ctx, SignalInputs inputs) {
    final cropTags = inputs.cropTags;
    if (cropTags.isEmpty || ctx.seasonalCrops.isEmpty) return 0.0;
    final hits =
        cropTags.where((c) => ctx.seasonalCrops.contains(c.toLowerCase()));
    return hits.isEmpty ? 0.0 : min(1.0, hits.length / 2.0);
  }
}
