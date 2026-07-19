import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/user_provider.dart';
import '../providers/reels_provider.dart';
import 'shop_profile_screen.dart';

/// Opens a single reel by id — the landing screen for shared reel links
/// (`/reel/:id`, reached via `WebLinks.reel` → the app-links/universal-links
/// redirect in app_router.dart). Reuses [StandaloneReelsFeed] (already built
/// for the shop-profile grid) with a one-item list so it's the exact same
/// full-screen player, just entered from a deep link instead of a tap.
class ReelDeepLinkScreen extends ConsumerWidget {
  final String reelId;
  const ReelDeepLinkScreen({super.key, required this.reelId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reelAsync = ref.watch(reelByIdProvider(reelId));
    final user = ref.watch(currentUserProvider).value;

    return Scaffold(
      backgroundColor: Colors.black,
      body: reelAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Colors.white54),
        ),
        error: (_, _) => const _ReelLinkError(),
        data: (reel) {
          if (reel == null) return const _ReelLinkError();
          return StandaloneReelsFeed(
            reels: [reel],
            initialIndex: 0,
            currentUserId: user?.phone,
            currentUserName: user?.businessName ?? user?.name ?? '',
          );
        },
      ),
    );
  }
}

class _ReelLinkError extends StatelessWidget {
  const _ReelLinkError();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.videocam_off_outlined,
            color: Colors.white38,
            size: 56,
          ),
          const SizedBox(height: 16),
          const Text(
            'This reel is no longer available',
            style: TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: () => Navigator.of(context).canPop()
                ? Navigator.of(context).pop()
                : null,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: Colors.white38),
            ),
            child: const Text('Go back'),
          ),
        ],
      ),
    );
  }
}
