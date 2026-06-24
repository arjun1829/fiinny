import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/hubs_provider.dart';
import 'hub_content_widget.dart';

/// Shown when navigating directly to /hubs/:hubId
/// Renders the full hub detail for a single crop.
class HubDetailScreen extends ConsumerWidget {
  final String
  postId; // parameter name kept for router compat (was postId/slug)

  const HubDetailScreen({super.key, required this.postId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hubAsync = ref.watch(hubDetailProvider(postId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: hubAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (_, _) => ErrorView(
          message: 'Could not load hub.',
          onRetry: () => ref.invalidate(hubDetailProvider(postId)),
        ),
        data: (hub) {
          if (hub == null) {
            return ErrorView(
              message: 'Hub not found.',
              onRetry: () => context.go('/hubs'),
            );
          }

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 220,
                pinned: true,
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => context.go('/hubs'),
                ),
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(
                    '${hub.name} Hub',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: Colors.white,
                      fontSize: 14,
                    ),
                  ),
                  titlePadding: const EdgeInsets.only(left: 56, bottom: 14),
                  background: hub.heroImage.isNotEmpty
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            CachedNetworkImage(
                              memCacheWidth: 1000,
                              imageUrl: hub.heroImage,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) =>
                                  Container(color: AppColors.primary),
                            ),
                            DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.transparent,
                                    Colors.black.withValues(alpha: 0.7),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        )
                      : null,
                ),
              ),
              SliverToBoxAdapter(child: HubContentWidget(hub: hub)),
            ],
          );
        },
      ),
    );
  }
}
