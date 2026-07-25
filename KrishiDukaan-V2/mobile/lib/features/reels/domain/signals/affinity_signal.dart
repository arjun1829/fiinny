import '../../../../core/models/reel_model.dart';
import '../ranking_context.dart';
import 'ranking_signal.dart';

/// How connected the viewer already is to this seller.
class AffinitySignal extends RankingSignal {
  const AffinitySignal();

  @override
  String get id => 'affinity';

  @override
  double score(ReelModel reel, RankingContext ctx, SignalInputs inputs) {
    final shop = reel.shopOwnerId;
    if (ctx.orderedShopIds.contains(shop)) return 1.0; // bought from them
    if (ctx.followedShopIds.contains(shop)) return 0.85; // explicit follow
    if (ctx.likedShopIds.contains(shop)) return 0.55; // liked their content
    return 0.0;
  }
}
