import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/review_model.dart';
import '../../../core/models/store_model.dart';
import '../../../core/models/user_model.dart';
import '../../../core/providers/user_provider.dart';
import '../data/review_repository.dart';
import '../providers/marketplace_provider.dart';

void showReviewBottomSheet({
  required BuildContext context,
  required WidgetRef ref,
  String? catalogId,
  String? storePhone,
  ReviewModel? existingReview,
}) {
  final userAsync = ref.read(currentUserProvider);
  final user = userAsync.value;

  if (user == null) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign In Required'),
        content: const Text('You need to sign in to write a review.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              context.push('/login');
            },
            child: const Text('Sign In'),
          ),
        ],
      ),
    );
    return;
  }

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => ReviewSheet(
      catalogId: catalogId,
      storePhone: storePhone,
      existingReview: existingReview,
      currentUser: user,
    ),
  );
}

void showStoreReviewsBottomSheet({
  required BuildContext context,
  required WidgetRef ref,
  required StoreModel store,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => StoreReviewsSheet(store: store),
  );
}

class StoreReviewsSheet extends ConsumerWidget {
  final StoreModel store;
  const StoreReviewsSheet({super.key, required this.store});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewsAsync = ref.watch(storeReviewsProvider(store.phone ?? ''));
    final userReviewAsync = ref.watch(userStoreReviewProvider(store.phone ?? ''));

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.8,
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      store.name,
                      style: AppTextStyles.heading2,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text('Store Reviews', style: AppTextStyles.bodySmall),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const Divider(),
          const SizedBox(height: 12),

          // Rating summary and write button
          Expanded(
            child: reviewsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, s) => const Center(child: Text('Could not load reviews.')),
              data: (reviews) {
                final avg = store.averageRating ?? 0.0;
                final count = store.totalReviews ?? reviews.length;

                return Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Text(
                              avg.toStringAsFixed(1),
                              style: const TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w800,
                                color: AppColors.onSurface,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: List.generate(
                                    5,
                                    (i) => Icon(
                                      i < avg.round() ? Icons.star : Icons.star_border,
                                      size: 16,
                                      color: AppColors.secondary,
                                    ),
                                  ),
                                ),
                                Text(
                                  '$count Review${count != 1 ? 's' : ''}',
                                  style: AppTextStyles.bodySmall,
                                ),
                              ],
                            ),
                          ],
                        ),
                        if (store.phone != null && store.phone!.isNotEmpty)
                          userReviewAsync.when(
                            data: (userReview) => TextButton.icon(
                              onPressed: () {
                                showReviewBottomSheet(
                                  context: context,
                                  ref: ref,
                                  storePhone: store.phone,
                                  existingReview: userReview,
                                );
                              },
                              icon: Icon(
                                userReview != null ? Icons.edit : Icons.rate_review,
                                size: 16,
                                color: AppColors.primary,
                              ),
                              label: Text(
                                userReview != null ? 'Edit Review' : 'Write Review',
                                style: AppTextStyles.caption.copyWith(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            loading: () => const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            error: (e, s) => const SizedBox.shrink(),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    if (reviews.isEmpty)
                      Expanded(
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.star_border_outlined,
                                  size: 48, color: AppColors.primaryContainer),
                              const SizedBox(height: 8),
                              Text('No reviews yet', style: AppTextStyles.body),
                            ],
                          ),
                        ),
                      )
                    else
                      Expanded(
                        child: ListView.builder(
                          itemCount: reviews.length,
                          itemBuilder: (context, index) {
                            final r = reviews[index];
                            return _StoreReviewTile(review: r);
                          },
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StoreReviewTile extends StatelessWidget {
  final ReviewModel review;
  const _StoreReviewTile({required this.review});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                review.reviewerName,
                style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold),
              ),
              Row(
                children: List.generate(
                  5,
                  (i) => Icon(
                    i < review.rating.round() ? Icons.star : Icons.star_border,
                    size: 14,
                    color: AppColors.secondary,
                  ),
                ),
              ),
            ],
          ),
          if (review.createdAt != null) ...[
            const SizedBox(height: 2),
            Text(
              _formatDate(review.createdAt!),
              style: AppTextStyles.caption.copyWith(color: AppColors.onSurfaceVariant),
            ),
          ],
          if (review.reviewText != null && review.reviewText!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.reviewText!,
              style: AppTextStyles.bodySmall,
            ),
          ],
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}

class ReviewSheet extends ConsumerStatefulWidget {
  final String? catalogId;
  final String? storePhone;
  final ReviewModel? existingReview;
  final UserModel currentUser;

  const ReviewSheet({
    super.key,
    this.catalogId,
    this.storePhone,
    this.existingReview,
    required this.currentUser,
  }) : assert(catalogId != null || storePhone != null,
            'Either catalogId or storePhone must be provided');

  @override
  ConsumerState<ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends ConsumerState<ReviewSheet> {
  late double _rating;
  late TextEditingController _textController;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _rating = widget.existingReview?.rating ?? 5.0;
    _textController = TextEditingController(text: widget.existingReview?.reviewText ?? '');
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _textController.text.trim();
    if (text.isEmpty) {
      setState(() => _error = 'Please write some review text.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final repo = ReviewRepository();
      if (widget.existingReview != null) {
        // Edit review
        if (widget.catalogId != null) {
          await repo.updateProductReview(
            reviewId: widget.existingReview!.id,
            rating: _rating,
            reviewText: text,
          );
        } else {
          await repo.updateStoreReview(
            reviewId: widget.existingReview!.id,
            rating: _rating,
            reviewText: text,
          );
        }
      } else {
        // Add new review
        if (widget.catalogId != null) {
          await repo.addProductReview(
            catalogId: widget.catalogId!,
            reviewerPhone: widget.currentUser.phone,
            reviewerName: widget.currentUser.name.isNotEmpty
                ? widget.currentUser.name
                : 'Anonymous Farmer',
            rating: _rating,
            reviewText: text,
          );
        } else {
          await repo.addStoreReview(
            storePhone: widget.storePhone!,
            reviewerPhone: widget.currentUser.phone,
            reviewerName: widget.currentUser.name.isNotEmpty
                ? widget.currentUser.name
                : 'Anonymous Farmer',
            rating: _rating,
            reviewText: text,
          );
        }
      }

      // Invalidate providers to refresh the UI immediately
      if (widget.catalogId != null) {
        ref.invalidate(productReviewsProvider(widget.catalogId!));
        ref.invalidate(userProductReviewProvider(widget.catalogId!));
        ref.invalidate(catalogDetailProvider(widget.catalogId!));
      } else {
        ref.invalidate(storeReviewsProvider(widget.storePhone!));
        ref.invalidate(userStoreReviewProvider(widget.storePhone!));
        ref.invalidate(storesListProvider);
      }

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.existingReview != null
                ? 'Review updated successfully!'
                : 'Review submitted successfully!'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Failed to submit review. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.existingReview != null ? 'Edit Review' : 'Write a Review';
    final label = widget.catalogId != null ? 'Product Rating' : 'Store Rating';

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 20,
        right: 20,
        top: 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title, style: AppTextStyles.heading2),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(label, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (index) {
                final starVal = index + 1.0;
                final isSelected = starVal <= _rating;
                return GestureDetector(
                  onTap: () => setState(() => _rating = starVal),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: Icon(
                      isSelected ? Icons.star : Icons.star_border,
                      color: AppColors.secondary,
                      size: 40,
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 20),
            Text('Your Review', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(
              controller: _textController,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Share details of your experience...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.divider),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.primary, width: 2),
                ),
              ),
              style: AppTextStyles.body,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: AppColors.error, fontSize: 13),
              ),
            ],
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _submitting ? null : () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      side: const BorderSide(color: AppColors.primary),
                      foregroundColor: AppColors.primary,
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _submitting ? null : _submit,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      backgroundColor: AppColors.primary,
                    ),
                    child: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Submit'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
