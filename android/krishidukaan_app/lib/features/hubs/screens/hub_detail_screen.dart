import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/blog_post_model.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/hubs_provider.dart';

class HubDetailScreen extends ConsumerWidget {
  final String postId;
  const HubDetailScreen({super.key, required this.postId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final postAsync = ref.watch(hubPostProvider(postId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: postAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (_, _) =>
            const ErrorView(message: 'Failed to load article.'),
        data: (post) {
          if (post == null) {
            return const ErrorView(message: 'Article not found.');
          }

          return CustomScrollView(
            slivers: [
              // Cover image + back button
              SliverAppBar(
                expandedHeight: post.coverImage != null ? 220 : 0,
                pinned: true,
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                flexibleSpace: post.coverImage != null
                    ? FlexibleSpaceBar(
                        background: CachedNetworkImage(
                          imageUrl: post.coverImage!,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) =>
                              Container(color: AppColors.primary),
                        ),
                      )
                    : null,
              ),

              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Tags
                      if (post.tags.isNotEmpty)
                        Wrap(
                          spacing: 6,
                          children: post.tags
                              .map((t) => _TagChip(t))
                              .toList(),
                        ),
                      const SizedBox(height: 12),

                      // Title
                      Text(post.title, style: AppTextStyles.heading1),
                      const SizedBox(height: 8),

                      // Meta
                      _buildMeta(post),
                      const SizedBox(height: 12),

                      // Excerpt
                      if (post.excerpt.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer
                                .withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border(
                              left: BorderSide(
                                  color: AppColors.primary, width: 3),
                            ),
                          ),
                          child: Text(
                            post.excerpt,
                            style: AppTextStyles.body.copyWith(
                                fontStyle: FontStyle.italic),
                          ),
                        ),
                      const SizedBox(height: 20),

                      // Content (plain text — HTML stripped)
                      _renderContent(post.content),
                      const SizedBox(height: 24),

                      // Share / back row
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          TextButton.icon(
                            icon: const Icon(Icons.arrow_back),
                            label: const Text('Back to Learn'),
                            onPressed: () => context.go('/hubs'),
                          ),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.share_outlined, size: 18),
                            label: const Text('Share'),
                            onPressed: () => _shareWhatsApp(post.title),
                          ),
                        ],
                      ),

                      const SizedBox(height: 24),

                      // Related articles
                      Consumer(
                        builder: (context, ref, _) {
                          final related =
                              ref.watch(relatedPostsProvider(post));
                          return related.maybeWhen(
                            data: (posts) {
                              if (posts.isEmpty) return const SizedBox.shrink();
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Divider(),
                                  const SizedBox(height: 12),
                                  Text('Related Articles',
                                      style: AppTextStyles.heading3),
                                  const SizedBox(height: 12),
                                  ...posts.map(
                                    (r) => ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(r.title,
                                          style: AppTextStyles.bodyMedium,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis),
                                      trailing: const Icon(
                                          Icons.arrow_forward_ios,
                                          size: 14),
                                      onTap: () => context
                                          .push('/hubs/${r.id}'),
                                    ),
                                  ),
                                ],
                              );
                            },
                            orElse: () => const SizedBox.shrink(),
                          );
                        },
                      ),
                      const SizedBox(height: 80),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildMeta(BlogPostModel post) {
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

  Widget _renderContent(String rawContent) {
    // Strip HTML tags for plain-text rendering
    final plain = rawContent
        .replaceAll(RegExp(r'<br\s*/?>'), '\n')
        .replaceAll(RegExp(r'<p[^>]*>'), '')
        .replaceAll(RegExp(r'</p>'), '\n\n')
        .replaceAll(RegExp(r'<h[1-6][^>]*>'), '')
        .replaceAll(RegExp(r'</h[1-6]>'), '\n\n')
        .replaceAll(RegExp(r'<li[^>]*>'), '• ')
        .replaceAll(RegExp(r'</li>'), '\n')
        .replaceAll(RegExp(r'<[^>]+>'), '')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&quot;', '"')
        .trim();

    return Text(plain, style: AppTextStyles.body);
  }

  void _shareWhatsApp(String title) {
    final text = Uri.encodeComponent('$title — via KrishiDukaan');
    launchUrl(Uri.parse('https://wa.me/?text=$text'));
  }
}

class _TagChip extends StatelessWidget {
  final String label;
  const _TagChip(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
