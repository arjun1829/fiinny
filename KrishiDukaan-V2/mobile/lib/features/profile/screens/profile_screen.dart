import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/app_info_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/models/staff_session.dart';
import '../../../core/models/user_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../dashboard/providers/dashboard_provider.dart';
import '../../dashboard/widgets/dashboard_drawer.dart';
import '../../dashboard/widgets/dashboard_overview_widgets.dart';
import '../../manufacturer/providers/manufacturer_provider.dart';
import '../../marketplace/providers/marketplace_provider.dart';
import '../widgets/delete_account_dialog.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    // The shop this screen shows: the user's own, or — for a shop helper —
    // the owner's shop with the helper's permissions (sellerUserProvider).
    final shop = ref.watch(sellerUserProvider).value;
    final locale = ref.watch(localeProvider);
    final isHindi = locale.languageCode == 'hi';
    // isSeller is only known once userAsync resolves; the hamburger/drawer
    // simply don't render on the first loading frame, same as every other
    // seller-only section on this screen.
    final isSeller = shop?.isSeller ?? false;

    return Scaffold(
      backgroundColor: AppColors.background,
      // Navigate section (see DashboardDrawer) — same 11 destinations as
      // web's persistent dashboard sidebar, opened via the menu icon below
      // instead of requiring a separate trip to the standalone Dashboard.
      drawer: isSeller ? const DashboardDrawer() : null,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.onSurface,
        systemOverlayStyle: topBarOverlayStyle,
        flexibleSpace: const TopBarBackdrop(),
        titleSpacing: 16,
        title: Row(
          children: [
            const AppBrandIcon(size: 30),
            const SizedBox(width: 10),
            Text(
              isHindi ? 'प्रोफ़ाइल' : 'Profile',
              style: AppTextStyles.heading2.copyWith(
                  color: AppColors.onSurface,
                  fontSize: 18,
                  fontWeight: FontWeight.w800),
            ),
          ],
        ),
        // Explicit "go home" rather than a plain pop: Profile can be reached
        // through nested pushes (e.g. Profile → Dashboard → back to Profile
        // via the person icon), where a plain back arrow would only bounce
        // to whatever screen happens to be underneath (Dashboard) instead of
        // actually leaving the account area. go('/') always exits cleanly to
        // Home no matter how Profile was reached.
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        actions: [
          if (isSeller)
            Builder(
              builder: (context) => IconButton(
                icon: const Icon(Icons.menu),
                tooltip: isHindi ? 'डैशबोर्ड मेनू' : 'Dashboard menu',
                onPressed: () => Scaffold.of(context).openDrawer(),
              ),
            ),
        ],
      ),
      body: userAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('Failed to load profile.')),
        data: (user) {
          if (user == null) {
            return _GuestView(isHindi: isHindi);
          }
          return _ProfileBody(
            user: user,
            shop: (shop != null && shop.isSeller) ? shop : null,
            staffSession: ref.watch(staffSessionProvider).value,
            isHindi: isHindi,
            locale: locale,
          );
        },
      ),
    );
  }
}

/// "Add Product" quick action, next to "Add Reel" — one of the most frequent
/// actions for manufacturers, so it's surfaced on Profile itself rather than
/// requiring a detour through the dashboard first. Reuses the exact same
/// gating logic as the Quick Actions card's "Add product" row
/// (`goToAddProduct`), so there's only one paywall flow/copy in the app.
class _AddProductButton extends StatelessWidget {
  final dynamic user;
  const _AddProductButton({required this.user});

  @override
  Widget build(BuildContext context) {
    return _ProfileActionButton(
      icon: Icons.add_box_outlined,
      label: 'Add Product',
      filled: true,
      onTap: () => goToAddProduct(
        context,
        canAccessDashboard: user.canAccessDashboard == true,
        isManufacturer: user.isManufacturer == true,
      ),
    );
  }
}

/// "Add Reel" quick action — same placement/style as Add Product. No paywall
/// gate: matches the existing /reels/upload route today, which has no
/// subscription/role guard anywhere. Icon matches the one every other
/// "post a reel" entry point in the app already uses (shop_profile_screen.dart,
/// reels_feed_screen.dart) — `video_call_outlined` isn't in the bundled icon
/// font subset and rendered blank, which is why the button looked missing.
class _AddReelButton extends StatelessWidget {
  const _AddReelButton();

  @override
  Widget build(BuildContext context) {
    return _ProfileActionButton(
      icon: Icons.video_call_rounded,
      label: 'Add Reel',
      filled: false,
      onTap: () => context.push('/reels/upload'),
    );
  }
}

class _ProfileActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool filled;
  final VoidCallback onTap;
  const _ProfileActionButton({
    required this.icon,
    required this.label,
    required this.filled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: TextButton.icon(
        onPressed: onTap,
        style: TextButton.styleFrom(
          backgroundColor: filled ? AppColors.primary : Colors.white,
          foregroundColor: filled ? Colors.white : AppColors.primary,
          padding: const EdgeInsets.symmetric(vertical: 12),
          side: filled ? null : const BorderSide(color: AppColors.primary),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        icon: Icon(icon, size: 18),
        label: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ),
    );
  }
}

class _ProfileBody extends ConsumerWidget {
  final dynamic user;
  /// The shop the seller sections below show — the user's own, or the one a
  /// helper manages. Null for buyers.
  final UserModel? shop;
  /// A helper's access, including a paused one or an unpaid shop (shop is
  /// null then, and a notice explains why).
  final StaffSession? staffSession;
  final bool isHindi;
  final dynamic locale;
  const _ProfileBody({
    required this.user,
    required this.shop,
    required this.staffSession,
    required this.isHindi,
    required this.locale,
  });

  String _roleLabel(String role, bool hindi) {
    switch (role) {
      case 'manufacturer':
        return hindi ? 'निर्माता' : 'Manufacturer';
      case 'retailer':
        return hindi ? 'खुदरा विक्रेता' : 'Retailer';
      default:
        return hindi ? 'उपभोक्ता' : 'Consumer';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shop = this.shop;
    final bool seller = shop != null;
    final String phone = shop?.phone ?? (user.phone as String);
    final staff = shop?.staff;
    bool can(String p) => shop?.staffCan(p) ?? false;
    final bool isManufacturer = seller
        ? ref.watch(isManufacturerProvider)
        : false;
    // Only fetched for sellers — these streams/futures are cheap no-ops for
    // everyone else since the providers are never watched in that case.
    final listingsAsync =
        seller ? ref.watch(myListingsProvider(phone)) : null;
    // Seats are the owner's plan — not shown to helpers.
    final seatsAsync =
        seller && staff == null ? ref.watch(seatStatsProvider(phone)) : null;
    final analyticsAsync = seller && isManufacturer
        ? ref.watch(manufacturerAnalyticsProvider(phone))
        : null;
    final reviewsAsync =
        seller ? ref.watch(storeReviewsProvider(phone)) : null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Avatar + name
        Center(
          child: Column(
            children: [
              const SizedBox(height: 8),
              _ProfileAvatar(user: user),
              const SizedBox(height: 12),
              Text(
                user.name,
                style: AppTextStyles.heading2,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _roleLabel(user.role, isHindi),
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // A shop helper: whose shop, and what they may do — or why not.
        if (staff != null)
          _StaffNotice(
            title: isHindi ? '${staff.ownerName} संभाल रहे हैं' : 'Managing ${staff.ownerName}',
            body: (isHindi ? 'सहायक के रूप में · ' : 'As a helper · ') +
                staff.permissions.map((p) => staffPermissionLabels[p] ?? p).join(' · '),
          )
        else if (staffSession != null && !staffSession!.isActive)
          _StaffNotice(
            title: staffSession!.ownerName,
            body: staffSession!.isPaused
                ? (isHindi
                    ? 'दुकान मालिक ने आपकी पहुंच रोक दी है।'
                    : 'The shop owner has paused your helper access.')
                : (isHindi
                    ? 'मालिक के प्लान रिन्यू करने पर डैशबोर्ड फिर खुलेगा।'
                    : "The shop's KrishiDukan plan isn't active. The dashboard opens again once the owner renews."),
            warning: true,
          ),

        // Add Product / Add Reel — right under the avatar/logo.
        if (seller && (can('products') || can('reels'))) ...[
          Row(
            children: [
              if (can('products')) _AddProductButton(user: shop),
              if (can('products') && can('reels')) const SizedBox(width: 10),
              if (can('reels')) const _AddReelButton(),
            ],
          ),
          const SizedBox(height: 10),
          // My Shop — the public storefront preview (reels + listed
          // products), previously buried two taps deep inside Business
          // Settings. Important enough to surface right here instead.
          InkWell(
            onTap: () => context.push('/shop/${shop.phone}'),
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.15)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.storefront_outlined,
                      size: 20, color: AppColors.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('My Shop',
                        style: AppTextStyles.bodyMedium
                            .copyWith(fontWeight: FontWeight.w700, color: AppColors.primary)),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: AppColors.primary),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
        ] else if (seller) ...[
          // A helper without Products/Reels still opens the shop page.
          InkWell(
            onTap: () => context.push('/shop/${shop.phone}'),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('My Shop',
                  style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.w700, color: AppColors.primary)),
            ),
          ),
          const SizedBox(height: 16),
        ] else
          const SizedBox(height: 8),

        // Prompt to finish profile when key fields are missing.
        if (!user.isProfileComplete) ...[
          InkWell(
            onTap: () => context.push('/profile/edit'),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.secondaryContainer.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.secondary.withValues(alpha: 0.4),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.secondary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      isHindi
                          ? 'अपनी प्रोफ़ाइल पूरी करें (नाम, पता${user.isSeller ? ', दुकान का नाम' : ''})'
                          : 'Complete your profile (name, address${user.isSeller ? ', shop name' : ''})',
                      style: AppTextStyles.bodySmall,
                    ),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: AppColors.onSurfaceVariant),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        // Everything below mirrors web's dashboard overview
        // (krishidukan.com/dashboard) card-for-card, shown directly on
        // Profile so sellers never have to leave this tab to check their
        // numbers or act on them. Read-only stats are shown for paid and
        // unpaid sellers alike; the full nav hub lives in the drawer (tap
        // the menu icon in the AppBar) instead of an inline link list.
        if (seller) ...[
          QuickActionsCard(
            isManufacturer: isManufacturer,
            canAccessDashboard: shop.canAccessDashboard,
            can: can,
          ),
          const SizedBox(height: 16),

          Text('Overview', style: AppTextStyles.heading3),
          Text('Performance snapshot for your storefront and operations.',
              style: AppTextStyles.caption),
          const SizedBox(height: 12),
          OverviewGrid(
            listingsAsync: listingsAsync!,
            analyticsAsync: analyticsAsync,
            isManufacturer: isManufacturer,
          ),
          const SizedBox(height: 16),

          listingsAsync.when(
            loading: () => const CardShimmer(height: 160),
            error: (_, _) => const SizedBox.shrink(),
            data: (listings) => InventoryHealthCard(
              listings: listings.cast(),
              onManageInventory: () => context.push(isManufacturer
                  ? '/dashboard/manufacturer/catalog'
                  : '/dashboard/inventory'),
            ),
          ),
          const SizedBox(height: 12),

          if (seatsAsync != null) ...[
            seatsAsync.when(
              loading: () => const CardShimmer(height: 90),
              error: (_, _) => const SizedBox.shrink(),
              data: (seats) => SeatsCard(seats: seats),
            ),
            const SizedBox(height: 12),
          ],

          reviewsAsync!.when(
            loading: () => const CardShimmer(height: 140),
            error: (_, _) => const SizedBox.shrink(),
            data: (reviews) => RecentReviewsCard(
              reviews: reviews,
              onViewAll: () => context.push('/dashboard/reviews'),
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Account menu — mirrors web's Account dropdown. "My Orders" is the
        // buyer-side order history (everyone, incl. sellers who also buy),
        // distinct from the seller "Orders" entry in the dashboard drawer.
        _Card(
          title: isHindi ? 'खाता' : 'Account',
          children: [
            _LinkRow(
              icon: Icons.receipt_long_outlined,
              label: isHindi ? 'मेरे ऑर्डर' : 'My Orders',
              onTap: () => context.push('/orders'),
            ),
            _LinkRow(
              icon: Icons.settings_outlined,
              label: isHindi ? 'सेटिंग्स' : 'Settings',
              onTap: () => context.push('/profile/settings'),
            ),
            _LinkRow(
              icon: Icons.info_outline,
              label: isHindi ? 'हमारे बारे में' : 'About',
              onTap: () => context.push('/about'),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Logout
        OutlinedButton.icon(
          onPressed: () async {
            await FirebaseAuth.instance.signOut();
            if (context.mounted) context.go('/');
          },
          icon: const Icon(Icons.logout, color: AppColors.error),
          label: Text(
            isHindi ? 'लॉग आउट' : 'Logout',
            style: AppTextStyles.bodyMedium.copyWith(color: AppColors.error),
          ),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.error),
            padding: const EdgeInsets.symmetric(vertical: 14),
            minimumSize: const Size(double.infinity, 0),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Delete Account — every user needs a reachable way to do this
        // in-app (App Store/Play Store account-deletion requirement), not
        // just paid sellers via the Dashboard drawer. Shares the same
        // confirmation dialog and backend call as the Dashboard's Business
        // Settings screen.
        OutlinedButton.icon(
          onPressed: () => showDialog(
            context: context,
            barrierDismissible: true,
            builder: (_) => const DeleteAccountDialog(),
          ),
          icon: const Icon(Icons.delete_forever_outlined,
              color: AppColors.onSurfaceVariant),
          label: Text(
            isHindi ? 'खाता हटाएं' : 'Delete Account',
            style: AppTextStyles.bodyMedium
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.divider),
            padding: const EdgeInsets.symmetric(vertical: 14),
            minimumSize: const Size(double.infinity, 0),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            ref.watch(appVersionProvider).maybeWhen(
                  data: (v) => 'KrishiDukan v$v',
                  orElse: () => 'KrishiDukan',
                ),
            style: AppTextStyles.caption,
          ),
        ),
        const SizedBox(height: 80),
      ],
    );
  }
}

/// Shows the seller's real profile photo when they've set one — on web or
/// mobile — falling back to the initial-letter avatar otherwise. Sellers set
/// this photo via the web dashboard's Profile page today (`profiles/{phone}
/// .logo`, mirrored to `retailers/{phone}.logo`); no separate mobile upload
/// flow exists yet. Reuses `retailerProfileProvider`, the same provider
/// `ShopProfileScreen` already reads this field from — no new Firestore
/// query. Consumers have no `profiles/{phone}` doc, so this only queries for
/// sellers.
class _ProfileAvatar extends ConsumerWidget {
  final dynamic user;
  const _ProfileAvatar({required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String? logo = user.isSeller
        ? ref.watch(retailerProfileProvider(user.phone as String)).value?.logo
        : null;
    final hasLogo = logo != null && logo.isNotEmpty;

    return CircleAvatar(
      radius: 40,
      backgroundColor: AppColors.primaryContainer,
      backgroundImage: hasLogo ? CachedNetworkImageProvider(logo) : null,
      child: hasLogo
          ? null
          : Text(
              user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
              style: AppTextStyles.heading1.copyWith(
                color: AppColors.primary,
                fontSize: 32,
              ),
            ),
    );
  }
}

class _GuestView extends StatelessWidget {
  final bool isHindi;
  const _GuestView({required this.isHindi});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.person_outline,
            size: 72,
            color: AppColors.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text(
            isHindi
                ? 'खाते तक पहुंचने के लिए लॉगिन करें'
                : 'Login to access your account',
            style: AppTextStyles.body,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => context.push('/login'),
            child: Text(isHindi ? 'साइन इन करें' : 'Sign In'),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String? title;
  final List<Widget> children;
  const _Card({this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null && title!.isNotEmpty) ...[
            Text(title!, style: AppTextStyles.heading3),
            const SizedBox(height: 8),
          ],
          ...children,
        ],
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _LinkRow({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.primary),
            const SizedBox(width: 10),
            Expanded(child: Text(label, style: AppTextStyles.bodyMedium)),
            const Icon(
              Icons.chevron_right,
              size: 18,
              color: AppColors.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

/// "Managing {shop}" / "access paused" card for shop helpers.
class _StaffNotice extends StatelessWidget {
  final String title;
  final String body;
  final bool warning;
  const _StaffNotice({required this.title, required this.body, this.warning = false});

  @override
  Widget build(BuildContext context) {
    final color = warning ? AppColors.secondary : AppColors.primary;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(warning ? Icons.pause_circle_outline : Icons.groups_2_outlined, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(body, style: AppTextStyles.caption),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
