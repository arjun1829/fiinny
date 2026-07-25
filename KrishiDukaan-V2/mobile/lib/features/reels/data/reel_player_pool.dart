import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';
import '../../../core/models/reel_model.dart';

/// Owns the video controllers behind the reels feed.
///
/// Extracted from ReelsFeedScreen, where controller creation, prefetching,
/// playback and eviction were spread across four methods of a 1,600-line widget
/// and could only be understood by reading all of them together.
///
/// The policy is the same one the website uses (see `app/reels/lib/preload.ts`):
/// the visible reel plays, its immediate neighbours are warmed so a swipe is
/// instant, and anything further away holds no resources at all. Keeping the two
/// platforms on matching radii means a change in feel only has to be reasoned
/// about once.
///
/// The pool never calls setState itself — it reports readiness through
/// [onChanged] and lets the widget decide when to rebuild.
class ReelPlayerPool {
  ReelPlayerPool({required this.onChanged});

  /// Fired when a controller finishes initialising, so the feed can repaint and
  /// swap the poster for real video.
  final VoidCallback onChanged;

  /// Reels either side of the active one that get a controller created eagerly.
  /// Matches WARM_RADIUS on the web.
  static const int warmRadius = 1;

  /// How far a reel can drift from the active index before its controller is
  /// torn down. Wider than [warmRadius] so a viewer who swipes back one step
  /// does not pay to re-initialise.
  static const int keepRadius = 2;

  final Map<String, VideoPlayerController> _controllers = {};
  int _activeIndex = 0;
  bool _disposed = false;

  int get activeIndex => _activeIndex;

  /// Controller for a reel, or null while it is still initialising or out of
  /// the warm window. Callers render a poster in that case.
  VideoPlayerController? controllerFor(String reelId) => _controllers[reelId];

  /// Creates and begins initialising the controller for [index] if absent.
  ///
  /// Safe to call during a build: the only state mutation that reaches the
  /// widget happens later, via [onChanged] from the async completion.
  void warm(int index, List<ReelModel> reels) {
    if (_disposed || index < 0 || index >= reels.length) return;

    final reel = reels[index];
    if (_controllers.containsKey(reel.id)) return;

    final controller = VideoPlayerController.networkUrl(Uri.parse(reel.videoUrl));
    _controllers[reel.id] = controller;

    controller.initialize().then((_) {
      // The pool can be disposed while a controller is still initialising —
      // the viewer left the tab mid-load. Without this check we would call
      // play() on a controller whose widget is gone.
      if (_disposed) {
        controller.dispose();
        return;
      }
      controller.setLooping(true);
      if (index == _activeIndex) controller.play();
      onChanged();
    }).catchError((Object error) {
      // A single unplayable reel must not take down the feed. Drop it from the
      // pool so the poster stays up and the viewer can scroll past.
      _controllers.remove(reel.id)?.dispose();
      debugPrint('ReelPlayerPool: failed to initialise ${reel.id} — $error');
      if (!_disposed) onChanged();
    });
  }

  /// Moves playback to [index]: pauses the outgoing reel, plays the incoming
  /// one, warms its neighbours, and evicts anything beyond [keepRadius].
  void setActive(int index, List<ReelModel> reels) {
    if (_disposed || index < 0 || index >= reels.length) return;

    if (_activeIndex < reels.length) {
      _controllers[reels[_activeIndex].id]?.pause();
    }
    _activeIndex = index;

    _controllers[reels[index].id]?.play();

    for (var offset = 1; offset <= warmRadius; offset++) {
      warm(index + offset, reels);
      warm(index - offset, reels);
    }

    _evictBeyondKeepRadius(index, reels);
  }

  /// Warms the opening reels. Called once when the feed first has data.
  void bootstrap(List<ReelModel> reels) {
    if (_disposed || reels.isEmpty) return;
    _activeIndex = 0;
    warm(0, reels);
    for (var offset = 1; offset <= warmRadius; offset++) {
      warm(offset, reels);
    }
  }

  /// Pauses everything — used when the app backgrounds or the viewer switches
  /// tabs. Audio continuing over another screen is the bug this prevents.
  void pauseAll() {
    for (final controller in _controllers.values) {
      controller.pause();
    }
  }

  /// Resumes the active reel after returning to the feed.
  void resumeActive(List<ReelModel> reels) {
    if (_disposed || _activeIndex >= reels.length) return;
    _controllers[reels[_activeIndex].id]?.play();
  }

  void _evictBeyondKeepRadius(int index, List<ReelModel> reels) {
    final stale = _controllers.keys.where((id) {
      final position = reels.indexWhere((reel) => reel.id == id);
      // Unknown ids belong to a previous feed (a refresh reordered things) and
      // are evicted too — nothing on screen can reference them.
      if (position == -1) return true;
      return (position - index).abs() > keepRadius;
    }).toList();

    for (final id in stale) {
      _controllers.remove(id)?.dispose();
    }
  }

  /// Tears down every controller but leaves the pool usable.
  ///
  /// Used by pull-to-refresh, where the feed contents are about to be replaced:
  /// the old controllers point at reels that may not appear in the new ordering,
  /// but the pool itself must survive to serve the incoming ones. Distinct from
  /// [dispose], which is terminal.
  void reset() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    _controllers.clear();
    _activeIndex = 0;
  }

  void dispose() {
    _disposed = true;
    reset();
  }
}
