import 'dart:io';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../widgets/reel_filters.dart';

/// What the editor hands back to the upload screen.
///
/// Trim is applied to the actual file at compress time
/// (video_compress startTime/duration); filter + text ride on the reel doc
/// and are rendered at playback — see reel_filters.dart.
class ReelEditResult {
  final Duration trimStart;
  final Duration trimEnd;
  final String filterId;
  final String overlayText;
  final String overlayPos; // 'top' | 'center' | 'bottom'

  const ReelEditResult({
    required this.trimStart,
    required this.trimEnd,
    required this.filterId,
    required this.overlayText,
    required this.overlayPos,
  });

  bool trimsVideo(Duration total) =>
      trimStart > Duration.zero || trimEnd < total - const Duration(milliseconds: 500);
}

/// Basic reel editor: trim, filter, text overlay.
class ReelEditScreen extends StatefulWidget {
  final String videoPath;
  final ReelEditResult? initial;

  const ReelEditScreen({super.key, required this.videoPath, this.initial});

  @override
  State<ReelEditScreen> createState() => _ReelEditScreenState();
}

class _ReelEditScreenState extends State<ReelEditScreen> {
  VideoPlayerController? _controller;
  Duration _total = Duration.zero;

  RangeValues _trim = const RangeValues(0, 1);
  String _filterId = 'none';
  final _textCtrl = TextEditingController();
  String _overlayPos = 'center';

  @override
  void initState() {
    super.initState();
    final init = widget.initial;
    if (init != null) {
      _filterId = init.filterId;
      _textCtrl.text = init.overlayText;
      _overlayPos = init.overlayPos;
    }
    _initPlayer();
  }

  Future<void> _initPlayer() async {
    final c = VideoPlayerController.file(File(widget.videoPath));
    await c.initialize();
    c.setLooping(true);
    c.play();
    // Keep playback inside the trim window so the preview shows exactly
    // what the final reel will look like.
    c.addListener(_enforceTrimLoop);
    if (!mounted) {
      c.dispose();
      return;
    }
    setState(() {
      _controller = c;
      _total = c.value.duration;
      final init = widget.initial;
      _trim = init != null
          ? RangeValues(
              init.trimStart.inMilliseconds.toDouble(),
              init.trimEnd.inMilliseconds
                  .clamp(0, _total.inMilliseconds)
                  .toDouble(),
            )
          : RangeValues(0, _total.inMilliseconds.toDouble());
    });
  }

  void _enforceTrimLoop() {
    final c = _controller;
    if (c == null || !c.value.isInitialized || _total == Duration.zero) return;
    final posMs = c.value.position.inMilliseconds.toDouble();
    if (posMs > _trim.end + 200 || posMs < _trim.start - 200) {
      c.seekTo(Duration(milliseconds: _trim.start.round()));
    }
  }

  @override
  void dispose() {
    _controller?.removeListener(_enforceTrimLoop);
    _controller?.dispose();
    _textCtrl.dispose();
    super.dispose();
  }

  String _fmt(double ms) {
    final d = Duration(milliseconds: ms.round());
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  void _done() {
    Navigator.pop(
      context,
      ReelEditResult(
        trimStart: Duration(milliseconds: _trim.start.round()),
        trimEnd: Duration(milliseconds: _trim.end.round()),
        filterId: _filterId,
        overlayText: _textCtrl.text.trim(),
        overlayPos: _overlayPos,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    final trimmedSec =
        ((_trim.end - _trim.start) / 1000).clamp(0, double.infinity);

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Edit Video'),
        actions: [
          TextButton(
            onPressed: _done,
            child: const Text('Done',
                style: TextStyle(
                    color: AppColors.secondary, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Preview (filter + text applied live) ─────────────────────────
          Expanded(
            child: c == null || !c.value.isInitialized
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white38))
                : GestureDetector(
                    onTap: () => setState(() {
                      c.value.isPlaying ? c.pause() : c.play();
                    }),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Center(
                          child: AspectRatio(
                            aspectRatio: c.value.aspectRatio,
                            child: applyReelFilter(_filterId, VideoPlayer(c)),
                          ),
                        ),
                        ReelTextOverlay(
                            text: _textCtrl.text, pos: _overlayPos),
                        if (!c.value.isPlaying)
                          const Center(
                            child: Icon(Icons.play_arrow_rounded,
                                color: Colors.white70, size: 64),
                          ),
                      ],
                    ),
                  ),
          ),

          // ── Controls ─────────────────────────────────────────────────────
          Container(
            color: const Color(0xFF121212),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: SafeArea(
              top: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Trim
                  Row(
                    children: [
                      const Icon(Icons.content_cut_rounded,
                          color: Colors.white70, size: 16),
                      const SizedBox(width: 6),
                      Text('Trim',
                          style: AppTextStyles.bodyMedium
                              .copyWith(color: Colors.white)),
                      const Spacer(),
                      Text(
                        '${_fmt(_trim.start)} – ${_fmt(_trim.end)}  (${trimmedSec.toStringAsFixed(0)}s)',
                        style: const TextStyle(
                            color: Colors.white54, fontSize: 12),
                      ),
                    ],
                  ),
                  RangeSlider(
                    values: _trim,
                    min: 0,
                    max: _total.inMilliseconds
                        .toDouble()
                        .clamp(1, double.infinity),
                    activeColor: AppColors.secondary,
                    inactiveColor: Colors.white24,
                    onChanged: _total == Duration.zero
                        ? null
                        : (v) {
                            // Keep at least 1 second of video.
                            if (v.end - v.start < 1000) return;
                            setState(() => _trim = v);
                            _controller?.seekTo(
                                Duration(milliseconds: v.start.round()));
                          },
                  ),
                  const SizedBox(height: 8),

                  // Filters
                  Row(
                    children: [
                      const Icon(Icons.auto_awesome_rounded,
                          color: Colors.white70, size: 16),
                      const SizedBox(width: 6),
                      Text('Filter',
                          style: AppTextStyles.bodyMedium
                              .copyWith(color: Colors.white)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 36,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: reelFilters.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final f = reelFilters[i];
                        final active = f.id == _filterId;
                        return ChoiceChip(
                          label: Text(f.label),
                          selected: active,
                          onSelected: (_) =>
                              setState(() => _filterId = f.id),
                          selectedColor: AppColors.secondary,
                          backgroundColor: const Color(0xFF2A2A2A),
                          labelStyle: TextStyle(
                            color: active ? Colors.black : Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                          side: BorderSide.none,
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Text overlay
                  Row(
                    children: [
                      const Icon(Icons.text_fields_rounded,
                          color: Colors.white70, size: 16),
                      const SizedBox(width: 6),
                      Text('Text on video',
                          style: AppTextStyles.bodyMedium
                              .copyWith(color: Colors.white)),
                      const Spacer(),
                      // Position: top / center / bottom
                      ...['top', 'center', 'bottom'].map((p) {
                        final active = _overlayPos == p;
                        return Padding(
                          padding: const EdgeInsets.only(left: 4),
                          child: InkWell(
                            onTap: () => setState(() => _overlayPos = p),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: active
                                    ? AppColors.secondary
                                    : const Color(0xFF2A2A2A),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(
                                p == 'top'
                                    ? Icons.vertical_align_top_rounded
                                    : p == 'bottom'
                                        ? Icons.vertical_align_bottom_rounded
                                        : Icons.vertical_align_center_rounded,
                                size: 16,
                                color:
                                    active ? Colors.black : Colors.white60,
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _textCtrl,
                    maxLength: 80,
                    style: const TextStyle(color: Colors.white),
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: 'e.g. 20% OFF this week only!',
                      hintStyle: const TextStyle(color: Colors.white38),
                      counterStyle: const TextStyle(color: Colors.white38),
                      filled: true,
                      fillColor: const Color(0xFF2A2A2A),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      isDense: true,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
