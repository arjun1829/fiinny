import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../constants/app_colors.dart';
import '../providers/cart_provider.dart';
import '../providers/user_provider.dart';

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
    final cartCount = ref.watch(cartCountProvider);
    final userModel = ref.watch(currentUserProvider).value;
    final isSeller = userModel?.isSeller ?? false;
    final canAccess = ref.watch(canAccessDashboardProvider);
    final isReelsTab = navigationShell.currentIndex == 4;

    Widget? fab;
    if (isReelsTab && isSeller) {
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

    return Scaffold(
      body: navigationShell,
      floatingActionButton: fab,
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: AppColors.divider.withValues(alpha: 0.7)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 18,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            child: Row(
              children: List.generate(_destinations.length, (index) {
                return Expanded(
                  child: _ShellNavItem(
                    destination: _destinations[index],
                    isSelected: navigationShell.currentIndex == index,
                    onTap: () => navigationShell.goBranch(
                      index,
                      initialLocation: index == navigationShell.currentIndex,
                    ),
                  ),
                );
              }),
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
    final iconColor =
        isSelected ? AppColors.primary : AppColors.onSurfaceVariant;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primaryContainer.withValues(alpha: 0.34)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(22),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: isSelected
                    ? Colors.white.withValues(alpha: 0.9)
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
