import '../../../../core/models/reel_model.dart';
import '../ranking_context.dart';
import 'ranking_signal.dart';

/// Geographic relevance — the heaviest signal in `RankingWeights.standard`.
///
/// Uses the seller-profile fields already on `users/{phone}` (city/state/
/// pincode) rather than lat/lng, because reels carry no coordinates today and
/// most seller profiles have a city string but no GPS fix. Pincode prefix
/// matching approximates district proximity cheaply: the first 3 digits of an
/// Indian PIN share a sorting district.
class GeoSignal extends RankingSignal {
  const GeoSignal();

  @override
  String get id => 'geo';

  @override
  double score(ReelModel reel, RankingContext ctx, SignalInputs inputs) {
    final seller = inputs.sellerLocation;
    if (seller == null || !ctx.hasLocation) return 0.35; // unknown — stay neutral

    final vPin = ctx.pincode ?? '';
    final sPin = seller.pincode ?? '';
    if (vPin.isNotEmpty && vPin == sPin) return 1.0;

    if (vPin.length >= 3 &&
        sPin.length >= 3 &&
        vPin.substring(0, 3) == sPin.substring(0, 3)) {
      return 0.85;
    }

    final vCity = (ctx.city ?? '').toLowerCase().trim();
    final sCity = (seller.city ?? '').toLowerCase().trim();
    if (vCity.isNotEmpty && vCity == sCity) return 0.75;

    final vState = (ctx.state ?? '').toLowerCase().trim();
    final sState = (seller.state ?? '').toLowerCase().trim();
    if (vState.isNotEmpty && vState == sState) return 0.40;

    return 0.10; // different state — rarely actionable for a farmer
  }
}
