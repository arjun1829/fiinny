import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../reels/data/reels_repository.dart';
import '../../reels/providers/reels_provider.dart';
import '../../reels/widgets/reel_share_sheet.dart';

/// Seller "manage my reels" screen — mirrors web's /dashboard/reels (grid of
/// own reels with upload/edit/delete), reusing the existing
/// ReelsRepository.fetchSellerReels/updateReel/deleteReel (already used by
/// ShopProfileScreen's owner-mode reel menu). This replaces the Dashboard
/// drawer's old "Reels" link, which incorrectly pointed at the consumer-facing
/// bottom-nav Reels feed (`/reels`) instead of a management screen — besides
/// showing the wrong content, that route sits inside the app's tab shell and
/// has no back button, which is why it read as "no way back".
class DashboardReelsScreen extends ConsumerWidget {
  const DashboardReelsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sellerUserProvider).value;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Reels',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            tooltip: 'Upload Reel',
            onPressed: () => context.push('/reels/upload'),
          ),
        ],
      ),
      body: user == null
          ? const Center(child: Text('Not logged in.'))
          : _Body(phone: user.phone),
    );
  }
}

class _Body extends ConsumerWidget {
  final String phone;
  const _Body({required this.phone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reelsAsync = ref.watch(sellerReelsProvider(phone));

    return reelsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const Center(child: Text('Failed to load reels.')),
      data: (reels) {
        if (reels.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.video_collection_outlined,
                    size: 48, color: AppColors.onSurfaceVariant),
                const SizedBox(height: 12),
                Text('No reels yet', style: AppTextStyles.bodyMedium),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/reels/upload'),
                  icon: const Icon(Icons.add),
                  label: const Text('Upload Reel'),
                ),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(sellerReelsProvider(phone)),
          child: GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 0.72,
            ),
            itemCount: reels.length,
            itemBuilder: (context, i) => _ReelTile(
              reel: reels[i],
              onChanged: () => ref.invalidate(sellerReelsProvider(phone)),
            ),
          ),
        );
      },
    );
  }
}

class _ReelTile extends StatelessWidget {
  final ReelModel reel;
  final VoidCallback onChanged;
  const _ReelTile({required this.reel, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(
            color: AppColors.surfaceVariant,
            child: reel.thumbnailUrl != null
                ? CachedNetworkImage(
                    imageUrl: reel.thumbnailUrl!,
                    fit: BoxFit.cover,
                    memCacheWidth: 400,
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  )
                : const Icon(Icons.videocam_outlined,
                    size: 32, color: AppColors.onSurfaceVariant),
          ),
          Positioned(
            top: 4,
            right: 4,
            child: PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: Colors.white),
              color: Colors.white,
              onSelected: (value) {
                if (value == 'share') {
                  showReelShareSheet(context, reel);
                } else if (value == 'edit') {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => _EditReelSheet(reel: reel, onSaved: onChanged),
                  );
                } else if (value == 'delete') {
                  _confirmDelete(context);
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'share', child: Text('Share')),
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 20, 10, 8),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black.withValues(alpha: 0.75)],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    reel.title.isNotEmpty ? reel.title : reel.caption,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.play_arrow, size: 12, color: Colors.white70),
                      Text(' ${reel.viewsCount}',
                          style: const TextStyle(color: Colors.white70, fontSize: 10)),
                      const SizedBox(width: 8),
                      const Icon(Icons.favorite, size: 12, color: Colors.white70),
                      Text(' ${reel.likesCount}',
                          style: const TextStyle(color: Colors.white70, fontSize: 10)),
                      const Spacer(),
                      // Sellers share their own reels to WhatsApp & co.
                      Material(
                        color: Colors.white,
                        shape: const StadiumBorder(),
                        child: InkWell(
                          customBorder: const StadiumBorder(),
                          onTap: () => showReelShareSheet(context, reel),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.share_rounded, size: 12, color: AppColors.primary),
                                SizedBox(width: 4),
                                Text('Share',
                                    style: TextStyle(
                                        color: AppColors.primary,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete Reel'),
        content: const Text('This permanently deletes the reel. This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await ReelsRepository().deleteReel(reel.id);
              onChanged();
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class _EditReelSheet extends ConsumerStatefulWidget {
  final ReelModel reel;
  final VoidCallback onSaved;
  const _EditReelSheet({required this.reel, required this.onSaved});

  @override
  ConsumerState<_EditReelSheet> createState() => _EditReelSheetState();
}

class _EditReelSheetState extends ConsumerState<_EditReelSheet> {
  late final _titleCtrl = TextEditingController(text: widget.reel.title);
  late final _captionCtrl = TextEditingController(text: widget.reel.caption);
  ListingModel? _selectedProduct;
  // Distinguishes "user never touched the dropdown" (keep the existing link
  // unchanged) from "user explicitly picked None" (clear it) — without this,
  // selecting None and falling back to the old value via `??` made it
  // impossible to ever actually remove a linked product.
  bool _productTouched = false;
  bool _saving = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _captionCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(reelsRepoProvider).updateReel(
        widget.reel.id,
        title: _titleCtrl.text.trim(),
        caption: _captionCtrl.text.trim(),
        linkedProductId:
            _productTouched ? _selectedProduct?.catalogId : widget.reel.linkedProductId,
        linkedProductName:
            _productTouched ? _selectedProduct?.productName : widget.reel.linkedProductName,
        linkedProductImageUrl: _productTouched
            ? _selectedProduct?.imageUrl
            : widget.reel.linkedProductImageUrl,
      );
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed to save: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;
    final user = ref.watch(sellerUserProvider).value;
    final listingsAsync = user != null
        ? ref.watch(shopListingsProvider(user.phone))
        : const AsyncValue<List<ListingModel>>.data([]);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Edit Reel', style: AppTextStyles.heading2),
          const SizedBox(height: 16),
          TextField(
            controller: _titleCtrl,
            decoration: InputDecoration(
              labelText: 'Title',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _captionCtrl,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Caption',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
                          style: AppTextStyles.body.copyWith(color: Colors.black45),
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
                      _productTouched = true;
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
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}
