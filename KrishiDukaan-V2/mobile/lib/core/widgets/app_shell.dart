import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../constants/app_colors.dart';
import '../providers/cart_provider.dart';
import '../providers/user_provider.dart';
import '../../features/reels/providers/reels_provider.dart';

/// Tracks which bottom-nav tab is currently visible.
/// ReelsFeedScreen listens to this to pause video when leaving the reels tab.
final activeShellIndexProvider = NotifierProvider<_ActiveTabNotifier, int>(
  _ActiveTabNotifier.new,
);

class _ActiveTabNotifier extends Notifier<int> {
  @override
  int build() => 0;
  void setIndex(int index) => state = index;
}

class AppShell extends ConsumerWidget {
  final StatefulNavigationShell navigationShell;
  const AppShell({super.key, required this.navigationShell});

  static const _destinations = [
    _ShellDestination(
      label: 'Home',
      icon: Icons.home_outlined,
      selectedIcon: Icons.home_rounded,
    ),
    _ShellDestination(
      label: 'Market',
      icon: Icons.storefront_outlined,
      selectedIcon: Icons.storefront_rounded,
    ),
    _ShellDestination(
      label: 'Hubs',
      icon: Icons.warehouse_outlined,
      selectedIcon: Icons.warehouse_rounded,
    ),
    _ShellDestination(
      label: 'Stores',
      icon: Icons.location_on_outlined,
      selectedIcon: Icons.location_on_rounded,
    ),
    _ShellDestination(
      label: 'AgriReels',
      icon: Icons.play_circle_outline_rounded,
      selectedIcon: Icons.play_circle_rounded,
    ),
  ];

  void _showSubscriptionDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Subscription Required'),
        content: const Text(
          'An active subscription is required to upload reels.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              context.push('/subscription');
            },
            child: const Text('Subscribe Now'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentIndex = navigationShell.currentIndex;
    final cartCount = ref.watch(cartCountProvider);
    final userModel = ref.watch(currentUserProvider).value;
    final isSeller = userModel?.isSeller ?? false;
    final canAccess = ref.watch(canAccessDashboardProvider);
    final isReelsTab = currentIndex == 4;
    final commentSheetOpen = ref.watch(reelCommentSheetOpenProvider);

    Widget? fab;
    if (isReelsTab && isSeller && !commentSheetOpen) {
      fab = FloatingActionButton(
        backgroundColor: AppColors.secondary,
        foregroundColor: Colors.white,
        onPressed: () {
          if (canAccess) {
            context.push('/reels/upload');
          } else {
            _showSubscriptionDialog(context);
          }
        },
        child: const Icon(Icons.video_call_rounded, size: 26),
      );
    } else if (!isReelsTab && cartCount > 0) {
      fab = Container(
        margin: const EdgeInsets.only(bottom: 12, right: 12),
        child: FloatingActionButton(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          onPressed: () => context.push('/cart'),
          child: Badge(
            label: Text('$cartCount', style: const TextStyle(fontSize: 10)),
            child: const Icon(Icons.shopping_cart, size: 24),
          ),
        ),
      );
    }

    // System back from a non-Home tab returns to Home instead of closing the
    // app (Android hardware/gesture back lands here when the shell is on top).
    return PopScope(
      canPop: currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) navigationShell.goBranch(0);
      },
      child: Scaffold(
        body: navigationShell,
        floatingActionButton: fab,
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
        bottomNavigationBar: isReelsTab
            ? null
            : Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFFFFFFFF), Color(0xFFF5F8FF)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Color(0x16000000),
                      blurRadius: 16,
                      offset: Offset(0, -4),
                    ),
                  ],
                ),
                child: SafeArea(
                  top: false,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        height: 2,
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              Color(0x1A3C4DB7),
                              Color(0x803C4DB7),
                              Color(0x1A3C4DB7),
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 5, 8, 7),
                        child: Row(
                          children: List.generate(_destinations.length, (
                            index,
                          ) {
                            return Expanded(
                              child: _ShellNavItem(
                                destination: _destinations[index],
                                isSelected:
                                    navigationShell.currentIndex == index,
                                onTap: () {
                                  ref
                                      .read(activeShellIndexProvider.notifier)
                                      .setIndex(index);
                                  navigationShell.goBranch(
                                    index,
                                    initialLocation:
                                        index == navigationShell.currentIndex,
                                  );
                                },
                              ),
                            );
                          }),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _ShellDestination {
  final String label;
  final IconData icon;
  final IconData selectedIcon;

  const _ShellDestination({
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });
}

class _ShellNavItem extends StatelessWidget {
  final _ShellDestination destination;
  final bool isSelected;
  final VoidCallback onTap;

  const _ShellNavItem({
    required this.destination,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final iconColor = isSelected
        ? AppColors.primary
        : AppColors.onSurfaceVariant;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        decoration: BoxDecoration(
          gradient: isSelected
              ? LinearGradient(
                  colors: [
                    AppColors.primaryContainer.withValues(alpha: 0.54),
                    Colors.white.withValues(alpha: 0.95),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                )
              : null,
          color: isSelected ? null : Colors.transparent,
          borderRadius: BorderRadius.circular(18),
          border: isSelected
              ? Border.all(color: AppColors.primary.withValues(alpha: 0.22))
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              width: isSelected ? 26 : 0,
              height: 3,
              margin: const EdgeInsets.only(bottom: 4),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.primary.withValues(alpha: 0.14)
                    : Colors.transparent,
                shape: BoxShape.circle,
              ),
              child: Icon(
                isSelected ? destination.selectedIcon : destination.icon,
                size: 20,
                color: iconColor,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: iconColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
