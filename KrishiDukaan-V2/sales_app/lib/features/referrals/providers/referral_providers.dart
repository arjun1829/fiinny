import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/plan_ladder.dart';
import '../data/referral_repository.dart';

final referralRepositoryProvider = Provider((_) => ReferralRepository());

/// The signed-in rep's referral codes with their stats.
final myReferralCodesProvider =
    FutureProvider.autoDispose<List<MyReferralCode>>(
      (ref) => ref.watch(referralRepositoryProvider).fetchMine(),
    );

/// Plans currently on sale — the only things an offer link may contain.
final offerPlansProvider = FutureProvider.autoDispose<List<SubscriptionPlan>>(
  (ref) => ref.watch(referralRepositoryProvider).fetchPlans(),
);
