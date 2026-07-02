import 'dart:io' show File;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_compress/video_compress.dart';
import 'package:video_player/video_player.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../dashboard/providers/dashboard_provider.dart';
import '../providers/reels_provider.dart';

class ReelUploadScreen extends ConsumerStatefulWidget {
  const ReelUploadScreen({super.key});

  @override
  ConsumerState<ReelUploadScreen> createState() => _ReelUploadScreenState();
}

class _ReelUploadScreenState extends ConsumerState<ReelUploadScreen> {
  XFile? _pickedFile;
  VideoPlayerController? _previewController;
  final _titleController = TextEditingController();
  final _captionController = TextEditingController();
  final _tagSearchController = TextEditingController();
  ListingModel? _selectedProduct;
  final List<Map<String, dynamic>> _taggedShops = [];
  List<Map<String, dynamic>> _tagSuggestions = [];
  bool _tagSearching = false;

  // Two-phase progress: compress (mobile-only) → upload
  bool _processing = false;
  bool _compressing = false;
  double _compressProgress = 0;
  double _uploadProgress = 0;
  Subscription? _compressSubscription;

  @override
  void dispose() {
    if (!kIsWeb) {
      _compressSubscription?.unsubscribe();
      VideoCompress.cancelCompression();
    }
    _previewController?.dispose();
    _titleController.dispose();
    _captionController.dispose();
    _tagSearchController.dispose();
    super.dispose();
  }

  Future<void> _searchTags(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      if (mounted) setState(() => _tagSuggestions = []);
      return;
    }
    if (mounted) setState(() => _tagSearching = true);
    final repo = ref.read(reelsRepoProvider);
    final results = await repo.searchShops(q);
    if (!mounted) return;
    // Exclude already-tagged and self
    final user = ref.read(currentUserProvider).value;
    final excluded = {
      ..._taggedShops.map((t) => t['phone'] as String),
      if (user != null) user.phone,
    };
    setState(() {
      _tagSuggestions =
          results.where((r) => !excluded.contains(r['phone'])).toList();
      _tagSearching = false;
    });
  }

  // Reels are short-form. Capping length keeps files small — fast uploads and
  // playback on rural networks, and low storage/bandwidth cost. image_picker's
  // maxDuration isn't enforced for gallery picks on most platforms, so we also
  // verify the real duration once the video loads (works on web + mobile).
  static const _maxReelDuration = Duration(seconds: 90);

  Future<void> _pickVideo() async {
    final picker = ImagePicker();
    final picked = await picker.pickVideo(
      source: ImageSource.gallery,
      maxDuration: _maxReelDuration,
    );
    if (picked == null) return;

    // On web, picked.path is a blob:// URL — networkUrl works with it.
    // On mobile, we use the file path directly.
    final controller = kIsWeb
        ? VideoPlayerController.networkUrl(Uri.parse(picked.path))
        : VideoPlayerController.file(File(picked.path));

    await controller.initialize();

    // Enforce the cap ourselves — gallery picks ignore maxDuration on most
    // platforms. Keep the previous selection if the new one is too long.
    if (controller.value.duration > _maxReelDuration) {
      await controller.dispose();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please choose a video under 90 seconds.'),
          ),
        );
      }
      return;
    }

    _previewController?.dispose();
    controller.setLooping(true);
    controller.play();

    setState(() {
      _pickedFile = picked;
      _previewController = controller;
    });
  }

  Future<void> _upload() async {
    if (_pickedFile == null) return;
    final user = ref.read(currentUserProvider).value;
    if (user == null) return;

    setState(() {
      _processing = true;
      _compressing = !kIsWeb; // web skips compression phase
      _compressProgress = 0;
      _uploadProgress = 0;
    });

    try {
      File? fileToUpload;
      File? thumbnailFile;

      if (!kIsWeb) {
        // ── Phase 1: Compress (mobile only) ───────────────────────────
        _compressSubscription =
            VideoCompress.compressProgress$.subscribe((progress) {
          if (mounted) setState(() { _compressProgress = progress / 100; });
        });

        final info = await VideoCompress.compressVideo(
          _pickedFile!.path,
          quality: VideoQuality.MediumQuality,
          deleteOrigin: false,
          includeAudio: true,
        );

        _compressSubscription?.unsubscribe();
        _compressSubscription = null;

        fileToUpload =
            info?.file ?? File(_pickedFile!.path);

        // Grab a poster frame so the reel shows a real thumbnail in lists
        // (product page, shop grid). Best-effort — never block the upload.
        try {
          thumbnailFile = await VideoCompress.getFileThumbnail(
            fileToUpload.path,
            quality: 75,
          );
        } catch (_) {}

        if (mounted) setState(() { _compressing = false; });
      }

      // ── Phase 2: Upload ──────────────────────────────────────────────
      final bytes = kIsWeb ? await _pickedFile!.readAsBytes() : null;

      await ref.read(reelsRepoProvider).uploadReel(
            shopOwnerId: user.phone,
            shopName: user.businessName ?? user.name,
            videoFile: fileToUpload,
            videoBytes: bytes,
            thumbnailFile: thumbnailFile,
            title: _titleController.text.trim(),
            caption: _captionController.text.trim(),
            linkedProductId: _selectedProduct?.catalogId,
            linkedProductName: _selectedProduct?.productName,
            linkedProductImageUrl: _selectedProduct?.imageUrl,
            taggedShops: List.from(_taggedShops),
            onProgress: (p) {
              if (mounted) setState(() { _uploadProgress = p; });
            },
          );

      ref.invalidate(reelsFeedProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reel posted!')),
        );
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/reels');
        }
      }
    } catch (e) {
      if (!kIsWeb) {
        _compressSubscription?.unsubscribe();
        _compressSubscription = null;
        VideoCompress.cancelCompression();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() { _processing = false; _compressing = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider).value;
    final listingsAsync = user != null
        ? ref.watch(myListingsProvider(user.phone))
        : const AsyncValue<List<ListingModel>>.data([]);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        flexibleSpace: Container(
          decoration: BoxDecoration(gradient: topBarGradient()),
        ),
        titleSpacing: 16,
        title: Text(
          'New Reel',
          style: AppTextStyles.heading2.copyWith(color: Colors.white),
        ),
        actions: [
          if (_pickedFile != null && !_processing)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.secondary,
                  foregroundColor: Colors.white,
                ),
                onPressed: _upload,
                child: const Text('Post'),
              ),
            ),
        ],
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Video picker / preview ────────────────────────────────
                GestureDetector(
                  onTap: _processing ? null : _pickVideo,
                  child: Container(
                    width: double.infinity,
                    height: 280,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.divider),
                    ),
                    child: _previewController != null &&
                            _previewController!.value.isInitialized
                        ? Stack(
                            alignment: Alignment.center,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(15),
                                child: AspectRatio(
                                  aspectRatio: _previewController!
                                      .value.aspectRatio,
                                  child: VideoPlayer(_previewController!),
                                ),
                              ),
                              Positioned(
                                bottom: 12,
                                right: 12,
                                child: GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      if (_previewController!
                                          .value.isPlaying) {
                                        _previewController!.pause();
                                      } else {
                                        _previewController!.play();
                                      }
                                    });
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: const BoxDecoration(
                                      color: Colors.black54,
                                      shape: BoxShape.circle,
                                    ),
                                    child: Icon(
                                      _previewController!.value.isPlaying
                                          ? Icons.pause_rounded
                                          : Icons.play_arrow_rounded,
                                      color: Colors.white,
                                      size: 20,
                                    ),
                                  ),
                                ),
                              ),
                              Positioned(
                                top: 12,
                                right: 12,
                                child: GestureDetector(
                                  onTap: _processing ? null : _pickVideo,
                                  child: Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: const BoxDecoration(
                                      color: Colors.black54,
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.edit_rounded,
                                      color: Colors.white,
                                      size: 18,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          )
                        : Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.video_library_outlined,
                                  color: Colors.white54, size: 52),
                              const SizedBox(height: 12),
                              Text(
                                'Tap to choose a video',
                                style: AppTextStyles.bodyMedium
                                    .copyWith(color: Colors.white70),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Max 90 seconds',
                                style: AppTextStyles.caption
                                    .copyWith(color: Colors.white38),
                              ),
                            ],
                          ),
                  ),
                ),
                const SizedBox(height: 20),

                // ── Title ────────────────────────────────────────────────
                Text('Title', style: AppTextStyles.heading3),
                const SizedBox(height: 8),
                TextField(
                  controller: _titleController,
                  enabled: !_processing,
                  maxLines: 1,
                  maxLength: 60,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: 'e.g. New wheat spray now available!',
                    hintStyle: AppTextStyles.body
                        .copyWith(color: Colors.black38),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),

                // ── Description ───────────────────────────────────────────
                Text('Description', style: AppTextStyles.heading3),
                const SizedBox(height: 8),
                TextField(
                  controller: _captionController,
                  enabled: !_processing,
                  maxLines: 3,
                  maxLength: 300,
                  decoration: InputDecoration(
                    hintText: 'Tell viewers more about this reel...',
                    hintStyle: AppTextStyles.body
                        .copyWith(color: Colors.black38),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 20),

                // ── Link a product ────────────────────────────────────────
                Text('Link a Product (Optional)',
                    style: AppTextStyles.heading3),
                const SizedBox(height: 4),
                Text(
                  'Viewers can tap this to buy directly.',
                  style:
                      AppTextStyles.caption.copyWith(color: AppColors.onSurfaceVariant),
                ),
                const SizedBox(height: 8),
                listingsAsync.when(
                  loading: () => const Center(
                    child: Padding(
                      padding: EdgeInsets.all(12),
                      child: CircularProgressIndicator(),
                    ),
                  ),
                  error: (_, _) => Text(
                    'Could not load your products.',
                    style: AppTextStyles.caption
                        .copyWith(color: AppColors.error),
                  ),
                  data: (listings) {
                    final active =
                        listings.where((l) => l.isActive).toList();
                    if (active.isEmpty) {
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.divider),
                        ),
                        child: Text(
                          'No products in your inventory yet.',
                          style: AppTextStyles.body
                              .copyWith(color: Colors.black45),
                        ),
                      );
                    }
                    return Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.divider),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<ListingModel?>(
                          value: _selectedProduct,
                          isExpanded: true,
                          borderRadius: BorderRadius.circular(12),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          hint: Text('Select a product',
                              style: AppTextStyles.body
                                  .copyWith(color: Colors.black38)),
                          items: [
                            DropdownMenuItem<ListingModel?>(
                              value: null,
                              child: Text('None',
                                  style: AppTextStyles.body
                                      .copyWith(color: Colors.black45)),
                            ),
                            ...active.map((listing) {
                              return DropdownMenuItem<ListingModel?>(
                                value: listing,
                                child: Text(
                                  listing.productName ?? listing.id,
                                  style: AppTextStyles.body,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              );
                            }),
                          ],
                          onChanged: _processing
                              ? null
                              : (value) =>
                                  setState(() { _selectedProduct = value; }),
                        ),
                      ),
                    );
                  },
                ),

                // Selected product preview
                if (_selectedProduct != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.shopping_bag_outlined,
                            color: AppColors.primary, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _selectedProduct!.productName ??
                                _selectedProduct!.id,
                            style: AppTextStyles.bodyMedium
                                .copyWith(color: AppColors.primary),
                          ),
                        ),
                        Text(
                          '₹${_selectedProduct!.effectivePrice.toStringAsFixed(0)}',
                          style: AppTextStyles.price,
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 20),

                // ── Tag sellers (collaboration) ───────────────────────────
                Text('Tag Sellers (Collaboration)',
                    style: AppTextStyles.heading3),
                const SizedBox(height: 4),
                Text(
                  'Tagged sellers will show this reel on their shop profile.',
                  style: AppTextStyles.caption
                      .copyWith(color: AppColors.onSurfaceVariant),
                ),
                const SizedBox(height: 8),

                // Chips of already-tagged sellers
                if (_taggedShops.isNotEmpty) ...[
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: _taggedShops.map((shop) {
                      return Chip(
                        avatar: const Icon(Icons.storefront_outlined, size: 14),
                        label: Text(
                          shop['username'] != null
                              ? '@${shop['username']}'
                              : (shop['businessName'] as String? ?? ''),
                          style: const TextStyle(fontSize: 12),
                        ),
                        deleteIcon: const Icon(Icons.close, size: 14),
                        onDeleted: _processing
                            ? null
                            : () => setState(
                                () => _taggedShops.remove(shop)),
                        backgroundColor: AppColors.primaryContainer
                            .withValues(alpha: 0.3),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 8),
                ],

                // Search field
                TextField(
                  controller: _tagSearchController,
                  enabled: !_processing,
                  decoration: InputDecoration(
                    hintText: 'Search by @username or shop name…',
                    prefixIcon: _tagSearching
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          )
                        : const Icon(Icons.person_add_alt_1_outlined),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                  onChanged: (v) {
                    _searchTags(v);
                  },
                ),

                // Suggestions dropdown
                if (_tagSuggestions.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 160),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: AppColors.divider),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: ListView(
                      shrinkWrap: true,
                      children: _tagSuggestions.map((shop) {
                        return ListTile(
                          leading: CircleAvatar(
                            radius: 16,
                            backgroundColor: AppColors.primaryContainer,
                            child: Text(
                              (shop['businessName'] as String? ?? '?')
                                  .substring(0, 1)
                                  .toUpperCase(),
                              style: TextStyle(
                                  color: AppColors.primary, fontSize: 12),
                            ),
                          ),
                          title: Text(shop['businessName'] ?? ''),
                          subtitle: shop['username'] != null
                              ? Text(
                                  '@${shop['username']}',
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.primary),
                                )
                              : null,
                          onTap: () => setState(() {
                            _taggedShops.add(shop);
                            _tagSuggestions = [];
                            _tagSearchController.clear();
                          }),
                        );
                      }).toList(),
                    ),
                  ),
                ],

                const SizedBox(height: 32),

                // ── Post button ───────────────────────────────────────────
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: _pickedFile != null
                          ? AppColors.primary
                          : AppColors.divider,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed:
                        (_pickedFile != null && !_processing) ? _upload : null,
                    icon: const Icon(Icons.upload_rounded),
                    label: Text(
                      _pickedFile == null ? 'Pick a video first' : 'Post Reel',
                      style: AppTextStyles.button
                          .copyWith(color: Colors.white),
                    ),
                  ),
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),

          // ── Processing overlay (compress + upload) ────────────────────
          if (_processing)
            Container(
              color: Colors.black54,
              child: Center(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 40),
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _compressing
                            ? Icons.compress_rounded
                            : Icons.cloud_upload_outlined,
                        color: AppColors.primary,
                        size: 40,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _compressing
                            ? 'Compressing video...'
                            : 'Uploading reel...',
                        style: AppTextStyles.bodyMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _compressing
                            ? 'Reducing file size — quality stays great'
                            : 'Saving to cloud storage',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.onSurfaceVariant),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),

                      // Phase 1: Compress (mobile only)
                      if (!kIsWeb) ...[
                        _PhaseRow(
                          label: 'Compress',
                          progress: _compressing ? _compressProgress : 1.0,
                          done: !_compressing,
                        ),
                        const SizedBox(height: 10),
                      ],

                      // Phase 2: Upload
                      _PhaseRow(
                        label: 'Upload',
                        progress: _compressing ? 0 : _uploadProgress,
                        done: false,
                        dimmed: _compressing,
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PhaseRow extends StatelessWidget {
  final String label;
  final double progress;
  final bool done;
  final bool dimmed;

  const _PhaseRow({
    required this.label,
    required this.progress,
    required this.done,
    this.dimmed = false,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: dimmed ? 0.35 : 1.0,
      child: Row(
        children: [
          SizedBox(
            width: 18,
            height: 18,
            child: done
                ? const Icon(Icons.check_circle_rounded,
                    color: AppColors.primary, size: 18)
                : CircularProgressIndicator(
                    value: progress > 0 ? progress : null,
                    strokeWidth: 2,
                    color: AppColors.primary,
                  ),
          ),
          const SizedBox(width: 10),
          Text(label, style: AppTextStyles.bodyMedium),
          const Spacer(),
          Text(
            done
                ? 'Done'
                : progress > 0
                    ? '${(progress * 100).toStringAsFixed(0)}%'
                    : '—',
            style: AppTextStyles.caption
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
