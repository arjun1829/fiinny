/// Everything the scorer knows about the viewer. Assembled once per feed load
/// by `data/ranking_context_builder.dart` — signals never fetch this
/// themselves.
class RankingContext {
  final String? viewerPhone;
  final String? city;
  final String? state;
  final String? pincode;

  /// shopOwnerIds the viewer follows — from the `follows` collection.
  final Set<String> followedShopIds;

  /// shopOwnerIds whose reels the viewer has liked before.
  final Set<String> likedShopIds;

  /// shopOwnerIds the viewer has actually purchased from. The strongest
  /// affinity signal we have, because it is money rather than a tap.
  final Set<String> orderedShopIds;

  /// Reel ids already seen, from SharedPreferences 'seen_reels'.
  final Set<String> seenReelIds;

  /// Crops currently in season for the viewer's region. See [cropsInSeason].
  final Set<String> seasonalCrops;

  final DateTime now;

  const RankingContext({
    this.viewerPhone,
    this.city,
    this.state,
    this.pincode,
    this.followedShopIds = const {},
    this.likedShopIds = const {},
    this.orderedShopIds = const {},
    this.seenReelIds = const {},
    this.seasonalCrops = const {},
    required this.now,
  });

  bool get isColdStart =>
      followedShopIds.isEmpty && likedShopIds.isEmpty && orderedShopIds.isEmpty;

  bool get hasLocation =>
      (pincode ?? '').isNotEmpty ||
      (city ?? '').isNotEmpty ||
      (state ?? '').isNotEmpty;
}

/// Minimal seller location, resolved in one batch before ranking so signals
/// stay synchronous, side-effect free, and testable — see
/// `domain/signals/ranking_signal.dart` for why that rule exists.
class SellerLocation {
  final String? city;
  final String? state;
  final String? pincode;
  const SellerLocation({this.city, this.state, this.pincode});
}

/// India's crop calendar, used by `SeasonSignal`. A wheat reel in June is
/// noise; the same reel in November is the most useful thing we can show.
/// Kept as a plain map rather than Firestore config because it changes
/// roughly never.
Set<String> cropsInSeason(DateTime date) {
  final m = date.month;
  if (m >= 6 && m <= 10) {
    // Kharif — sown with the monsoon.
    return const {
      'rice', 'paddy', 'cotton', 'soybean', 'maize', 'bajra',
      'jowar', 'groundnut', 'tur', 'moong',
    };
  }
  if (m >= 11 || m <= 3) {
    // Rabi — winter sown.
    return const {
      'wheat', 'mustard', 'gram', 'chana', 'barley', 'peas',
      'lentil', 'masoor', 'potato', 'onion',
    };
  }
  // Zaid — short summer season.
  return const {'watermelon', 'muskmelon', 'cucumber', 'fodder', 'vegetables'};
}
