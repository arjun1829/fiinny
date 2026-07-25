import 'dart:async' show unawaited;
import 'dart:io' show File;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_compress/video_compress.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart' as vt;
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../dashboard/providers/dashboard_provider.dart';
import '../providers/reels_provider.dart';
import '../widgets/reel_filters.dart';
import 'reel_edit_screen.dart';

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

  // Edits from ReelEditScreen (trim/filter/text). Null until the seller
  // opens the editor; cleared when a different video is picked.
  ReelEditResult? _edit;

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
  static const _maxReelDuration = Duration(minutes: 3);

  // Raw (pre-compression) file-size guardrail. Videos exported from other
  // apps (Instagram, WhatsApp forwards, etc.) can carry a much higher
  // bitrate than the same duration recorded/exported from YouTube, so a
  // clip well under the length cap can still be huge. Duration alone
  // doesn't catch this — a large file can silently take minutes to
  // compress + upload, long enough for the auth session to lapse mid-upload
  // and surface as a confusing "not authorized" error instead of a clear
  // size warning. Threshold is sized for a full 3-minute clip at a normal
  // bitrate — only flags files that are unusually heavy for their length.
  static const _largeFileWarningBytes = 300 * 1024 * 1024; // 300MB

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
            content: Text('Please choose a video under 3 minutes.'),
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
      _edit = null; // edits belong to the previous video
    });

    // Warn (don't block) on large raw files, before compression/upload ever
    // starts — trimming it down in the editor first shrinks the compressed
    // output and avoids a long, fragile upload.
    final sizeBytes = await picked.length();
    if (sizeBytes > _largeFileWarningBytes && mounted) {
      final sizeMb = (sizeBytes / (1024 * 1024)).round();
      final trimNow = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('This video is quite large'),
          content: Text(
            'This video is about ${sizeMb}MB. Large files can take a long '
            'time to upload and are more likely to fail partway through. '
            'We recommend trimming it in the editor first.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Continue Anyway'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Trim Now'),
            ),
          ],
        ),
      );
      if (trimNow == true && !kIsWeb && mounted) {
        await _openEditor();
      }
    }
  }

  Future<void> _openEditor() async {
    if (_pickedFile == null || kIsWeb) return;
    _previewController?.pause();
    final result = await Navigator.of(context, rootNavigator: true)
        .push<ReelEditResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => ReelEditScreen(
          videoPath: _pickedFile!.path,
          initial: _edit,
        ),
      ),
    );
    if (result != null && mounted) {
      setState(() => _edit = result);
      // Preview from the trim start so what you see is what gets posted.
      await _previewController?.seekTo(result.trimStart);
    }
    _previewController?.play();
  }

  /// Extracts a poster-frame JPEG from the video at [videoPath]. Returns null
  /// (never throws) so callers can retry against a different source file or
  /// give up and post without a thumbnail.
  Future<File?> _generateThumbnail(String videoPath) async {
    try {
      final path = await vt.VideoThumbnail.thumbnailFile(
        video: videoPath,
        imageFormat: vt.ImageFormat.JPEG,
        maxWidth: 480,
        quality: 75,
      );
      if (path == null) return null;
      final file = File(path);
      return await file.exists() ? file : null;
    } catch (_) {
      return null;
    }
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

        // Trim (from the editor) is burned into the file here — video_compress
        // transcodes natively between startTime/duration, no ffmpeg needed.
        int? trimStartSec;
        int? trimDurationSec;
        final edit = _edit;
        final totalDuration = _previewController?.value.duration;
        if (edit != null &&
            totalDuration != null &&
            edit.trimsVideo(totalDuration)) {
          trimStartSec = edit.trimStart.inSeconds;
          trimDurationSec =
              (edit.trimEnd - edit.trimStart).inSeconds.clamp(1, maxReelSeconds);
        }

        // Always pass an explicit duration, even when the user never opened the
        // editor.
        //
        // Previously `duration` stayed null on the untrimmed path, so a picked
        // clip uploaded at its full length — a 3-minute video stayed 3 minutes
        // and shipped tens of megabytes that every viewer then downloaded before
        // the first frame could render. The cap was only ever applied to people
        // who happened to trim.
        trimDurationSec ??= totalDuration != null
            ? totalDuration.inSeconds.clamp(1, maxReelSeconds)
            : maxReelSeconds;

        final info = await VideoCompress.compressVideo(
          _pickedFile!.path,
          quality: VideoQuality.MediumQuality,
          deleteOrigin: false,
          includeAudio: true,
          startTime: trimStartSec ?? 0,
          duration: trimDurationSec,
        );

        _compressSubscription?.unsubscribe();
        _compressSubscription = null;

        fileToUpload =
            info?.file ?? File(_pickedFile!.path);

        // Grab a poster frame so the reel shows a real thumbnail in lists
        // (product page, shop grid) instead of a plain color card. Uses
        // video_thumbnail (native MediaMetadataRetriever/AVAssetImageGenerator)
        // rather than video_compress's own getFileThumbnail — that call was
        // found to fail silently on every single upload in production (every
        // live reel had a video.mp4 in Storage but zero had a thumb.jpg).
        // One retry on the original picked file covers the case where the
        // freshly-compressed output isn't fully flushed to disk yet. Still
        // best-effort — a missing thumbnail must never block the reel post,
        // but a real failure is now logged instead of silently swallowed so
        // this can't regress back to invisible again.
        thumbnailFile = await _generateThumbnail(fileToUpload.path);
        thumbnailFile ??= await _generateThumbnail(_pickedFile!.path);
        if (thumbnailFile == null) {
          unawaited(FirebaseCrashlytics.instance.recordError(
            'Reel thumbnail generation failed after retry',
            null,
            reason: 'reel_upload_thumbnail_missing',
            fatal: false,
          ));
        }

        if (mounted) setState(() { _compressing = false; });
      }

      // ── Phase 2: Upload ──────────────────────────────────────────────
      // Force a fresh ID token before the upload + Firestore write. Large
      // files (compression can itself take a minute or two on big Instagram
      // exports) risk starting the upload on a token that's about to expire,
      // which surfaces as a "not authorized" Storage/Firestore error rather
      // than anything duration- or size-related.
      await FirebaseAuth.instance.currentUser?.getIdToken(true);

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
            filterId: _edit?.filterId,
            overlayText: _edit?.overlayText,
            overlayPos: _edit?.overlayPos,
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
          SnackBar(content: Text(_uploadErrorMessage(e))),
        );
      }
    } finally {
      if (mounted) setState(() { _processing = false; _compressing = false; });
    }
  }

  /// Translates the raw exception into something the seller can act on.
  /// "not authorized" / permission-denied here almost never means the video
  /// was too long or too big — that's already caught earlier (duration cap
  /// in [_pickVideo], size warning above) with its own clear message. It
  /// means the auth session lapsed during a slow compress+upload — most
  /// often on a large file over a weak connection — so guide the seller
  /// toward retrying (ideally after trimming) rather than showing the raw
  /// Firebase exception text.
  String _uploadErrorMessage(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('permission-denied') ||
        msg.contains('unauthorized') ||
        msg.contains('not authorized') ||
        msg.contains('user-token-expired')) {
      return 'Upload failed — your session expired, likely because this '
          'video took a while to upload. Please try posting again; trimming '
          'it shorter first can help on a slow connection.';
    }
    if (msg.contains('network') || msg.contains('timeout')) {
      return 'Upload failed due to a network issue. Please check your '
          'connection and try again.';
    }
    return 'Failed to post reel: $e';
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
        foregroundColor: AppColors.onSurface,
        systemOverlayStyle: topBarOverlayStyle,
        flexibleSpace: const TopBarBackdrop(),
        titleSpacing: 16,
        title: Text(
          'New Reel',
          style: AppTextStyles.heading2.copyWith(
              color: AppColors.onSurface, fontWeight: FontWeight.w800),
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
                                  child: Stack(
                                    fit: StackFit.expand,
                                    children: [
                                      applyReelFilter(
                                        _edit?.filterId,
                                        VideoPlayer(_previewController!),
                                      ),
                                      if (_edit != null)
                                        ReelTextOverlay(
                                          text: _edit!.overlayText,
                                          pos: _edit!.overlayPos,
                                          compact: true,
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                              // Edit (trim / filter / text) — mobile only
                              if (!kIsWeb)
                                Positioned(
                                  top: 12,
                                  left: 12,
                                  child: GestureDetector(
                                    onTap: _processing ? null : _openEditor,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 7),
                                      decoration: BoxDecoration(
                                        color: Colors.black54,
                                        borderRadius:
                                            BorderRadius.circular(20),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            _edit == null
                                                ? Icons.tune_rounded
                                                : Icons.check_circle_rounded,
                                            color: _edit == null
                                                ? Colors.white
                                                : AppColors.secondary,
                                            size: 16,
                                          ),
                                          const SizedBox(width: 5),
                                          Text(
                                            _edit == null
                                                ? 'Edit'
                                                : 'Edited',
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
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
                                'Max 3 minutes',
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
                Row(
                  children: [
                    Text('Tag Sellers (Collaboration)',
                        style: AppTextStyles.heading3),
                    if (_taggedShops.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '${_taggedShops.length}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Add one or more sellers to collaborate — this reel appears '
                  'on every tagged seller\'s profile too.',
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
