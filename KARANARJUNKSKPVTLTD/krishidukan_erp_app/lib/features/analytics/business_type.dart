import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../subscription/subscription_repository.dart';
import 'models.dart';

/// Mirrors the three plan tiers in src/utils/subscriptionPlans.ts
/// (DEFAULT_PLAN_CATALOGUE: 'retailer' | 'distributor' | 'manufacturer').
/// These aren't user roles — they're what KIND of business the whole tenant
/// is, and each tier's own plan description says what its real channel is:
///   - retailer:     "Single-shop POS, billing, khata and inventory for
///                    retail businesses." — POS + online, no B2B. Its plan
///                    does technically include the 'worklist' screen (shared
///                    with the other tiers), so a retailer *can* reach the
///                    B2B invoice form, but that's incidental, not what the
///                    tier is for — showing a B2B tile here would be noise.
///   - distributor:  "B2B wholesale: worklist, dispatch, supplier ledger and
///                    full finance suite." — DISTRIBUTOR_SCREENS is
///                    RETAILER_SCREENS plus the B2B-specific screens
///                    (dashboard, retailers, dispatch, ar/ap/…), so this is
///                    the one tier where all three channels are genuinely
///                    core to the business.
///   - manufacturer: "Production, distributor network, dispatch and finance
///                    operations." — MANUFACTURER_SCREENS excludes 'pos',
///                    'b2c_dashboard', 'online_dashboard' and 'online_orders'
///                    entirely: no shop counter, no storefront, B2B only.
enum TenantBusinessType { retailer, distributor, manufacturer, unknown }

final businessTypeProvider = Provider<TenantBusinessType>((ref) {
  final planId = ref.watch(subscriptionProvider).valueOrNull?.planId;
  return switch (planId) {
    'retailer' => TenantBusinessType.retailer,
    'distributor' => TenantBusinessType.distributor,
    'manufacturer' => TenantBusinessType.manufacturer,
    _ => TenantBusinessType.unknown,
  };
});

/// Channels worth a dedicated tile for the current tenant. This never hides
/// money: a bill that exists still counts in the total and shows up in the
/// bill list regardless of channel — it just doesn't get its own breakdown
/// tile for a channel that isn't this tier's business.
/// Unknown/custom plans fail open (show everything) rather than guess wrong.
final visibleChannelsProvider = Provider<Set<Channel>>((ref) {
  final type = ref.watch(businessTypeProvider);
  return switch (type) {
    TenantBusinessType.retailer => {Channel.b2c, Channel.online},
    TenantBusinessType.manufacturer => {Channel.b2b},
    TenantBusinessType.distributor || TenantBusinessType.unknown => {
        Channel.b2b,
        Channel.b2c,
        Channel.online
      },
  };
});
