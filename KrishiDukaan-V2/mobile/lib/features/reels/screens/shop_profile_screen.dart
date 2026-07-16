import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/format_count.dart';
import '../../dashboard/providers/dashboard_provider.dart';
import '../providers/reels_provider.dart';
import '../widgets/reel_filters.dart';

class ShopProfileScreen extends ConsumerWidget {
  final String shopPhone;
  const ShopProfileScreen({super.key, required this.shopPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shopAsync = ref.watch(shopUserProvider(shopPhone));
    final reelsAsync = ref.watch(sellerReelsProvider(shopPhone));
    final followersAsync = ref.watch(followerCountProvider(shopPhone));
    final productsAsync = ref.watch(shopListingsProvider(shopPhone));
    final currentUser = ref.watch(currentUserProvider).value;
    final isOwnShop = currentUser?.phone == shopPhone;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          // ── Gradient app bar ────────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 180,
            pinned: true,
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppColors.primaryDark, AppColors.primaryLight],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: shopAsync.when(
                  loading: () => const SizedBox.shrink(),
                  error: (_, _) => const SizedBox.shrink(),
                  data: (user) => Padding(
                    padding: const EdgeInsets.fromLTRB(20, 80, 20, 16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        CircleAvatar(
                          radius: 36,
                          backgroundColor: Colors.white24,
                          child: Text(
                            (user?.businessName ?? user?.name ?? '?')
                                .substring(0, 1)
                                .toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                user?.businessName ?? user?.name ?? shopPhone,
                                style: AppTextStyles.heading2.copyWith(
                                  color: Colors.white,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if ((user?.username ?? '').isNotEmpty)
                                Text(
                                  '@${user!.username}',
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 13,
                                  ),
                                ),
                              if ((user?.city ?? '').isNotEmpty)
                                Row(
                                  children: [
                                    const Icon(
                                      Icons.location_on,
                                      size: 12,
                                      color: Colors.white70,
                                    ),
                                    const SizedBox(width: 3),
                                    Flexible(
                                      child: Text(
                                        [user?.city, user?.state]
                                            .where(
                                              (s) => s != null && s.isNotEmpty,
                                            )
                                            .join(', '),
                                        style: const TextStyle(
                                          color: Colors.white70,
                                          fontSize: 12,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            actions: [
              if (isOwnShop)
                IconButton(
                  icon: const Icon(Icons.video_call_rounded),
                  tooltip: 'Post a Reel',
                  onPressed: () => context.push('/reels/upload'),
                ),
            ],
          ),

          // ── Stats + Follow ───────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _StatColumn(
                        label: 'Reels',
                        valueAsync: reelsAsync
                            .whenData((r) => r.length)
                            .when(
                              data: (v) => '$v',
                              loading: () => '—',
                              error: (_, _) => '—',
                            ),
                      ),
                      Container(width: 1, height: 32, color: AppColors.divider),
                      _StatColumn(
                        label: 'Followers',
                        valueAsync: followersAsync.when(
                          data: (v) => _fmt(v),
                          loading: () => '—',
                          error: (_, _) => '—',
                        ),
                      ),
                      Container(width: 1, height: 32, color: AppColors.divider),
                      _StatColumn(
                        label: 'Products',
                        valueAsync: productsAsync.when(
                          data: (list) =>
                              '${list.where((l) => l.isActive).length}',
                          loading: () => '—',
                          error: (_, _) => '—',
                        ),
                      ),
                    ],
                  ),
                  if (!isOwnShop && currentUser != null) ...[
                    const SizedBox(height: 14),
                    _FollowButton(
                      shopPhone: shopPhone,
                      currentUserId: currentUser.phone,
                    ),
                  ],
                ],
              ),
            ),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 8)),

          // ── Reels grid ───────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              child: Text('Reels', style: AppTextStyles.heading3),
            ),
          ),
          reelsAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              ),
            ),
            error: (_, _) => const SliverToBoxAdapter(
              child: Center(
                child: Text(
                  'Could not load reels.',
                  style: TextStyle(color: Colors.black45),
                ),
              ),
            ),
            data: (reels) {
              if (reels.isEmpty) {
                return SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Column(
                        children: [
                          const Icon(
                            Icons.videocam_off_outlined,
                            size: 48,
                            color: Colors.black26,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            isOwnShop
                                ? 'You haven\'t posted any reels yet.'
                                : 'No reels yet.',
                            style: AppTextStyles.body.copyWith(
                              color: Colors.black45,
                            ),
                          ),
                          if (isOwnShop) ...[
                            const SizedBox(height: 12),
                            FilledButton.icon(
                              onPressed: () => context.push('/reels/upload'),
                              icon: const Icon(Icons.video_call_rounded),
                              label: const Text('Post Your First Reel'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                );
              }
              return SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                sliver: SliverGrid(
                  delegate: SliverChildBuilderDelegate((context, index) {
                    final reel = reels[index];
                    return _ReelGridCard(
                      reel: reel,
                      isOwner: isOwnShop && reel.shopOwnerId == shopPhone,
                      shopPhone: shopPhone,
                      currentUserId: currentUser?.phone,
                      currentUserName:
                          currentUser?.businessName ?? currentUser?.name ?? '',
                      allReels: reels,
                      startIndex: index,
                      onDeleted: () =>
                          ref.invalidate(sellerReelsProvider(shopPhone)),
                      onEdited: () =>
                          ref.invalidate(sellerReelsProvider(shopPhone)),
                    );
                  }, childCount: reels.length),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 4,
                    mainAxisSpacing: 4,
                    childAspectRatio: 0.65,
                  ),
                ),
              );
            },
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 16)),

          // ── Products ─────────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
              child: Text('Products', style: AppTextStyles.heading3),
            ),
          ),
          SliverToBoxAdapter(
            child: productsAsync.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (_, _) => const SizedBox.shrink(),
              data: (listings) {
                final active = listings.where((l) => l.isActive).toList();
                if (active.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: Text(
                        'No products listed.',
                        style: AppTextStyles.body.copyWith(
                          color: Colors.black45,
                        ),
                      ),
                    ),
                  );
                }
                return SizedBox(
                  height: 180,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: active.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 10),
                    itemBuilder: (_, i) => _ProductTile(listing: active[i]),
                  ),
                );
              },
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

  String _fmt(int n) => formatCount(n);
}

// ── Stat column ───────────────────────────────────────────────────────────────

class _StatColumn extends StatelessWidget {
  final String label;
  final String valueAsync;
  const _StatColumn({required this.label, required this.valueAsync});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          valueAsync,
          style: AppTextStyles.heading2.copyWith(color: AppColors.primary),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: AppTextStyles.caption.copyWith(
            color: AppColors.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

// ── Follow button ─────────────────────────────────────────────────────────────

class _FollowButton extends ConsumerStatefulWidget {
  final String shopPhone;
  final String currentUserId;
  const _FollowButton({required this.shopPhone, required this.currentUserId});

  @override
  ConsumerState<_FollowButton> createState() => _FollowButtonState();
}

class _FollowButtonState extends ConsumerState<_FollowButton> {
  bool? _isFollowing;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final v = await ref
        .read(reelsRepoProvider)
        .isFollowing(widget.currentUserId, widget.shopPhone);
    if (mounted)
      setState(() {
        _isFollowing = v;
        _loading = false;
      });
  }

  Future<void> _toggle() async {
    final was = _isFollowing ?? false;
    setState(() {
      _isFollowing = !was;
    });
    try {
      await ref
          .read(reelsRepoProvider)
          .toggleFollow(widget.currentUserId, widget.shopPhone);
      ref.invalidate(followerCountProvider(widget.shopPhone));
    } catch (_) {
      if (mounted)
        setState(() {
          _isFollowing = was;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
        height: 36,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    final following = _isFollowing ?? false;
    return SizedBox(
      width: double.infinity,
      child: following
          ? OutlinedButton.icon(
              onPressed: _toggle,
              icon: const Icon(Icons.check_rounded, size: 18),
              label: const Text('Following'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            )
          : FilledButton.icon(
              onPressed: _toggle,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Follow'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
    );
  }
}

// ── Reel grid card ────────────────────────────────────────────────────────────

class _ReelGridCard extends StatelessWidget {
  final ReelModel reel;
  final bool isOwner;
  final String shopPhone;
  final String? currentUserId;
  final String currentUserName;
  final List<ReelModel> allReels;
  final int startIndex;
  final VoidCallback onDeleted;
  final VoidCallback onEdited;

  const _ReelGridCard({
    required this.reel,
    required this.isOwner,
    required this.shopPhone,
    required this.currentUserId,
    required this.currentUserName,
    required this.allReels,
    required this.startIndex,
    required this.onDeleted,
    required this.onEdited,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => ProviderScope(
            child: StandaloneReelsFeed(
              reels: allReels,
              initialIndex: startIndex,
              currentUserId: currentUserId,
              currentUserName: currentUserName,
            ),
          ),
        ),
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          gradient: LinearGradient(
            colors: [AppColors.primaryDark, AppColors.primary],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Play icon
            const Center(
              child: Icon(
                Icons.play_circle_outline_rounded,
                color: Colors.white54,
                size: 36,
              ),
            ),
            // Bottom info
            Positioned(
              left: 6,
              right: 6,
              bottom: 6,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (reel.caption.isNotEmpty)
                    Text(
                      reel.caption,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 10,
                        shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(
                        Icons.favorite_rounded,
                        color: Colors.white60,
                        size: 10,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        formatCount(reel.likesCount),
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 10,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.play_arrow_rounded,
                        color: Colors.white60,
                        size: 10,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        formatCount(reel.viewsCount),
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // Collab badge — shown when reel was posted by another seller
            // who tagged this shop, or when this reel has tagged partners
            if (reel.shopOwnerId != shopPhone || reel.taggedShopIds.isNotEmpty)
              Positioned(
                top: 4,
                left: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 5,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.deepPurple.withValues(alpha: 0.85),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.people_alt_rounded,
                        color: Colors.white,
                        size: 9,
                      ),
                      SizedBox(width: 3),
                      Text(
                        'collab',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            // Owner actions (3-dot menu)
            if (isOwner)
              Positioned(
                top: 4,
                right: 4,
                child: _ReelMenu(
                  reel: reel,
                  onDeleted: onDeleted,
                  onEdited: onEdited,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Reel 3-dot menu (owner only) ─────────────────────────────────────────────

class _ReelMenu extends ConsumerWidget {
  final ReelModel reel;
  final VoidCallback onDeleted;
  final VoidCallback onEdited;

  const _ReelMenu({
    required this.reel,
    required this.onDeleted,
    required this.onEdited,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A repost has no video of its own — offer "Remove Repost" instead of a
    // "Delete" that would imply wiping the original's video. Reposts also
    // aren't editable (title/product belong to the original).
    final isRepost = reel.originalReelId != null;
    return GestureDetector(
      onTapDown: (details) async {
        final result = await showMenu<String>(
          context: context,
          position: RelativeRect.fromLTRB(
            details.globalPosition.dx,
            details.globalPosition.dy,
            details.globalPosition.dx,
            details.globalPosition.dy,
          ),
          items: [
            if (!isRepost)
              const PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(
              value: 'delete',
              child: Text(
                isRepost ? 'Remove Repost' : 'Delete',
                style: const TextStyle(color: Colors.red),
              ),
            ),
          ],
        );
        if (!context.mounted) return;
        if (result == 'edit') {
          _showEditSheet(context, ref);
        } else if (result == 'delete') {
          _confirmDelete(context, ref, isRepost);
        }
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black45,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(3),
        child: const Icon(Icons.more_vert, color: Colors.white, size: 16),
      ),
    );
  }

  void _showEditSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ProviderScope(
        child: _EditReelSheet(reel: reel, onSaved: onEdited),
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref, bool isRepost) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(isRepost ? 'Remove Repost?' : 'Delete Reel?'),
        content: Text(
          isRepost
              ? 'This will remove the reel from your profile. The original '
                    'post stays untouched.'
              : 'This reel and its video will be permanently removed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.pop(context);
              try {
                final repo = ref.read(reelsRepoProvider);
                if (isRepost) {
                  await repo.undoRepost(reel.id);
                } else {
                  await repo.deleteReel(reel.id);
                }
                ref.invalidate(reelsFeedProvider);
                onDeleted();
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Remove failed: $e')),
                  );
                }
              }
            },
            child: Text(isRepost ? 'Remove' : 'Delete'),
          ),
        ],
      ),
    );
  }
}

// ── Edit reel bottom sheet ────────────────────────────────────────────────────

class _EditReelSheet extends ConsumerStatefulWidget {
  final ReelModel reel;
  final VoidCallback onSaved;

  const _EditReelSheet({required this.reel, required this.onSaved});

  @override
  ConsumerState<_EditReelSheet> createState() => _EditReelSheetState();
}

class _EditReelSheetState extends ConsumerState<_EditReelSheet> {
  late TextEditingController _titleCtrl;
  late TextEditingController _captionCtrl;
  ListingModel? _selectedProduct;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.reel.title);
    _captionCtrl = TextEditingController(text: widget.reel.caption);
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _captionCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
    });
    try {
      await ref
          .read(reelsRepoProvider)
          .updateReel(
            widget.reel.id,
            title: _titleCtrl.text.trim(),
            caption: _captionCtrl.text.trim(),
            linkedProductId:
                _selectedProduct?.catalogId ?? widget.reel.linkedProductId,
            linkedProductName:
                _selectedProduct?.productName ?? widget.reel.linkedProductName,
            linkedProductImageUrl:
                _selectedProduct?.imageUrl ?? widget.reel.linkedProductImageUrl,
          );
      ref.invalidate(reelsFeedProvider);
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Save failed: $e')));
      }
    } finally {
      if (mounted)
        setState(() {
          _saving = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider).value;
    final listingsAsync = user != null
        ? ref.watch(shopListingsProvider(user.phone))
        : const AsyncValue<List<ListingModel>>.data([]);

    return Container(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text('Edit Reel', style: AppTextStyles.heading3),
          const SizedBox(height: 14),
          TextField(
            controller: _titleCtrl,
            maxLines: 1,
            maxLength: 60,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Title',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: AppColors.background,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _captionCtrl,
            maxLines: 3,
            maxLength: 300,
            decoration: InputDecoration(
              labelText: 'Description',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: AppColors.background,
            ),
          ),
          const SizedBox(height: 12),
          Text('Linked Product', style: AppTextStyles.bodyMedium),
          const SizedBox(height: 6),
          listingsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) => const SizedBox.shrink(),
            data: (listings) {
              final active = listings.where((l) => l.isActive).toList();
              return Container(
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.divider),
                  borderRadius: BorderRadius.circular(12),
                  color: Colors.white,
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<ListingModel?>(
                    value: _selectedProduct,
                    isExpanded: true,
                    borderRadius: BorderRadius.circular(12),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    hint: Text(
                      widget.reel.linkedProductName ?? 'None',
                      style: AppTextStyles.body,
                    ),
                    items: [
                      DropdownMenuItem<ListingModel?>(
                        value: null,
                        child: Text(
                          'None',
                          style: AppTextStyles.body.copyWith(
                            color: Colors.black45,
                          ),
                        ),
                      ),
                      ...active.map(
                        (l) => DropdownMenuItem<ListingModel?>(
                          value: l,
                          child: Text(
                            l.productName ?? l.id,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (v) => setState(() {
                      _selectedProduct = v;
                    }),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text('Save Changes'),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Product tile (horizontal list) ────────────────────────────────────────────

class _ProductTile extends StatelessWidget {
  final ListingModel listing;
  const _ProductTile({required this.listing});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/product/${listing.catalogId}'),
      child: Container(
        width: 130,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(11),
              ),
              child: listing.imageUrl != null
                  ? Image.network(
                      listing.imageUrl!,
                      height: 100,
                      width: 130,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _placeholder(),
                    )
                  : _placeholder(),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    listing.productName ?? 'Product',
                    style: AppTextStyles.caption.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '₹${listing.effectivePrice.toStringAsFixed(0)}',
                    style: AppTextStyles.price.copyWith(fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholder() => Container(
    height: 100,
    width: 130,
    color: AppColors.primaryContainer.withValues(alpha: 0.3),
    child: const Icon(Icons.image_outlined, color: AppColors.primary, size: 32),
  );
}

// ── Seller reels feed (fullscreen, from grid tap) ─────────────────────────────

class StandaloneReelsFeed extends ConsumerStatefulWidget {
  final List<ReelModel> reels;
  final int initialIndex;
  final String? currentUserId;
  final String currentUserName;

  const StandaloneReelsFeed({
    required this.reels,
    required this.initialIndex,
    this.currentUserId,
    required this.currentUserName,
  });

  @override
  ConsumerState<StandaloneReelsFeed> createState() =>
      _StandaloneReelsFeedState();
}

class _StandaloneReelsFeedState extends ConsumerState<StandaloneReelsFeed>
    with WidgetsBindingObserver {
  late PageController _pageController;
  final Map<String, VideoPlayerController> _controllers = {};
  late int _currentPage;

  @override
  void initState() {
    super.initState();
    _currentPage = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _ensureController(_currentPage);
      _ensureController(_currentPage + 1);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final c in _controllers.values) {
      c.dispose();
    }
    _pageController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      for (final c in _controllers.values) {
        c.pause();
      }
    } else {
      final id = widget.reels[_currentPage].id;
      _controllers[id]?.play();
    }
  }

  void _ensureController(int index) {
    if (index < 0 || index >= widget.reels.length) return;
    final reel = widget.reels[index];
    if (_controllers.containsKey(reel.id)) return;
    final ctrl = VideoPlayerController.networkUrl(Uri.parse(reel.videoUrl));
    _controllers[reel.id] = ctrl;
    ctrl.initialize().then((_) {
      if (!mounted) return;
      ctrl.setLooping(true);
      if (index == _currentPage) ctrl.play();
      setState(() {});
    });
  }

  void _onPageChanged(int index) {
    _controllers[widget.reels[_currentPage].id]?.pause();
    _currentPage = index;
    _controllers[widget.reels[index].id]?.play();
    _ensureController(index + 1);
    if (index > 0) _ensureController(index - 1);
    final toDispose = _controllers.keys.where((id) {
      final i = widget.reels.indexWhere((r) => r.id == id);
      return i != -1 && (i - index).abs() > 2;
    }).toList();
    for (final id in toDispose) {
      _controllers[id]?.dispose();
      _controllers.remove(id);
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            scrollDirection: Axis.vertical,
            onPageChanged: _onPageChanged,
            itemCount: widget.reels.length,
            itemBuilder: (_, index) {
              final reel = widget.reels[index];
              return _SingleReelView(
                reel: reel,
                controller: _controllers[reel.id],
                currentUserId: widget.currentUserId,
                currentUserName: widget.currentUserName,
              );
            },
          ),
          // Close button
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Align(
                alignment: Alignment.topLeft,
                child: IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Single reel view (reused in seller feed) ──────────────────────────────────

class _SingleReelView extends ConsumerStatefulWidget {
  final ReelModel reel;
  final VideoPlayerController? controller;
  final String? currentUserId;
  final String currentUserName;

  const _SingleReelView({
    required this.reel,
    this.controller,
    this.currentUserId,
    required this.currentUserName,
  });

  @override
  ConsumerState<_SingleReelView> createState() => _SingleReelViewState();
}

class _SingleReelViewState extends ConsumerState<_SingleReelView>
    with SingleTickerProviderStateMixin {
  bool? _isLiked;
  late int _likesCount;
  late int _commentsCount;
  bool _showPause = false;
  bool _reposting = false;
  String? _repostId;
  late AnimationController _likeAnim;
  late Animation<double> _likeScale;

  @override
  void initState() {
    super.initState();
    _likesCount = widget.reel.likesCount;
    _commentsCount = widget.reel.commentsCount;
    _likeAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _likeScale = TweenSequence([
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.0,
          end: 1.4,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 50,
      ),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.4,
          end: 1.0,
        ).chain(CurveTween(curve: Curves.elasticIn)),
        weight: 50,
      ),
    ]).animate(_likeAnim);
    if (widget.currentUserId != null) {
      _loadLike();
      if (widget.currentUserId != widget.reel.shopOwnerId) _loadRepostState();
    }
  }

  @override
  void dispose() {
    _likeAnim.dispose();
    super.dispose();
  }

  Future<void> _loadLike() async {
    final v = await ref
        .read(reelsRepoProvider)
        .isLikedBy(widget.reel.id, widget.currentUserId!);
    if (mounted)
      setState(() {
        _isLiked = v;
      });
  }

  Future<void> _loadRepostState() async {
    final id = await ref
        .read(reelsRepoProvider)
        .myRepostId(
          sourceReel: widget.reel,
          shopOwnerId: widget.currentUserId!,
        );
    if (mounted) setState(() => _repostId = id);
  }

  Future<void> _toggleLike() async {
    if (widget.currentUserId == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Login to like')));
      return;
    }
    final was = _isLiked ?? false;
    setState(() {
      _isLiked = !was;
      _likesCount += was ? -1 : 1;
    });
    if (!was) _likeAnim.forward(from: 0);
    try {
      await ref
          .read(reelsRepoProvider)
          .toggleLike(widget.reel.id, widget.currentUserId!);
    } catch (_) {
      if (mounted)
        setState(() {
          _isLiked = was;
          _likesCount += was ? 1 : -1;
        });
    }
  }

  void _togglePlay() {
    final ctrl = widget.controller;
    if (ctrl == null || !ctrl.value.isInitialized) return;
    setState(() {
      if (ctrl.value.isPlaying) {
        ctrl.pause();
        _showPause = true;
      } else {
        ctrl.play();
        _showPause = false;
      }
    });
    if (_showPause) {
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (mounted)
          setState(() {
            _showPause = false;
          });
      });
    }
  }

  /// One-tap repost / un-repost (see the feed screen for rationale).
  Future<void> _toggleRepost() async {
    final user = ref.read(currentUserProvider).value;
    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Login to repost reels')));
      return;
    }
    if (!user.canAccessDashboard) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'An active seller subscription is required to repost reels.',
          ),
        ),
      );
      return;
    }
    if (_reposting) return;
    setState(() {
      _reposting = true;
    });
    final repo = ref.read(reelsRepoProvider);
    final wasReposted = _repostId != null;
    try {
      if (wasReposted) {
        await repo.undoRepost(_repostId!);
        if (mounted) setState(() => _repostId = null);
      } else {
        final id = await repo.repostReel(
          sourceReel: widget.reel,
          shopOwnerId: user.phone,
          shopName: user.businessName ?? user.name,
          shopProfilePic: null,
        );
        if (mounted) setState(() => _repostId = id);
      }
      ref.invalidate(reelsFeedProvider);
      ref.invalidate(sellerReelsProvider(user.phone));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            wasReposted
                ? 'Removed from your AgriReels profile.'
                : 'Reposted to your AgriReels profile.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'.replaceFirst('Bad state: ', ''))),
      );
    } finally {
      if (mounted)
        setState(() {
          _reposting = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.controller;
    final isOwnReel = widget.currentUserId == widget.reel.shopOwnerId;
    return Stack(
      fit: StackFit.expand,
      children: [
        GestureDetector(
          onTap: _togglePlay,
          child: Container(
            color: Colors.black,
            child: ctrl != null
                ? ValueListenableBuilder<VideoPlayerValue>(
                    valueListenable: ctrl,
                    builder: (_, value, _) {
                      if (!value.isInitialized) {
                        return const Center(
                          child: CircularProgressIndicator(
                            color: Colors.white38,
                            strokeWidth: 2,
                          ),
                        );
                      }
                      return applyReelFilter(
                        widget.reel.filterId,
                        SizedBox.expand(
                          child: FittedBox(
                            fit: BoxFit.cover,
                            child: SizedBox(
                              width: value.size.width,
                              height: value.size.height,
                              child: VideoPlayer(ctrl),
                            ),
                          ),
                        ),
                      );
                    },
                  )
                : const Center(
                    child: CircularProgressIndicator(
                      color: Colors.white38,
                      strokeWidth: 2,
                    ),
                  ),
          ),
        ),
        if (widget.reel.overlayText != null)
          ReelTextOverlay(
            text: widget.reel.overlayText!,
            pos: widget.reel.overlayPos,
          ),
        if (_showPause)
          Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                color: Colors.black45,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.pause_rounded,
                color: Colors.white,
                size: 48,
              ),
            ),
          ),
        // Gradients
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: Container(
            height: 260,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [Color(0xCC000000), Colors.transparent],
              ),
            ),
          ),
        ),
        // Right actions
        Positioned(
          right: 12,
          bottom: 80,
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ScaleTransition(
                  scale: _likeScale,
                  child: GestureDetector(
                    onTap: _toggleLike,
                    child: Column(
                      children: [
                        Icon(
                          _isLiked == true
                              ? Icons.favorite_rounded
                              : Icons.favorite_border_rounded,
                          color: _isLiked == true ? Colors.red : Colors.white,
                          size: 30,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          formatCount(_likesCount),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                GestureDetector(
                  onTap: () => _openComments(context),
                  child: Column(
                    children: [
                      const Icon(
                        Icons.chat_bubble_outline_rounded,
                        color: Colors.white,
                        size: 30,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        formatCount(_commentsCount),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                if (!isOwnReel) ...[
                  const SizedBox(height: 20),
                  _reposting
                      ? const SizedBox(
                          width: 30,
                          height: 30,
                          child: Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        )
                      : GestureDetector(
                          onTap: _toggleRepost,
                          child: Column(
                            children: [
                              Icon(
                                Icons.repeat_rounded,
                                color: _repostId != null
                                    ? const Color(0xFF34C759)
                                    : Colors.white,
                                size: 30,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _repostId != null ? 'Reposted' : 'Repost',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                ],
              ],
            ),
          ),
        ),
        // Bottom info
        Positioned(
          left: 14,
          right: 80,
          bottom: 0,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () =>
                        context.push('/shop/${widget.reel.shopOwnerId}'),
                    child: Text(
                      '@${widget.reel.shopName}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  if (widget.reel.originalShopName != null &&
                      widget.reel.originalShopName!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Reposted from @${widget.reel.originalShopName}',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  if (widget.reel.caption.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      widget.reel.caption,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (widget.reel.linkedProductId != null) ...[
                    const SizedBox(height: 10),
                    _ProductBadge(
                      reel: widget.reel,
                      currentUserId: widget.currentUserId,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _openComments(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ProviderScope(
        child: _CommentSheetSimple(
          reelId: widget.reel.id,
          currentUserId: widget.currentUserId,
          currentUserName: widget.currentUserName,
          onAdded: () {
            if (mounted)
              setState(() {
                _commentsCount++;
              });
          },
        ),
      ),
    );
  }
}

class _ProductBadge extends StatelessWidget {
  final ReelModel reel;
  final String? currentUserId;
  const _ProductBadge({required this.reel, this.currentUserId});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (currentUserId == null) {
          // Carry the product as the post-login destination so the buyer
          // lands right back on it after signing in (or onboarding).
          final dest = Uri.encodeComponent('/product/${reel.linkedProductId}');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Login to view and buy products'),
              action: SnackBarAction(
                label: 'Login',
                onPressed: () => context.push('/login?redirect=$dest'),
              ),
            ),
          );
          return;
        }
        context.push('/product/${reel.linkedProductId}');
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white30),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (reel.linkedProductImageUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Image.network(
                  reel.linkedProductImageUrl!,
                  width: 28,
                  height: 28,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const Icon(
                    Icons.shopping_bag_outlined,
                    color: Colors.white,
                    size: 18,
                  ),
                ),
              )
            else
              const Icon(
                Icons.shopping_bag_outlined,
                color: Colors.white,
                size: 18,
              ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                reel.linkedProductName ?? 'View Product',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.chevron_right_rounded,
              color: Colors.white70,
              size: 16,
            ),
          ],
        ),
      ),
    );
  }
}

class _CommentSheetSimple extends ConsumerStatefulWidget {
  final String reelId;
  final String? currentUserId;
  final String currentUserName;
  final VoidCallback onAdded;
  const _CommentSheetSimple({
    required this.reelId,
    this.currentUserId,
    required this.currentUserName,
    required this.onAdded,
  });

  @override
  ConsumerState<_CommentSheetSimple> createState() =>
      _CommentSheetSimpleState();
}

class _CommentSheetSimpleState extends ConsumerState<_CommentSheetSimple> {
  final _ctrl = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_ctrl.text.trim().isEmpty) return;
    if (widget.currentUserId == null) return;
    setState(() {
      _busy = true;
    });
    try {
      await ref
          .read(reelsRepoProvider)
          .addComment(
            widget.reelId,
            widget.currentUserId!,
            widget.currentUserName,
            _ctrl.text.trim(),
          );
      _ctrl.clear();
      widget.onAdded();
    } finally {
      if (mounted)
        setState(() {
          _busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(reelCommentsProvider(widget.reelId));
    return Container(
      height: MediaQuery.of(context).size.height * 0.7,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 10),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Text('Comments', style: AppTextStyles.heading3),
          const Divider(height: 12),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, _) => const Center(child: Text('Could not load.')),
              data: (comments) => comments.isEmpty
                  ? const Center(
                      child: Text(
                        'No comments yet.',
                        style: TextStyle(color: Colors.black45),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: comments.length,
                      itemBuilder: (_, i) {
                        final c = comments[i];
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              CircleAvatar(
                                radius: 16,
                                backgroundColor: AppColors.primaryContainer,
                                child: Text(
                                  c.userName.isNotEmpty
                                      ? c.userName[0].toUpperCase()
                                      : '?',
                                  style: const TextStyle(
                                    color: AppColors.primary,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      c.userName,
                                      style: AppTextStyles.caption.copyWith(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    Text(
                                      c.text,
                                      style: AppTextStyles.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ),
          Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 8,
              top: 8,
              bottom: MediaQuery.of(context).viewInsets.bottom + 12,
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _ctrl,
                    enabled: widget.currentUserId != null,
                    decoration: InputDecoration(
                      hintText: widget.currentUserId == null
                          ? 'Login to comment...'
                          : 'Add a comment...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      isDense: true,
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                IconButton(
                  onPressed: _busy ? null : _send,
                  icon: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(
                          Icons.send_rounded,
                          color: AppColors.primary,
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
