import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/review_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../marketplace/data/review_repository.dart';

/// Minimal seller Reviews screen mirroring web's /dashboard/reviews. Reuses
/// ReviewRepository.fetchStoreReviews (already used by store_detail_sheet.dart)
/// against the existing `storeReviews` collection — no new backend work.
class DashboardReviewsScreen extends ConsumerWidget {
  const DashboardReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sellerUserProvider).value;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Reviews',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: user == null
          ? const Center(child: Text('Not logged in.'))
          : _Body(storePhone: user.phone),
    );
  }
}

class _Body extends StatefulWidget {
  final String storePhone;
  const _Body({required this.storePhone});

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  late final Future<List<ReviewModel>> _future;

  @override
  void initState() {
    super.initState();
    _future = ReviewRepository().fetchStoreReviews(widget.storePhone);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ReviewModel>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return const Center(child: Text('Failed to load reviews.'));
        }
        final reviews = snapshot.data ?? const <ReviewModel>[];
        if (reviews.isEmpty) {
          return const Center(child: Text('No reviews yet.'));
        }
        final avg =
            reviews.fold<double>(0, (sum, r) => sum + r.rating) / reviews.length;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SummaryCard(average: avg, count: reviews.length),
            const SizedBox(height: 16),
            for (final review in reviews) _ReviewTile(review: review),
          ],
        );
      },
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final double average;
  final int count;
  const _SummaryCard({required this.average, required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          Icon(Icons.star, color: AppColors.secondary, size: 32),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(average.toStringAsFixed(1), style: AppTextStyles.heading2),
              Text('$count review${count == 1 ? '' : 's'}',
                  style: AppTextStyles.caption),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReviewTile extends StatelessWidget {
  final ReviewModel review;
  const _ReviewTile({required this.review});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(review.reviewerName,
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w700)),
              ),
              Row(
                children: List.generate(
                  5,
                  (i) => Icon(
                    i < review.rating.round() ? Icons.star : Icons.star_border,
                    size: 16,
                    color: AppColors.secondary,
                  ),
                ),
              ),
            ],
          ),
          if (review.reviewText != null && review.reviewText!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(review.reviewText!, style: AppTextStyles.bodySmall),
          ],
          if (review.createdAt != null) ...[
            const SizedBox(height: 8),
            Text(
              '${review.createdAt!.day}/${review.createdAt!.month}/${review.createdAt!.year}',
              style: AppTextStyles.caption,
            ),
          ],
        ],
      ),
    );
  }
}
