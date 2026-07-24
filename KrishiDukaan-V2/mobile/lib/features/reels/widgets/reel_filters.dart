import 'package:flutter/material.dart';

/// Reel look filters + text overlay rendering.
///
/// Filters and overlay text are NOT burned into the video pixels — they are
/// stored on the reel doc (`filterId`, `overlayText`, `overlayPos`) and
/// rendered at playback everywhere the reel appears (mobile players + web,
/// which maps the same ids to CSS filters). Burning them in would require
/// shipping ffmpeg (~60MB APK); trim is the only edit applied to the file
/// itself (via video_compress's native startTime/duration).
/// Hard ceiling on reel length, enforced at compress time in
/// ReelUploadScreen._upload.
///
/// This is a delivery-cost constant as much as a product one: every extra
/// second is bytes that every future viewer downloads before playback starts.
/// Raising it makes the feed slower and the Storage egress bill larger, so
/// change it deliberately.
const int maxReelSeconds = 90;

class ReelFilter {
  final String id;
  final String label;

  /// 5x4 color matrix for ColorFilter.matrix; null = original.
  final List<double>? matrix;

  const ReelFilter(this.id, this.label, this.matrix);
}

const reelFilters = <ReelFilter>[
  ReelFilter('none', 'Original', null),
  ReelFilter('warm', 'Warm', [
    1.15, 0, 0, 0, 10,
    0, 1.05, 0, 0, 5,
    0, 0, 0.90, 0, 0,
    0, 0, 0, 1, 0,
  ]),
  ReelFilter('cool', 'Cool', [
    0.90, 0, 0, 0, 0,
    0, 1.00, 0, 0, 5,
    0, 0, 1.15, 0, 10,
    0, 0, 0, 1, 0,
  ]),
  ReelFilter('vivid', 'Vivid', [
    1.23622, -0.21456, -0.02166, 0, 0,
    -0.06378, 1.08544, -0.02166, 0, 0,
    -0.06378, -0.21456, 1.27834, 0, 0,
    0, 0, 0, 1, 0,
  ]),
  ReelFilter('mono', 'B&W', [
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0, 0, 0, 1, 0,
  ]),
  ReelFilter('sepia', 'Sepia', [
    0.393, 0.769, 0.189, 0, 0,
    0.349, 0.686, 0.168, 0, 0,
    0.272, 0.534, 0.131, 0, 0,
    0, 0, 0, 1, 0,
  ]),
];

ReelFilter filterById(String? id) => reelFilters.firstWhere(
      (f) => f.id == id,
      orElse: () => reelFilters.first,
    );

/// Wraps [child] (a video player) in the reel's color filter, if any.
Widget applyReelFilter(String? filterId, Widget child) {
  final f = filterById(filterId);
  if (f.matrix == null) return child;
  return ColorFiltered(
    colorFilter: ColorFilter.matrix(f.matrix!),
    child: child,
  );
}

/// The burned-look text overlay shown on top of a reel. [pos] is
/// 'top' | 'center' | 'bottom' (defaults to center).
class ReelTextOverlay extends StatelessWidget {
  final String text;
  final String? pos;

  /// Compact = small paddings for thumbnail-sized previews (upload screen).
  /// Full-size paddings keep clear of the status bar / caption UI in feeds.
  final bool compact;

  const ReelTextOverlay(
      {super.key, required this.text, this.pos, this.compact = false});

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) return const SizedBox.shrink();
    final alignment = switch (pos) {
      'top' => Alignment.topCenter,
      'bottom' => Alignment.bottomCenter,
      _ => Alignment.center,
    };
    return IgnorePointer(
      child: Align(
        alignment: alignment,
        child: Padding(
          padding: EdgeInsets.only(
            top: pos == 'top' ? (compact ? 12 : 110) : 24,
            bottom: pos == 'bottom' ? (compact ? 12 : 190) : 24,
            left: compact ? 12 : 24,
            right: compact ? 12 : 24,
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              text,
              textAlign: TextAlign.center,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
                height: 1.25,
                shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
