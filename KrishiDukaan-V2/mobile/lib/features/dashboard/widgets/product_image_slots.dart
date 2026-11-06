import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';

/// The product photos on the add/edit product sheets, shown as small
/// thumbnails — never as the Storage link behind them. Sellers used to see an
/// editable "Main image URL" field holding a long Firebase URL; typing into it
/// broke the image.
///
/// [urls] and [files] are the sheet's fixed-length slot lists (same index =
/// same slot): a picked [File] wins over a saved URL and is uploaded when the
/// sheet saves, as before. This widget only changes them in place and calls
/// [onChanged] so the sheet can setState.
class ProductImageSlots extends StatelessWidget {
  final List<String> urls;
  final List<File?> files;
  final VoidCallback onChanged;

  const ProductImageSlots({
    super.key,
    required this.urls,
    required this.files,
    required this.onChanged,
  });

  static const double _tile = 76;

  bool _filled(int i) => files[i] != null || urls[i].trim().isNotEmpty;

  Future<void> _pick(BuildContext context, int index) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    // Resized and re-encoded as JPEG on the phone before upload: a 12 MP
    // camera photo comes out around 100–250 KB instead of several MB.
    final xFile = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1200,
      maxHeight: 1200,
      imageQuality: 80,
    );
    if (xFile == null || !context.mounted) return;
    final file = File(xFile.path);
    if (await file.length() > 5 * 1024 * 1024) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Image must be less than 5MB')),
        );
      }
      return;
    }
    files[index] = file;
    onChanged();
  }

  void _remove(int index) {
    files[index] = null;
    urls[index] = '';
    onChanged();
  }

  Widget _thumb(int i) {
    final file = files[i];
    final image = file != null
        ? Image.file(file, fit: BoxFit.cover, cacheWidth: 228)
        : CachedNetworkImage(
            imageUrl: urls[i].trim(),
            fit: BoxFit.cover,
            memCacheWidth: 228,
            errorWidget: (_, _, _) => const Icon(
              Icons.broken_image_outlined,
              color: AppColors.onSurfaceVariant,
            ),
          );
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(width: _tile, height: _tile, child: image),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filled = [
      for (var i = 0; i < files.length; i++)
        if (_filled(i)) i,
    ];
    final firstEmpty = List.generate(
      files.length,
      (i) => i,
    ).where((i) => !_filled(i)).firstOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final i in filled)
              Stack(
                clipBehavior: Clip.none,
                children: [
                  GestureDetector(
                    onTap: () => _pick(context, i),
                    child: _thumb(i),
                  ),
                  if (i == filled.first)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        decoration: const BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.vertical(
                            bottom: Radius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'Main',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    top: -6,
                    right: -6,
                    child: Material(
                      color: Colors.white,
                      shape: const CircleBorder(),
                      elevation: 1,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () => _remove(i),
                        child: const Padding(
                          padding: EdgeInsets.all(3),
                          child: Icon(
                            Icons.close,
                            size: 16,
                            color: AppColors.error,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            if (firstEmpty != null)
              InkWell(
                onTap: () => _pick(context, firstEmpty),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: _tile,
                  height: _tile,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceVariant,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.add_photo_alternate_outlined,
                        color: AppColors.onSurfaceVariant,
                      ),
                      const SizedBox(height: 2),
                      Text('Add photo', style: AppTextStyles.caption),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'Tap a photo to change it. The first photo is the main one.',
          style: AppTextStyles.caption.copyWith(
            color: AppColors.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
