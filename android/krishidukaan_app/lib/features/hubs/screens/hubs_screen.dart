import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/blog_post_model.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/hubs_provider.dart';

class HubsScreen extends ConsumerWidget {
  const HubsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final postsAsync = ref.watch(hubsListProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            backgroundColor: AppColors.primary,
            title: Row(
              children: [
                const Icon(Icons.menu_book, color: Colors.white),
                const SizedBox(width: 8),
                Text('Learn',
                    style:
                        AppTextStyles.heading2.copyWith(color: Colors.white)),
              ],
            ),
          ),
          SliverToBoxAdapter(
            child: postsAsync.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(64),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (e, _) => ErrorView(
                message: 'Could not load articles.',
                onRetry: () => ref.invalidate(hubsListProvider),
              ),
              data: (posts) {
                if (posts.isEmpty) {
                  return const EmptyState(
                    title: 'No articles yet',
                    subtitle: 'Farming tips and agri insights coming soon',
                    icon: Icons.article_outlined,
                  );
                }

                final featured = posts.first;
                final rest = posts.skip(1).toList();

                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Featured
                      _FeaturedCard(post: featured),
                      const SizedBox(height: 24),

                      if (rest.isNotEmpty) ...[
                        Text('More Articles', style: AppTextStyles.heading3),
                        const SizedBox(height: 12),
                        ...rest.map((p) => _PostCard(post: p)),
                      ],
                      const SizedBox(height: 80),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FeaturedCard extends StatelessWidget {
  final BlogPostModel post;
  const _FeaturedCard({required this.post});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/hubs/${post.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(16)),
              child: post.coverImage != null
                  ? CachedNetworkImage(
                      imageUrl: post.coverImage!,
                      height: 180,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => _coverPlaceholder(),
                    )
                  : _coverPlaceholder(),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _TagChip('Featured'),
                      ...post.tags.take(2).map(
                            (t) => Padding(
                              padding: const EdgeInsets.only(left: 6),
                              child: _TagChip(t),
                            ),
                          ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(post.title,
                      style: AppTextStyles.heading2,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Text(post.excerpt,
                      style: AppTextStyles.body.copyWith(
                          color: AppColors.onSurfaceVariant),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 10),
                  _PostMeta(post: post),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _coverPlaceholder() => Container(
        height: 180,
        width: double.infinity,
        color: AppColors.primaryContainer.withValues(alpha: 0.3),
        child: const Center(
          child: Text('🌿', style: TextStyle(fontSize: 48)),
        ),
      );
}

class _PostCard extends StatelessWidget {
  final BlogPostModel post;
  const _PostCard({required this.post});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/hubs/${post.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
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
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (post.coverImage != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: CachedNetworkImage(
                  imageUrl: post.coverImage!,
                  width: 80,
                  height: 80,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => _smallPlaceholder(),
                ),
              )
            else
              _smallPlaceholder(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (post.tags.isNotEmpty)
                    _TagChip(post.tags.first),
                  const SizedBox(height: 4),
                  Text(post.title,
                      style: AppTextStyles.bodyMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  _PostMeta(post: post),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _smallPlaceholder() => Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          color: AppColors.primaryContainer.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Text('🌿', style: TextStyle(fontSize: 28)),
        ),
      );
}

class _PostMeta extends StatelessWidget {
  final BlogPostModel post;
  const _PostMeta({required this.post});

  @override
  Widget build(BuildContext context) {
    final parts = <String>[post.author];
    if (post.publishedAt != null) {
      parts.add(DateFormat('dd MMM yyyy').format(post.publishedAt!));
    }
    if (post.readTime != null) parts.add('${post.readTime} min read');

    return Text(
      parts.join(' · '),
      style: AppTextStyles.caption.copyWith(color: AppColors.onSurfaceVariant),
    );
  }
}

class _TagChip extends StatelessWidget {
  final String label;
  const _TagChip(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: AppColors.primaryContainer.withValues(alpha: 0.8)),
      ),
      child: Text(
        label,
        style: AppTextStyles.caption.copyWith(
          color: AppColors.primary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
