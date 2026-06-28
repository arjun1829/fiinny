import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../providers/location_provider.dart';
import 'app_brand_icon.dart';
import 'package:go_router/go_router.dart';

/// Shared gradient used by every top bar so all tabs look consistent.
/// Horizontal on purpose: widgets stacked vertically (app bar + search block)
/// each paint it separately, and a left→right run keeps the colors identical
/// at the seam between them.
LinearGradient topBarGradient() => LinearGradient(
      colors: [
        AppColors.primary,
        Color.lerp(AppColors.primary, AppColors.primaryLight, 0.35)!,
      ],
      begin: Alignment.centerLeft,
      end: Alignment.centerRight,
    );

/// Brand + title row with a tappable location pill underneath.
/// Used as the `title` of both AppBar and SliverAppBar.
class TopBarTitle extends ConsumerWidget {
  final String title;
  const TopBarTitle({super.key, required this.title});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            GestureDetector(
              onTap: () => context.push('/profile'),
              child: const AppBrandIcon(size: 30),
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                title,
                style: AppTextStyles.heading2
                    .copyWith(color: Colors.white, fontSize: 18),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: 40),
          child: _LocationPill(),
        ),
      ],
    );
  }
}

class _LocationPill extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locationAsync = ref.watch(locationNameProvider);

    return Material(
      color: Colors.white.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => ref.invalidate(locationProvider),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.location_on,
                  size: 11, color: AppColors.secondary),
              const SizedBox(width: 3),
              Flexible(
                child: locationAsync.when(
                  data: (loc) => Text(
                    loc,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  loading: () => const Text(
                    'Detecting location...',
                    style: TextStyle(fontSize: 11, color: Colors.white70),
                  ),
                  error: (_, _) => const Text(
                    'Tap to retry location',
                    style: TextStyle(fontSize: 11, color: Colors.white70),
                  ),
                ),
              ),
              const SizedBox(width: 2),
              const Icon(Icons.refresh, size: 11, color: Colors.white70),
            ],
          ),
        ),
      ),
    );
  }
}

/// Circular frosted icon button used in top bar actions.
class TopBarAction extends StatelessWidget {
  final IconData icon;
  final String? tooltip;
  final VoidCallback onPressed;

  const TopBarAction({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: Colors.white.withValues(alpha: 0.16),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: Tooltip(
            message: tooltip ?? '',
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Icon(icon, color: Colors.white, size: 20),
            ),
          ),
        ),
      ),
    );
  }
}

/// Drop-in AppBar replacement: taller, gradient, brand title + location pill.
/// Pass [bottomExtension] (e.g. a search bar) to render it inside the same
/// gradient block with rounded bottom corners, so it never touches the bar.
class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget> actions;

  const AppTopBar({super.key, required this.title, this.actions = const []});

  static const double height = 68;

  @override
  Size get preferredSize => const Size.fromHeight(height);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      toolbarHeight: height,
      titleSpacing: 16,
      elevation: 0,
      backgroundColor: Colors.transparent,
      flexibleSpace: Container(
        decoration: BoxDecoration(gradient: topBarGradient()),
      ),
      foregroundColor: Colors.white,
      title: TopBarTitle(title: title),
      actions: actions,
    );
  }
}
