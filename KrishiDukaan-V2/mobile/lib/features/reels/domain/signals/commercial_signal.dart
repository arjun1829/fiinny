import '../../../../core/models/reel_model.dart';
import '../ranking_context.dart';
import 'ranking_signal.dart';

/// Commercial intent — does this reel lead anywhere purchasable?
///
/// A reel with a linked product is the whole point of the feature, so it
/// earns a real boost. [SignalInputs.productNearViewer] should be true when
/// the linked product has an availability entry from a seller in the
/// viewer's state; wire it once the availability lookup is cheap, and it
/// stays false until then.
class CommercialSignal extends RankingSignal {
  const CommercialSignal();

  @override
  String get id => 'commercial';

  @override
  double score(ReelModel reel, RankingContext ctx, SignalInputs inputs) {
    if (reel.linkedProductId == null || reel.linkedProductId!.isEmpty) {
      return 0.0;
    }
    return inputs.productNearViewer ? 1.0 : 0.6;
  }
}
