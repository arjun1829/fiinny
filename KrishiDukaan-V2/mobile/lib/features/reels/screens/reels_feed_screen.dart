import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_shell.dart';
import '../providers/reels_provider.dart';

class ReelsFeedScreen extends ConsumerStatefulWidget {
  const ReelsFeedScreen({super.key});

  @override
  ConsumerState<ReelsFeedScreen> createState() => _ReelsFeedScreenState();
}

class _ReelsFeedScreenState extends ConsumerState<ReelsFeedScreen>
    with WidgetsBindingObserver {
  final _pageController = PageController();
  final Map<String, VideoPlayerController> _controllers = {};
  final Set<String> _viewedReelIds = {};
  int _currentPage = 0;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
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
      final reels = ref.read(reelsFeedProvider).value ?? [];
      if (_currentPage < reels.length) {
        _controllers[reels[_currentPage].id]?.play();
      }
    }
  }

  void _ensureController(int index, List<ReelModel> reels) {
    if (index < 0 || index >= reels.length) return;
    final reel = reels[index];
    if (_controllers.containsKey(reel.id)) return;
    final controller = VideoPlayerController.networkUrl(Uri.parse(reel.videoUrl));
    _controllers[reel.id] = controller;
    controller.initialize().then((_) {
      if (!mounted) return;
      controller.setLooping(true);
      if (index == _currentPage) controller.play();
      setState(() {});
    });
  }

  void _onPageChanged(int index) {
    final reels = ref.read(reelsFeedProvider).value ?? [];
    if (_currentPage < reels.length) {
      _controllers[reels[_currentPage].id]?.pause();
    }
    _currentPage = index;
    if (index < reels.length) {
      _controllers[reels[index].id]?.play();
      _ensureController(index + 1, reels);
      if (index > 0) _ensureController(index - 1, reels);
      // Count a view once per reel per session
      final reelId = reels[index].id;
      _markReelAsSeen(reelId);
    }
    final toDispose = _controllers.keys.where((id) {
      final idx = reels.indexWhere((r) => r.id == id);
      return idx != -1 && (idx - index).abs() > 2;
    }).toList();
    for (final id in toDispose) {
      _controllers[id]?.dispose();
      _controllers.remove(id);
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final feedAsync = ref.watch(reelsFeedProvider);
    final currentUser = ref.watch(currentUserProvider).value;

    // Pause/resume when the user switches away from / back to the reels tab.
    ref.listen<int>(activeShellIndexProvider, (_, tabIndex) {
      const reelsTab = 4;
      if (tabIndex != reelsTab) {
        for (final c in _controllers.values) {
          c.pause();
        }
      } else {
        final reels = ref.read(reelsFeedProvider).value ?? [];
        if (_currentPage < reels.length) {
          _controllers[reels[_currentPage].id]?.play();
        }
      }
    });

    ref.listen<AsyncValue<List<ReelModel>>>(reelsFeedProvider, (prev, next) {
      if (!_initialized && next.value != null && next.value!.isNotEmpty) {
        _initialized = true;
        final reels = next.value!;
        _ensureController(0, reels);
        _ensureController(1, reels);
        // First reel is shown immediately — count its view
        if (reels.isNotEmpty) {
          _markReelAsSeen(reels[0].id);
        }
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
                const Icon(Icons.error_outline, color: Colors.white54, size: 48),
                const SizedBox(height: 12),
                Text(
                  'Could not load reels',
                  style: AppTextStyles.body.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => ref.invalidate(reelsFeedProvider),
                  child: const Text('Retry', style: TextStyle(color: Colors.white)),
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
                    const Icon(Icons.videocam_off_outlined,
                        color: Colors.white38, size: 64),
                    const SizedBox(height: 16),
                    Text(
                      'No reels yet',
                      style: AppTextStyles.heading2.copyWith(color: Colors.white70),
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
                      controller: _controllers[reels[index].id],
                      currentUserId: currentUser?.phone,
                      currentUserName: currentUser?.businessName ??
                          currentUser?.name ??
                          '',
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
                          horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Text(
                            'AgriReels',
                            style: AppTextStyles.heading2.copyWith(
                              color: Colors.white,
                              shadows: [
                                const Shadow(
                                    color: Colors.black54, blurRadius: 8),
                              ],
                            ),
                          ),
                          const Spacer(),
                          IconButton(
                            icon: const Icon(Icons.refresh_rounded,
                                color: Colors.white70),
                            onPressed: () {
                              _initialized = false;
                              for (final c in _controllers.values) {
                                c.dispose();
                              }
                              _controllers.clear();
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
        tween: Tween<double>(begin: 1.0, end: 1.4)
            .chain(CurveTween(curve: Curves.easeOut)),
        weight: 50,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.4, end: 1.0)
            .chain(CurveTween(curve: Curves.elasticIn)),
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
        tween: Tween<double>(begin: 0.0, end: 1.2)
            .chain(CurveTween(curve: Curves.easeOut)),
        weight: 40,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.2, end: 1.0)
            .chain(CurveTween(curve: Curves.easeIn)),
        weight: 20,
      ),
      TweenSequenceItem(
        tween: ConstantTween<double>(1.0),
        weight: 40,
      ),
    ]).animate(_heartAnimController);
    _heartOpacity = TweenSequence([
      TweenSequenceItem(tween: ConstantTween<double>(1.0), weight: 60),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.0, end: 0.0)
            .chain(CurveTween(curve: Curves.easeIn)),
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
      if (mounted) setState(() { _isLiked = false; _isFollowing = false; });
      return;
    }
    final repo = ref.read(reelsRepoProvider);
    final results = await Future.wait([
      repo.isLikedBy(widget.reel.id, widget.currentUserId!),
      repo.isFollowing(widget.currentUserId!, widget.reel.shopOwnerId),
    ]);
    if (mounted) {
      setState(() {
        _isLiked = results[0];
        _isFollowing = results[1];
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
    setState(() { _isFollowing = !wasFollowing; });
    try {
      await ref.read(reelsRepoProvider).toggleFollow(
            widget.currentUserId!,
            widget.reel.shopOwnerId,
          );
    } catch (_) {
      if (mounted) setState(() { _isFollowing = wasFollowing; });
    }
  }

  void _openComments() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CommentsSheet(
        reelId: widget.reel.id,
        currentUserId: widget.currentUserId,
        currentUserName: widget.currentUserName,
        onCommentAdded: () {
          if (mounted) setState(() { _commentsCount++; });
        },
      ),
    );
  }

  void _share() {
    SharePlus.instance.share(ShareParams(
      text:
          '${widget.reel.shopName} on AgriReels — KrishiDukaan\n\n${widget.reel.caption}',
      subject: 'AgriReels — ${widget.reel.shopName}',
    ));
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
        if (mounted) setState(() { _showPauseIcon = false; });
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

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
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
                        return const Center(
                          child: CircularProgressIndicator(
                              color: Colors.white38, strokeWidth: 2),
                        );
                      }
                      return SizedBox.expand(
                        child: FittedBox(
                          fit: BoxFit.cover,
                          child: SizedBox(
                            width: value.size.width,
                            height: value.size.height,
                            child: VideoPlayer(controller),
                          ),
                        ),
                      );
                    },
                  )
                : const Center(
                    child: CircularProgressIndicator(
                        color: Colors.white38, strokeWidth: 2),
                  ),
          ),
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
              child: const Icon(Icons.pause_rounded,
                  color: Colors.white, size: 48),
            ),
          ),

        // ── Double-tap heart burst ────────────────────────────────────────
        AnimatedBuilder(
          animation: _heartAnimController,
          builder: (_, _) {
            if (_heartAnimController.isDismissed) return const SizedBox.shrink();
            return Center(
              child: Opacity(
                opacity: _heartOpacity.value,
                child: Transform.scale(
                  scale: _heartScale.value,
                  child: const Icon(
                    Icons.favorite_rounded,
                    color: Colors.white,
                    size: 100,
                    shadows: [
                      Shadow(color: Colors.black38, blurRadius: 12),
                    ],
                  ),
                ),
              ),
            );
          },
        ),

        // ── Top gradient (status bar readability) ────────────────────────
        Positioned(
          top: 0, left: 0, right: 0,
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
          bottom: 0, left: 0, right: 0,
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
                _ProfileAvatarButton(
                  imageUrl: widget.reel.shopProfilePic,
                  shopName: widget.reel.shopName,
                  shopPhone: widget.reel.shopOwnerId,
                  isFollowing: _isFollowing ?? false,
                  onFollowTap: _toggleFollow,
                ),
                const SizedBox(height: 24),
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
                  GestureDetector(
                    onTap: () =>
                        context.push('/shop/${widget.reel.shopOwnerId}'),
                    child: Text(
                      '@${widget.reel.shopName}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
                      ),
                    ),
                  ),
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

class _ProfileAvatarButton extends StatelessWidget {
  final String? imageUrl;
  final String shopName;
  final String shopPhone;
  final bool isFollowing;
  final VoidCallback onFollowTap;

  const _ProfileAvatarButton({
    required this.imageUrl,
    required this.shopName,
    required this.shopPhone,
    required this.isFollowing,
    required this.onFollowTap,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      alignment: Alignment.center,
      children: [
        GestureDetector(
          onTap: () => context.push('/shop/$shopPhone'),
          child: Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
            ),
            child: ClipOval(
              child: imageUrl != null
                  ? Image.network(imageUrl!, fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _initials())
                  : _initials(),
            ),
          ),
        ),
        Positioned(
          bottom: -10,
          child: GestureDetector(
            onTap: onFollowTap,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: isFollowing ? Colors.white : AppColors.secondary,
                shape: BoxShape.circle,
                boxShadow: const [
                  BoxShadow(color: Colors.black38, blurRadius: 4),
                ],
              ),
              child: Icon(
                isFollowing ? Icons.check_rounded : Icons.add_rounded,
                size: 14,
                color: isFollowing ? AppColors.primary : Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _initials() => Container(
        color: AppColors.primaryContainer,
        alignment: Alignment.center,
        child: Text(
          shopName.isNotEmpty ? shopName[0].toUpperCase() : '?',
          style: const TextStyle(
            color: AppColors.primary,
            fontWeight: FontWeight.bold,
            fontSize: 20,
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
        if (currentUserId == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Login to view and buy products'),
              action: SnackBarAction(
                label: 'Login',
                onPressed: () => context.push('/login'),
              ),
            ),
          );
          return;
        }
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
                      size: 16),
                ),
              )
            else
              const Icon(Icons.shopping_bag_outlined,
                  color: Colors.white, size: 16),
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
            const Icon(Icons.chevron_right_rounded,
                color: Colors.white70, size: 16),
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
    setState(() { _submitting = true; });
    try {
      await ref.read(reelsRepoProvider).addComment(
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to post comment: $e')),
        );
      }
    } finally {
      if (mounted) setState(() { _submitting = false; });
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
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (_, _) =>
                  const Center(child: Text('Could not load comments.')),
              data: (comments) {
                if (comments.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.chat_bubble_outline,
                            size: 48, color: Colors.black26),
                        const SizedBox(height: 12),
                        Text('No comments yet.',
                            style: AppTextStyles.body.copyWith(
                                color: Colors.black45)),
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
                                  color: AppColors.primary, fontSize: 13),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(c.userName,
                                    style: AppTextStyles.caption.copyWith(
                                        fontWeight: FontWeight.w700)),
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
                      hintStyle:
                          AppTextStyles.body.copyWith(color: Colors.black38),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide(color: AppColors.divider),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide(color: AppColors.divider),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
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
                          child:
                              CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send_rounded,
                          color: AppColors.primary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
