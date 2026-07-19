import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/web_links.dart';
import '../../../core/widgets/app_shell.dart';
import '../data/reel_player_pool.dart';
import '../providers/reels_provider.dart';
import '../widgets/reel_filters.dart';

/// Position of the reels tab in the bottom-nav shell. Playback is gated on this
/// so a reel never keeps playing audio over another tab.
const int _reelsTabIndex = 4;

class ReelsFeedScreen extends ConsumerStatefulWidget {
  const ReelsFeedScreen({super.key});

  @override
  ConsumerState<ReelsFeedScreen> createState() => _ReelsFeedScreenState();
}

class _ReelsFeedScreenState extends ConsumerState<ReelsFeedScreen>
    with WidgetsBindingObserver {
  final _pageController = PageController();
  final Set<String> _viewedReelIds = {};

  /// Video controller lifecycle — creation, prefetch, eviction — lives in the
  /// pool rather than in this widget. See ReelPlayerPool for the warm/keep
  /// radius policy it applies.
  late final ReelPlayerPool _players;

  bool _initialized = false;

  /// Index of the reel on screen. Mirrors the pool's own active index; kept
  /// here because view-counting is a feed concern, not a playback one.
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _players = ReelPlayerPool(
      onChanged: () {
        if (mounted) setState(() {});
      },
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _players.dispose();
    _pageController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      _players.pauseAll();
      return;
    }
    // Only resume if the reels tab is still active — otherwise the user
    // foregrounded the app while on a different tab and the reel must stay silent.
    if (ref.read(activeShellIndexProvider) != _reelsTabIndex) return;
    _players.resumeActive(_reels);
  }

  /// Current feed contents, or empty while loading.
  List<ReelModel> get _reels => ref.read(reelsFeedProvider).value ?? const [];

  /// Warms the opening reels as soon as the feed has data.
  ///
  /// Called from the build path rather than a `ref.listen` on the feed provider.
  /// `ref.listen` only fires on a *change*, so when the provider already held
  /// cached data at mount — deep link into /reels, or this screen being rebuilt
  /// while the provider stayed alive — the callback never ran and no controller
  /// was ever created, leaving the viewer on a poster indefinitely.
  ///
  /// Safe to call during build: the pool only reports back from async
  /// completions, never synchronously.
  void _bootstrap(List<ReelModel> reels) {
    if (_initialized || reels.isEmpty) return;
    _initialized = true;
    _players.bootstrap(reels);
    _markReelAsSeen(reels[0].id);
  }

  void _onPageChanged(int index) {
    final reels = _reels;
    if (index >= reels.length) return;

    _currentPage = index;
    _players.setActive(index, reels);
    _markReelAsSeen(reels[index].id); // counted once per reel per session
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final feedAsync = ref.watch(reelsFeedProvider);
    final currentUser = ref.watch(currentUserProvider).value;

    // Pause/resume when the user switches away from / back to the reels tab.
    ref.listen<int>(activeShellIndexProvider, (_, tabIndex) {
      if (tabIndex != _reelsTabIndex) {
        _players.pauseAll();
      } else {
        _players.resumeActive(_reels);
      }
    });


    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: feedAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: Colors.white54),
          ),
          error: (e, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline,
                  color: Colors.white54,
                  size: 48,
                ),
                const SizedBox(height: 12),
                Text(
                  'Could not load reels',
                  style: AppTextStyles.body.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => ref.invalidate(reelsFeedProvider),
                  child: const Text(
                    'Retry',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
          data: (reels) {
            if (reels.isEmpty) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.videocam_off_outlined,
                      color: Colors.white38,
                      size: 64,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No reels yet',
                      style: AppTextStyles.heading2.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sellers can post the first one!',
                      style: AppTextStyles.body.copyWith(color: Colors.white38),
                    ),
                  ],
                ),
              );
            }
            _bootstrap(reels);
            return Stack(
              children: [
                PageView.builder(
                  controller: _pageController,
                  scrollDirection: Axis.vertical,
                  onPageChanged: _onPageChanged,
                  itemCount: reels.length,
                  itemBuilder: (context, index) {
                    return _ReelPage(
                      reel: reels[index],
                      controller: _players.controllerFor(reels[index].id),
                      currentUserId: currentUser?.phone,
                      currentUserName:
                          currentUser?.businessName ?? currentUser?.name ?? '',
                    );
                  },
                ),
                // "AgriReels" header
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: SafeArea(
                    bottom: false,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      child: Row(
                        children: [
                          Text(
                            'AgriReels',
                            style: AppTextStyles.heading2.copyWith(
                              color: Colors.white,
                              shadows: [
                                const Shadow(
                                  color: Colors.black54,
                                  blurRadius: 8,
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          IconButton(
                            icon: const Icon(
                              Icons.search_rounded,
                              color: Colors.white,
                            ),
                            onPressed: () {
                              showModalBottomSheet(
                                context: context,
                                isScrollControlled: true,
                                backgroundColor: Colors.transparent,
                                builder: (_) => const _ShopSearchSheet(),
                              );
                            },
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.refresh_rounded,
                              color: Colors.white70,
                            ),
                            onPressed: () {
                              _initialized = false;
                              _players.reset();
                              _currentPage = 0;
                              ref.invalidate(reelsFeedProvider);
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _markReelAsSeen(String reelId) async {
    if (!_viewedReelIds.contains(reelId)) {
      _viewedReelIds.add(reelId);
      ref.read(reelsRepoProvider).incrementViewsCount(reelId);

      final prefs = await SharedPreferences.getInstance();
      final seenReels = prefs.getStringList('seen_reels') ?? [];
      if (!seenReels.contains(reelId)) {
        seenReels.add(reelId);
        // Keep the list from growing indefinitely
        if (seenReels.length > 500) {
          seenReels.removeAt(0);
        }
        await prefs.setStringList('seen_reels', seenReels);
      }
    }
  }
}

// ── Individual reel page ─────────────────────────────────────────────────────

/// Shown while the video controller is still initialising.
///
/// Replaces a spinner on black, which made every reel feel broken for the whole
/// buffering window. The poster is a cached JPEG that lands in ~100ms, so the
/// feed looks alive immediately and the video swaps in underneath — the same
/// trick Instagram uses. Falls back to a spinner only when the reel has no
/// thumbnail at all (web-uploaded reels currently do not generate one; see
/// ReelsRepository.uploadReel).
class _ReelPoster extends StatelessWidget {
  const _ReelPoster({required this.reel});

  final ReelModel reel;

  @override
  Widget build(BuildContext context) {
    final url = reel.thumbnailUrl;
    if (url == null || url.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white38, strokeWidth: 2),
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          fadeInDuration: const Duration(milliseconds: 120),
          placeholder: (_, _) => const ColoredBox(color: Colors.black),
          errorWidget: (_, _, _) => const ColoredBox(color: Colors.black),
        ),
        // Faint progress hint so a genuinely slow load still reads as loading
        // rather than as a frozen still frame.
        const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              color: Colors.white24,
              strokeWidth: 2,
            ),
          ),
        ),
      ],
    );
  }
}

class _ReelPage extends ConsumerStatefulWidget {
  final ReelModel reel;
  final VideoPlayerController? controller;
  final String? currentUserId;
  final String currentUserName;

  const _ReelPage({
    required this.reel,
    this.controller,
    this.currentUserId,
    required this.currentUserName,
  });

  @override
  ConsumerState<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends ConsumerState<_ReelPage>
    with TickerProviderStateMixin {
  bool? _isLiked;
  bool? _isFollowing;
  late int _likesCount;
  late int _commentsCount;
  bool _showPauseIcon = false;
  late AnimationController _likeAnimController;
  late Animation<double> _likeScale;
  late AnimationController _heartAnimController;
  late Animation<double> _heartScale;
  late Animation<double> _heartOpacity;
  bool _reposting = false;
  // The caller's repost doc id for this reel (null = not reposted). Drives the
  // repost button's active state and one-tap undo.
  String? _repostId;

  @override
  void initState() {
    super.initState();
    _likesCount = widget.reel.likesCount;
    _commentsCount = widget.reel.commentsCount;

    _likeAnimController = AnimationController(
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
    ]).animate(_likeAnimController);

    // Double-tap heart burst
    _heartAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _heartScale = TweenSequence([
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 0.0,
          end: 1.2,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 40,
      ),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.2,
          end: 1.0,
        ).chain(CurveTween(curve: Curves.easeIn)),
        weight: 20,
      ),
      TweenSequenceItem(tween: ConstantTween<double>(1.0), weight: 40),
    ]).animate(_heartAnimController);
    _heartOpacity = TweenSequence([
      TweenSequenceItem(tween: ConstantTween<double>(1.0), weight: 60),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.0,
          end: 0.0,
        ).chain(CurveTween(curve: Curves.easeIn)),
        weight: 40,
      ),
    ]).animate(_heartAnimController);

    _loadInteractionState();
  }

  @override
  void dispose() {
    _likeAnimController.dispose();
    _heartAnimController.dispose();
    super.dispose();
  }

  Future<void> _loadInteractionState() async {
    if (widget.currentUserId == null) {
      if (mounted)
        setState(() {
          _isLiked = false;
          _isFollowing = false;
        });
      return;
    }
    final repo = ref.read(reelsRepoProvider);
    final isOwnReel = widget.currentUserId == widget.reel.shopOwnerId;
    final results = await Future.wait([
      repo.isLikedBy(widget.reel.id, widget.currentUserId!),
      repo.isFollowing(widget.currentUserId!, widget.reel.shopOwnerId),
      if (!isOwnReel)
        repo.myRepostId(
          sourceReel: widget.reel,
          shopOwnerId: widget.currentUserId!,
        ),
    ]);
    if (mounted) {
      setState(() {
        _isLiked = results[0] as bool;
        _isFollowing = results[1] as bool;
        if (!isOwnReel) _repostId = results[2] as String?;
      });
    }
  }

  Future<void> _toggleLike() async {
    if (widget.currentUserId == null) {
      _showLoginPrompt();
      return;
    }
    final wasLiked = _isLiked ?? false;
    setState(() {
      _isLiked = !wasLiked;
      _likesCount += wasLiked ? -1 : 1;
    });
    if (!wasLiked) _likeAnimController.forward(from: 0);
    try {
      await ref
          .read(reelsRepoProvider)
          .toggleLike(widget.reel.id, widget.currentUserId!);
    } catch (_) {
      if (mounted) {
        setState(() {
          _isLiked = wasLiked;
          _likesCount += wasLiked ? 1 : -1;
        });
      }
    }
  }

  Future<void> _toggleFollow() async {
    if (widget.currentUserId == null) {
      _showLoginPrompt();
      return;
    }
    final wasFollowing = _isFollowing ?? false;
    setState(() {
      _isFollowing = !wasFollowing;
    });
    try {
      await ref
          .read(reelsRepoProvider)
          .toggleFollow(widget.currentUserId!, widget.reel.shopOwnerId);
    } catch (_) {
      if (mounted)
        setState(() {
          _isFollowing = wasFollowing;
        });
    }
  }

  void _openComments() {
    ref.read(reelCommentSheetOpenProvider.notifier).setOpen(true);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CommentsSheet(
        reelId: widget.reel.id,
        currentUserId: widget.currentUserId,
        currentUserName: widget.currentUserName,
        onCommentAdded: () {
          if (mounted)
            setState(() {
              _commentsCount++;
            });
        },
      ),
    ).whenComplete(() {
      if (mounted)
        ref.read(reelCommentSheetOpenProvider.notifier).setOpen(false);
    });
  }

  /// Share message leads with the reel's title + description. Both links are
  /// real website routes (WebLinks slugs match the web's builders): the reel's
  /// own page, and — when the seller linked a product — that product's page,
  /// so the receiver can open exactly what was linked.
  String get _shareText {
    final reel = widget.reel;
    final reelLink = WebLinks.reel(reel.title, reel.id);
    final hasProduct =
        reel.linkedProductId != null && reel.linkedProductId!.isNotEmpty;
    final parts = <String>[
      if (reel.title.isNotEmpty) '🎬 ${reel.title}',
      if (reel.caption.isNotEmpty) reel.caption,
      if (hasProduct) ...[
        '',
        '🛒 Buy ${reel.linkedProductName ?? 'this product'}:',
        WebLinks.product(reel.linkedProductName ?? '', reel.linkedProductId!),
      ],
      '',
      'Watch on KrishiDukan AgriReels — by ${reel.shopName}:',
      reelLink,
    ];
    return parts.join('\n');
  }

  void _share() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFF25D366),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.chat, color: Colors.white),
              ),
              title: const Text(
                'Share on WhatsApp',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                widget.reel.title.isNotEmpty
                    ? widget.reel.title
                    : '${widget.reel.shopName} on AgriReels',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              onTap: () async {
                Navigator.pop(sheetContext);
                final url = Uri.parse(
                  'https://wa.me/?text=${Uri.encodeComponent(_shareText)}',
                );
                if (await canLaunchUrl(url)) {
                  await launchUrl(url, mode: LaunchMode.externalApplication);
                } else if (mounted) {
                  // WhatsApp not installed — fall back to the system sheet.
                  SharePlus.instance.share(ShareParams(text: _shareText));
                }
              },
            ),
            ListTile(
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.share_rounded,
                  color: AppColors.primary,
                ),
              ),
              title: const Text(
                'More options',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: const Text('SMS, Telegram, email…'),
              onTap: () {
                Navigator.pop(sheetContext);
                SharePlus.instance.share(
                  ShareParams(
                    text: _shareText,
                    subject: widget.reel.title.isNotEmpty
                        ? widget.reel.title
                        : '${widget.reel.shopName} on AgriReels',
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _togglePlayPause() {
    final controller = widget.controller;
    if (controller == null || !controller.value.isInitialized) return;
    setState(() {
      if (controller.value.isPlaying) {
        controller.pause();
        _showPauseIcon = true;
      } else {
        controller.play();
        _showPauseIcon = false;
      }
    });
    if (_showPauseIcon) {
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (mounted)
          setState(() {
            _showPauseIcon = false;
          });
      });
    }
  }

  void _onDoubleTap() {
    // Like if not already liked
    if (_isLiked == false) _toggleLike();
    // Always burst the heart
    _heartAnimController.forward(from: 0);
  }

  void _showLoginPrompt() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Login to interact with reels'),
        action: SnackBarAction(
          label: 'Login',
          onPressed: () => context.push('/login'),
        ),
      ),
    );
  }

  /// One-tap repost / un-repost. No menus: tapping reposts instantly; tapping
  /// again removes it. Removal is also available from the seller's own profile.
  Future<void> _toggleRepost() async {
    final user = ref.read(currentUserProvider).value;
    if (user == null) {
      _showLoginPrompt();
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
    setState(() => _reposting = true);
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
      if (mounted) setState(() => _reposting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final isOwnReel = widget.currentUserId == widget.reel.shopOwnerId;
    return Stack(
      fit: StackFit.expand,
      children: [
        // ── Video background ─────────────────────────────────────────────
        GestureDetector(
          onTap: _togglePlayPause,
          onDoubleTap: _onDoubleTap,
          child: Container(
            color: Colors.black,
            child: controller != null
                ? ValueListenableBuilder<VideoPlayerValue>(
                    valueListenable: controller,
                    builder: (_, value, _) {
                      if (!value.isInitialized) {
                        return _ReelPoster(reel: widget.reel);
                      }
                      return applyReelFilter(
                        widget.reel.filterId,
                        SizedBox.expand(
                          child: FittedBox(
                            fit: BoxFit.cover,
                            child: SizedBox(
                              width: value.size.width,
                              height: value.size.height,
                              child: VideoPlayer(controller),
                            ),
                          ),
                        ),
                      );
                    },
                  )
                : _ReelPoster(reel: widget.reel),
          ),
        ),

        // ── Seller's text overlay (from the upload editor) ───────────────
        if (widget.reel.overlayText != null)
          ReelTextOverlay(
            text: widget.reel.overlayText!,
            pos: widget.reel.overlayPos,
          ),

        // ── Pause icon flash ─────────────────────────────────────────────
        if (_showPauseIcon)
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

        // ── Double-tap heart burst ────────────────────────────────────────
        AnimatedBuilder(
          animation: _heartAnimController,
          builder: (_, _) {
            if (_heartAnimController.isDismissed)
              return const SizedBox.shrink();
            return Center(
              child: Opacity(
                opacity: _heartOpacity.value,
                child: Transform.scale(
                  scale: _heartScale.value,
                  child: const Icon(
                    Icons.favorite_rounded,
                    color: Colors.white,
                    size: 100,
                    shadows: [Shadow(color: Colors.black38, blurRadius: 12)],
                  ),
                ),
              ),
            );
          },
        ),

        // ── Top gradient (status bar readability) ────────────────────────
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: Container(
            height: 140,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black54, Colors.transparent],
              ),
            ),
          ),
        ),

        // ── Bottom gradient ───────────────────────────────────────────────
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

        // ── Right-side action column ──────────────────────────────────────
        Positioned(
          right: 12,
          bottom: 80,
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ActionButton(
                  icon: _isLiked == true
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  iconColor: _isLiked == true ? Colors.red : Colors.white,
                  label: _formatCount(_likesCount),
                  scaleAnimation: _likeScale,
                  onTap: _toggleLike,
                ),
                const SizedBox(height: 20),
                _ActionButton(
                  icon: Icons.chat_bubble_outline_rounded,
                  iconColor: Colors.white,
                  label: _formatCount(_commentsCount),
                  onTap: _openComments,
                ),
                const SizedBox(height: 20),
                _ActionButton(
                  icon: Icons.share_rounded,
                  iconColor: Colors.white,
                  label: 'Share',
                  onTap: _share,
                ),
                if (!isOwnReel) ...[
                  const SizedBox(height: 20),
                  _reposting
                      ? const SizedBox(
                          height: 34,
                          width: 34,
                          child: Center(
                            child: SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        )
                      : _ActionButton(
                          icon: Icons.repeat_rounded,
                          iconColor: _repostId != null
                              ? const Color(0xFF34C759)
                              : Colors.white,
                          label: _repostId != null ? 'Reposted' : 'Repost',
                          onTap: _toggleRepost,
                        ),
                ],
                const SizedBox(height: 20),
                _ActionButton(
                  icon: Icons.play_arrow_rounded,
                  iconColor: Colors.white70,
                  label: _formatCount(widget.reel.viewsCount),
                  onTap: () {},
                ),
              ],
            ),
          ),
        ),

        // ── Bottom overlay: shop name, caption, product card ─────────────
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
                  // Instagram-style identity row: small avatar + @handle +
                  // Follow. The handle is Flexible so a long shop name
                  // truncates instead of overflowing (and shoving the Follow
                  // pill into the create-reel FAB).
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () =>
                            context.push('/shop/${widget.reel.shopOwnerId}'),
                        child: _ShopAvatar(
                          imageUrl: widget.reel.shopProfilePic,
                          shopName: widget.reel.shopName,
                          size: 34,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: GestureDetector(
                          onTap: () => context
                              .push('/shop/${widget.reel.shopOwnerId}'),
                          child: Text(
                            '@${widget.reel.shopName}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              shadows: [
                                Shadow(color: Colors.black54, blurRadius: 6),
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (!isOwnReel) ...[
                        const SizedBox(width: 10),
                        GestureDetector(
                          onTap: _toggleFollow,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.white, width: 1),
                              borderRadius: BorderRadius.circular(6),
                              color: (_isFollowing ?? false)
                                  ? Colors.transparent
                                  : Colors.white.withValues(alpha: 0.2),
                            ),
                            child: Text(
                              (_isFollowing ?? false) ? 'Following' : 'Follow',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (widget.reel.originalShopName != null &&
                      widget.reel.originalShopName!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Reposted from @${widget.reel.originalShopName}',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        shadows: [Shadow(color: Colors.black45, blurRadius: 4)],
                      ),
                    ),
                  ],
                  if (widget.reel.title.isNotEmpty) ...[
                    const SizedBox(height: 5),
                    Text(
                      widget.reel.title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        shadows: [Shadow(color: Colors.black54, blurRadius: 5)],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (widget.reel.caption.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      widget.reel.caption,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        shadows: [Shadow(color: Colors.black45, blurRadius: 4)],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (widget.reel.linkedProductId != null) ...[
                    const SizedBox(height: 12),
                    _ProductCard(
                      productName:
                          widget.reel.linkedProductName ?? 'View Product',
                      productId: widget.reel.linkedProductId!,
                      productImageUrl: widget.reel.linkedProductImageUrl,
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

  String _formatCount(int count) {
    if (count >= 1000000) return '${(count / 1000000).toStringAsFixed(1)}M';
    if (count >= 1000) return '${(count / 1000).toStringAsFixed(1)}K';
    return count.toString();
  }
}

// ── Overlay helper widgets ────────────────────────────────────────────────────

/// Small circular shop avatar with an initials fallback. Tap handling is left
/// to the parent so it can be reused anywhere.
class _ShopAvatar extends StatelessWidget {
  final String? imageUrl;
  final String shopName;
  final double size;

  const _ShopAvatar({
    required this.imageUrl,
    required this.shopName,
    this.size = 34,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 1.5),
      ),
      child: ClipOval(
        child: imageUrl != null
            ? Image.network(
                imageUrl!,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _initials(),
              )
            : _initials(),
      ),
    );
  }

  Widget _initials() => Container(
    color: AppColors.primaryContainer,
    alignment: Alignment.center,
    child: Text(
      shopName.isNotEmpty ? shopName[0].toUpperCase() : '?',
      style: TextStyle(
        color: AppColors.primary,
        fontWeight: FontWeight.bold,
        fontSize: size * 0.42,
      ),
    ),
  );
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final VoidCallback onTap;
  final Animation<double>? scaleAnimation;

  const _ActionButton({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.onTap,
    this.scaleAnimation,
  });

  @override
  Widget build(BuildContext context) {
    Widget iconWidget = Icon(icon, color: iconColor, size: 30);
    if (scaleAnimation != null) {
      iconWidget = ScaleTransition(scale: scaleAnimation!, child: iconWidget);
    }
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          iconWidget,
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  final String productName;
  final String productId;
  final String? productImageUrl;
  final String? currentUserId;

  const _ProductCard({
    required this.productName,
    required this.productId,
    this.productImageUrl,
    this.currentUserId,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        context.push('/product/$productId');
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
            if (productImageUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Image.network(
                  productImageUrl!,
                  width: 26,
                  height: 26,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const Icon(
                    Icons.shopping_bag_outlined,
                    color: Colors.white,
                    size: 16,
                  ),
                ),
              )
            else
              const Icon(
                Icons.shopping_bag_outlined,
                color: Colors.white,
                size: 16,
              ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                productName,
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

// ── Comments bottom sheet ─────────────────────────────────────────────────────

class _CommentsSheet extends ConsumerStatefulWidget {
  final String reelId;
  final String? currentUserId;
  final String currentUserName;
  final VoidCallback onCommentAdded;

  const _CommentsSheet({
    required this.reelId,
    this.currentUserId,
    required this.currentUserName,
    required this.onCommentAdded,
  });

  @override
  ConsumerState<_CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends ConsumerState<_CommentsSheet> {
  final _textController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    if (widget.currentUserId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Login to comment'),
          action: SnackBarAction(
            label: 'Login',
            onPressed: () {
              Navigator.pop(context);
              context.push('/login');
            },
          ),
        ),
      );
      return;
    }
    setState(() {
      _submitting = true;
    });
    try {
      await ref
          .read(reelsRepoProvider)
          .addComment(
            widget.reelId,
            widget.currentUserId!,
            widget.currentUserName.isNotEmpty
                ? widget.currentUserName
                : widget.currentUserId!,
            text,
          );
      _textController.clear();
      widget.onCommentAdded();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to post comment: $e')));
      }
    } finally {
      if (mounted)
        setState(() {
          _submitting = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final commentsAsync = ref.watch(reelCommentsProvider(widget.reelId));

    return Container(
      height: MediaQuery.of(context).size.height * 0.72,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Drag handle
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
          const Divider(height: 16),

          // Comments list
          Expanded(
            child: commentsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, _) =>
                  const Center(child: Text('Could not load comments.')),
              data: (comments) {
                if (comments.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.chat_bubble_outline,
                          size: 48,
                          color: Colors.black26,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'No comments yet.',
                          style: AppTextStyles.body.copyWith(
                            color: Colors.black45,
                          ),
                        ),
                      ],
                    ),
                  );
                }
                return ListView.builder(
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
                            radius: 17,
                            backgroundColor: AppColors.primaryContainer,
                            child: Text(
                              c.userName.isNotEmpty
                                  ? c.userName[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                color: AppColors.primary,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
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
                                const SizedBox(height: 2),
                                Text(c.text, style: AppTextStyles.bodySmall),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),

          // Input
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
                    controller: _textController,
                    decoration: InputDecoration(
                      hintText: widget.currentUserId == null
                          ? 'Login to comment...'
                          : 'Add a comment...',
                      hintStyle: AppTextStyles.body.copyWith(
                        color: Colors.black38,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide(color: AppColors.divider),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide(color: AppColors.divider),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      isDense: true,
                    ),
                    enabled: widget.currentUserId != null && !_submitting,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _submit(),
                    maxLines: 1,
                  ),
                ),
                const SizedBox(width: 4),
                IconButton(
                  onPressed: _submitting ? null : _submit,
                  icon: _submitting
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

// ── Shop Search Sheet ────────────────────────────────────────────────────────

class _ShopSearchSheet extends ConsumerStatefulWidget {
  const _ShopSearchSheet();

  @override
  ConsumerState<_ShopSearchSheet> createState() => _ShopSearchSheetState();
}

class _ShopSearchSheetState extends ConsumerState<_ShopSearchSheet> {
  final _searchController = TextEditingController();
  bool _isLoading = false;
  List<Map<String, dynamic>> _results = [];

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) {
      setState(() {
        _results = [];
      });
      return;
    }
    setState(() => _isLoading = true);
    final results = await ref.read(reelsRepoProvider).searchShops(query);
    if (mounted) {
      setState(() {
        _results = results;
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.7,
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 20),
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          TextField(
            controller: _searchController,
            autofocus: true,
            onChanged: _search,
            decoration: InputDecoration(
              hintText: 'Search username or shop...',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor: AppColors.background,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _results.isEmpty && _searchController.text.isNotEmpty
                ? const Center(child: Text('No shops found'))
                : ListView.separated(
                    itemCount: _results.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final shop = _results[index];
                      return ListTile(
                        leading: CircleAvatar(
                          radius: 18,
                          backgroundColor: AppColors.primaryContainer,
                          child: Text(
                            (shop['businessName'] as String? ?? '?')
                                .substring(0, 1)
                                .toUpperCase(),
                            style: const TextStyle(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        title: Text(shop['businessName'] ?? ''),
                        subtitle: Text(
                          '@${shop['username']}',
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontSize: 12,
                          ),
                        ),
                        onTap: () {
                          Navigator.pop(context);
                          context.push('/shop/${shop['phone']}');
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
