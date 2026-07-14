import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../providers/location_provider.dart';
import 'app_brand_icon.dart';
import 'package:go_router/go_router.dart';
import 'package:geolocator/geolocator.dart';

/// Dark status-bar icons for the white top bar. Every screen that paints the
/// white [topBarGradient] behind a transparent AppBar must set this, because
/// Flutter otherwise derives light icons from the theme's (green) app bar.
const SystemUiOverlayStyle topBarOverlayStyle = SystemUiOverlayStyle(
  statusBarColor: Colors.transparent,
  statusBarIconBrightness: Brightness.dark, // Android
  statusBarBrightness: Brightness.light, // iOS
);

/// Shared backdrop used by every top bar so all tabs look consistent.
/// Frosted white with a faint green tint — separation from the (also white)
/// page content comes from the hairline bottom border and the scroll shadow,
/// not from a heavy color block.
LinearGradient topBarGradient() => const LinearGradient(
  colors: [AppColors.topBarStart, AppColors.topBarEnd],
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
);

class TopBarBackdrop extends StatelessWidget {
  final BorderRadiusGeometry? borderRadius;
  const TopBarBackdrop({super.key, this.borderRadius});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: topBarGradient(),
        borderRadius: borderRadius,
        border: const Border(
          bottom: BorderSide(color: AppColors.topBarBorder),
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Whisper-subtle brand orbs keep the bar from feeling sterile
          // without competing with the dark text.
          Positioned(
            top: -26,
            left: -20,
            child: _GlowOrb(
              size: 120,
              color: AppColors.primary.withValues(alpha: 0.04),
            ),
          ),
          Positioned(
            right: -28,
            bottom: -40,
            child: _GlowOrb(
              size: 150,
              color: AppColors.primaryLight.withValues(alpha: 0.06),
            ),
          ),
          Positioned(
            right: 56,
            top: 12,
            child: _GlowOrb(
              size: 66,
              color: AppColors.secondary.withValues(alpha: 0.05),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowOrb extends StatelessWidget {
  final double size;
  final Color color;

  const _GlowOrb({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
    );
  }
}

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
                style: AppTextStyles.heading2.copyWith(
                  color: AppColors.onSurface,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.2,
                ),
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
      color: AppColors.topBarControl,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () async {
          final perm = await Geolocator.checkPermission();
          if (perm == LocationPermission.deniedForever) {
            await Geolocator.openAppSettings();
          } else if (perm == LocationPermission.denied) {
            await Geolocator.requestPermission();
          }
          ref.invalidate(locationProvider);
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.location_on,
                size: 11,
                color: AppColors.primary,
              ),
              const SizedBox(width: 3),
              Flexible(
                child: locationAsync.when(
                  data: (loc) => Text(
                    loc,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  loading: () => const Text(
                    'Detecting location...',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  error: (err, _) {
                    final isDenied = err.toString().contains(
                      'permission_denied',
                    );
                    return Text(
                      isDenied ? 'Turn on location' : 'Tap to retry location',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.onSurfaceVariant,
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(width: 2),
              const Icon(
                Icons.refresh,
                size: 11,
                color: AppColors.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Soft-gray squircle icon button used in top bar actions — the gray container
/// is what keeps controls legible as tappable on the white bar.
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
        color: AppColors.topBarControl,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.topBarControlBorder),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onPressed,
          child: Tooltip(
            message: tooltip ?? '',
            child: Padding(
              padding: const EdgeInsets.all(9),
              child: Icon(icon, color: AppColors.onSurface, size: 19),
            ),
          ),
        ),
      ),
    );
  }
}

/// Drop-in AppBar replacement: taller, frosted white, brand title + location
/// pill. Pass [bottomExtension] (e.g. a search bar) to render it inside the
/// same backdrop block with rounded bottom corners, so it never touches.
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
      scrolledUnderElevation: 4,
      shadowColor: const Color(0x22000000),
      surfaceTintColor: Colors.transparent,
      backgroundColor: Colors.transparent,
      systemOverlayStyle: topBarOverlayStyle,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(18)),
      ),
      clipBehavior: Clip.antiAlias,
      flexibleSpace: const TopBarBackdrop(),
      foregroundColor: AppColors.onSurface,
      title: TopBarTitle(title: title),
      actions: actions,
    );
  }
}
