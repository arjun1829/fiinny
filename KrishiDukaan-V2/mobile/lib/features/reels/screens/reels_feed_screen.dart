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
import '../../../core/models/reel_comment_model.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/web_links.dart';
import '../../../core/utils/format_count.dart';
import '../../../core/widgets/app_shell.dart';
import '../../../core/widgets/user_tag_dialog.dart';
import '../providers/reels_provider.dart';
import '../widgets/reel_filters.dart';

class ReelsFeedScreen extends ConsumerStatefulWidget {
  /// A one-shot token (from `?search=`) that asks the screen to open the same
  /// shop-search / "Explore Reels" sheet the in-feed search icon opens —
  /// mirrors MarketplaceScreen.searchFocusToken exactly (see that class's
  /// doc comment). Needed because this screen lives in a StatefulShellBranch,
  /// which preserves State across tab visits — a plain "did the widget just
  /// mount" check would only fire the FIRST time this tab is ever opened, not
  /// on a second "See all" tap from Home once the branch state already
  /// exists. Home passes a fresh value on every tap for the same reason
  /// Marketplace's token does.
  final String? searchToken;

  const ReelsFeedScreen({super.key, this.searchToken});

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
  String? _handledSearchToken;

  GoRouter? _router;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _maybeOpenSearch();
  }

  @override
  void didUpdateWidget(covariant ReelsFeedScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    _maybeOpenSearch();
  }

  /// Opens the search/"Explore Reels" sheet when a new token arrives (e.g.
  /// Home's reels rail "See all"). Guarded by [_handledSearchToken] so a
  /// rebuild for any other reason doesn't keep reopening it.
  void _maybeOpenSearch() {
    final token = widget.searchToken;
    if (token == null || token == _handledSearchToken) return;
    _handledSearchToken = token;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openSearchSheet();
    });
  }

  void _openSearchSheet() {
    final reels = ref.read(reelsFeedProvider).value ?? [];
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ShopSearchSheet(
        onSelectReel: (selectedReel) {
          final index = reels.indexWhere((r) => r.id == selectedReel.id);
          if (index != -1) {
            _pageController.jumpToPage(index);
          }
        },
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_router == null) {
      _router = GoRouter.of(context);
      _router!.routerDelegate.addListener(_handleRouteChange);
    }
  }

  void _handleRouteChange() {
    if (!mounted) return;
    const reelsTab = 4;
    final path = _router!.routerDelegate.currentConfiguration.uri.path;
    final visible =
        path == '/reels' && ref.read(activeShellIndexProvider) == reelsTab;

    if (!visible) {
      for (final c in _controllers.values) {
        c.pause();
      }
    } else {
      final reels = ref.read(reelsFeedProvider).value ?? [];
      if (_currentPage < reels.length) {
        _controllers[reels[_currentPage].id]?.play();
      }
    }

    try {
      ref.read(reelsFeedPlaybackActiveProvider.notifier).setPlayable(visible);
    } catch (_) {}
  }

  @override
  void dispose() {
    _router?.routerDelegate.removeListener(_handleRouteChange);
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
      const reelsTab = 4;
      if (ref.read(activeShellIndexProvider) != reelsTab) return;
      if (!ref.read(reelsFeedPlaybackActiveProvider)) return;
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
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(reel.videoUrl),
    );
    _controllers[reel.id] = controller;
    controller.initialize().then((_) {
      if (!mounted) return;
      controller.setLooping(true);
      if (index == _currentPage) {
        const reelsTab = 4;
        final isReelsTab = ref.read(activeShellIndexProvider) == reelsTab;
        final isPlaybackActive = ref.read(reelsFeedPlaybackActiveProvider);
        if (isReelsTab && isPlaybackActive) {
          controller.play();
        }
      }
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
    // Watched, not read once: blocking someone mid-scroll updates this
    // synchronously (see BlockedUserIdsNotifier), so the filter below
    // rebuilds this screen the instant a block is confirmed.
    final blockedIds = ref.watch(blockedUserIdsProvider).value ?? const {};

    ref.listen<int>(activeShellIndexProvider, (_, tabIndex) {
      const reelsTab = 4;
      if (tabIndex != reelsTab) {
        ref.read(reelsFeedPlaybackActiveProvider.notifier).setPlayable(false);
        for (final c in _controllers.values) {
          c.pause();
        }
      } else {
        ref.read(reelsFeedPlaybackActiveProvider.notifier).setPlayable(true);
        final reels = ref.read(reelsFeedProvider).value ?? [];
        if (_currentPage < reels.length) {
          _controllers[reels[_currentPage].id]?.play();
        }
      }
    });

    ref.listen<bool>(reelsFeedPlaybackActiveProvider, (_, isActive) {
      if (!isActive) {
        for (final c in _controllers.values) {
          c.pause();
        }
      } else {
        const reelsTab = 4;
        if (ref.read(activeShellIndexProvider) != reelsTab) return;
        final reels = ref.read(reelsFeedProvider).value ?? [];
        if (_currentPage < reels.length) {
          _controllers[reels[_currentPage].id]?.play();
        }
      }
    });

    final reelsData = feedAsync.value;
    if (reelsData != null && reelsData.isNotEmpty && !_initialized) {
      _initialized = true;
      _ensureController(_currentPage, reelsData);
      _ensureController(_currentPage + 1, reelsData);
      if (_currentPage > 0) _ensureController(_currentPage - 1, reelsData);
      _markReelAsSeen(reelsData[_currentPage].id);
    }

    ref.listen<AsyncValue<List<ReelModel>>>(reelsFeedProvider, (prev, next) {
      if (!_initialized && next.value != null && next.value!.isNotEmpty) {
        _initialized = true;
        final reels = next.value!;
        _ensureController(0, reels);
        _ensureController(1, reels);
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
          data: (rankedReels) {
            final reels = blockedIds.isEmpty
                ? rankedReels
                : rankedReels
                    .where((r) => !blockedIds.contains(r.shopOwnerId))
                    .toList(growable: false);
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
            return Stack(
              children: [
                PageView.builder(
                  controller: _pageController,
                  scrollDirection: Axis.vertical,
                  // Explicit physics — without this, iOS falls back to
                  // BouncingScrollPhysics (vs Android's ClampingScrollPhysics),
                  // and a bouncing PageView contesting the gesture arena
                  // against nested tap targets (the product-link card) is a
                  // known class of iOS-only tap-swallowing bug. Matches
                  // Android's existing behavior exactly, so no change there.
                  physics: const ClampingScrollPhysics(),
                  onPageChanged: _onPageChanged,
                  itemCount: reels.length,
                  itemBuilder: (context, index) {
                    return _ReelPage(
                      reel: reels[index],
                      controller: _controllers[reels[index].id],
                      currentUserId: currentUser?.phone,
                      currentUserName:
                          currentUser?.businessName ?? currentUser?.name ?? '',
                    );
                  },
                ),
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
                          IconButton(
                            icon: const Icon(
                              Icons.arrow_back_rounded,
                              color: Colors.white,
                            ),
                            tooltip: 'Back to Home',
                            onPressed: () {
                              ref
                                  .read(activeShellIndexProvider.notifier)
                                  .setIndex(0);
                              context.go('/');
                            },
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.storefront_rounded,
                              color: Colors.white70,
                            ),
                            tooltip: 'Go to Marketplace',
                            onPressed: () {
                              ref
                                  .read(activeShellIndexProvider.notifier)
                                  .setIndex(1);
                              context.go('/marketplace');
                            },
                          ),
                          Text(
                            'Reels',
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
                              Icons.video_call_rounded,
                              color: Colors.white,
                              size: 26,
                            ),
                            tooltip: 'Upload Reel',
                            onPressed: () {
                              if (currentUser == null) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: const Text('Login to upload reels'),
                                    action: SnackBarAction(
                                      label: 'Login',
                                      onPressed: () => context.push('/login'),
                                    ),
                                  ),
                                );
                              } else {
                                context.push('/reels/upload');
                              }
                            },
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.search_rounded,
                              color: Colors.white,
                            ),
                            onPressed: _openSearchSheet,
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.refresh_rounded,
                              color: Colors.white70,
                            ),
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
        if (seenReels.length > 500) {
          seenReels.removeAt(0);
        }
        await prefs.setStringList('seen_reels', seenReels);
      }
    }
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
        onCommentDeleted: () {
          if (mounted)
            setState(() {
              _commentsCount = _commentsCount > 0 ? _commentsCount - 1 : 0;
            });
        },
      ),
    ).whenComplete(() {
      if (mounted)
        ref.read(reelCommentSheetOpenProvider.notifier).setOpen(false);
    });
  }

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
    if (_isLiked == false) _toggleLike();
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

  Future<void> _toggleRepost() async {
    final user = ref.read(currentUserProvider).value;
    if (user == null) {
      _showLoginPrompt();
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
                ? 'Removed from your reels profile.'
                : 'Reposted to your reels profile.',
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

  /// Files a report, picked from a fixed reason list rather than free text —
  /// the Cloud Function that acts on these (flagReelOnReports) only counts
  /// them, it doesn't read them, so structured reasons are enough for a
  /// human reviewer later and avoid an open text field's abuse surface.
  Future<void> _reportReel() async {
    if (widget.currentUserId == null) {
      _showLoginPrompt();
      return;
    }
    final reason = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _ReportReasonSheet(),
    );
    if (reason == null || !mounted) return;
    try {
      await ref.read(reelsRepoProvider).reportReel(
            reelId: widget.reel.id,
            reporterId: widget.currentUserId!,
            reason: reason,
            reportedUserId: widget.reel.shopOwnerId,
            contentSnippet: widget.reel.caption,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reported — thanks for flagging this.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not submit report: $e')),
      );
    }
  }

  /// Blocks the reel's owner — confirms first since it's a standing
  /// decision, not a one-tap action like Report. Once confirmed, every reel
  /// and comment from this shopOwnerId disappears from the current user's
  /// view immediately (see blockedUserIdsProvider), and the platform is
  /// notified via the same contentReports queue Report writes to.
  Future<void> _blockUser() async {
    if (widget.currentUserId == null) {
      _showLoginPrompt();
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Block ${widget.reel.shopName}?'),
        content: const Text(
          "You won't see reels or comments from this account again. "
          "We'll also review the content that led to this block.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Block'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(blockedUserIdsProvider.notifier).block(
            blockerId: widget.currentUserId!,
            blockedId: widget.reel.shopOwnerId,
            reelId: widget.reel.id,
            contentSnippet: widget.reel.caption,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Blocked ${widget.reel.shopName}.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not block: $e')),
      );
    }
  }

  Widget _buildPosterOrLoader() {
    final thumb = widget.reel.thumbnailUrl ?? widget.reel.linkedProductImageUrl;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (thumb != null && thumb.isNotEmpty)
          Image.network(
            thumb,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(),
          ),
        const Center(
          child: CircularProgressIndicator(
            color: Colors.white38,
            strokeWidth: 2,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final isOwnReel = widget.currentUserId == widget.reel.shopOwnerId;
    return Stack(
      fit: StackFit.expand,
      children: [
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
                        return _buildPosterOrLoader();
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
                : _buildPosterOrLoader(),
          ),
        ),
        if (widget.reel.overlayText != null)
          ReelTextOverlay(
            text: widget.reel.overlayText!,
            pos: widget.reel.overlayPos,
          ),
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
                if (!isOwnReel) ...[
                  const SizedBox(height: 20),
                  _ActionButton(
                    icon: Icons.flag_outlined,
                    iconColor: Colors.white70,
                    label: 'Report',
                    onTap: _reportReel,
                  ),
                  const SizedBox(height: 20),
                  _ActionButton(
                    icon: Icons.block,
                    iconColor: Colors.white70,
                    label: 'Block',
                    onTap: _blockUser,
                  ),
                ],
              ],
            ),
          ),
        ),
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

  String _formatCount(int count) => formatCount(count);
}

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
      // Opaque hit-testing (matches _ActionButton) rather than the default
      // deferToChild — rules out any edge-of-widget dead zone contributing
      // to the iOS tap-swallowing reports.
      behavior: HitTestBehavior.opaque,
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

class _CommentsSheet extends ConsumerStatefulWidget {
  final String reelId;
  final String? currentUserId;
  final String currentUserName;
  final VoidCallback onCommentAdded;
  final VoidCallback onCommentDeleted;

  const _CommentsSheet({
    required this.reelId,
    this.currentUserId,
    required this.currentUserName,
    required this.onCommentAdded,
    required this.onCommentDeleted,
  });

  @override
  ConsumerState<_CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends ConsumerState<_CommentsSheet> {
  final _textController = TextEditingController();
  bool _submitting = false;
  String? _taggedUserId;
  String? _taggedUserName;

  // Inline "@mention" suggestions while typing.
  String? _mentionQuery;
  List<TaggedUser> _mentionResults = const [];
  bool _mentionLoading = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    final text = _textController.text;
    final caret = _textController.selection.baseOffset;
    final uptoCaret = caret >= 0 ? text.substring(0, caret) : text;
    final match = RegExp(r'@([^\s@]*)$').firstMatch(uptoCaret);
    if (match == null) {
      if (_mentionQuery != null) setState(() => _mentionQuery = null);
      return;
    }
    final q = match.group(1) ?? '';
    setState(() {
      _mentionQuery = q;
      _mentionLoading = true;
    });
    searchTaggableUsers(q).then((results) {
      if (!mounted || _mentionQuery != q) return;
      setState(() {
        _mentionResults = results;
        _mentionLoading = false;
      });
    });
  }

  void _pickMention(TaggedUser u) {
    // Strip the in-progress "@partial" trigger text back out — the tag
    // itself is rendered separately (the "Tagging: @name" chip below, and
    // the bold @name prefix on the posted comment), so leaving "@Name " in
    // the free-text comment too made every tagged comment show the name twice.
    final text = _textController.text;
    final caret = _textController.selection.baseOffset;
    final uptoCaret = caret >= 0 ? text.substring(0, caret) : text;
    final stripped = uptoCaret.replaceFirst(RegExp(r'@([^\s@]*)$'), '');
    final rest = caret >= 0 ? text.substring(caret) : '';
    _textController.value = TextEditingValue(
      text: stripped + rest,
      selection: TextSelection.collapsed(offset: stripped.length),
    );
    setState(() {
      _taggedUserId = u.id;
      _taggedUserName = u.name;
      _mentionQuery = null;
    });
  }

  @override
  void dispose() {
    _textController.removeListener(_onTextChanged);
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
            taggedUserId: _taggedUserId,
            taggedUserName: _taggedUserName,
          );
      _textController.clear();
      _taggedUserId = null;
      _taggedUserName = null;
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

  Future<void> _reportComment(ReelCommentModel c) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _ReportReasonSheet(title: 'Report this comment'),
    );
    if (reason == null || !mounted) return;
    try {
      await ref.read(reelsRepoProvider).reportComment(
            reelId: widget.reelId,
            commentId: c.id,
            reporterId: widget.currentUserId!,
            reportedUserId: c.userId,
            reason: reason,
            contentSnippet: c.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reported — thanks for flagging this.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not submit report: $e')),
      );
    }
  }

  Future<void> _blockCommentAuthor(ReelCommentModel c) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Block ${c.userName}?'),
        content: const Text(
          "You won't see reels or comments from this account again. "
          "We'll also review the content that led to this block.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Block'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(blockedUserIdsProvider.notifier).block(
            blockerId: widget.currentUserId!,
            blockedId: c.userId,
            reelId: widget.reelId,
            commentId: c.id,
            contentSnippet: c.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Blocked ${c.userName}.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not block: $e')),
      );
    }
  }

  Future<void> _deleteComment(ReelCommentModel c) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this comment?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(reelsRepoProvider).deleteComment(widget.reelId, c.id);
      widget.onCommentDeleted();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not delete: $e')),
      );
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
          Expanded(
            child: commentsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, _) =>
                  const Center(child: Text('Could not load comments.')),
              data: (allComments) {
                final blockedIds =
                    ref.watch(blockedUserIdsProvider).value ?? const {};
                final comments = blockedIds.isEmpty
                    ? allComments
                    : allComments
                        .where((c) => !blockedIds.contains(c.userId))
                        .toList(growable: false);
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
                                c.taggedUserName != null && c.taggedUserName!.isNotEmpty
                                    ? RichText(
                                        text: TextSpan(
                                          style: AppTextStyles.bodySmall.copyWith(color: Colors.black87),
                                          children: [
                                            TextSpan(
                                              text: '@${c.taggedUserName} ',
                                              style: const TextStyle(
                                                color: Colors.blue,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                            TextSpan(text: c.text),
                                          ],
                                        ),
                                      )
                                    : Text(c.text, style: AppTextStyles.bodySmall),
                              ],
                            ),
                          ),
                          // Every comment gets a moderation entry point — own
                          // comments can be deleted, everyone else's can be
                          // reported or blocked. Comments previously had NO
                          // way to act on abusive text at all.
                          if (widget.currentUserId != null)
                            _CommentMenuButton(
                              isOwnComment: c.userId == widget.currentUserId,
                              onReport: () => _reportComment(c),
                              onBlock: () => _blockCommentAuthor(c),
                              onDelete: () => _deleteComment(c),
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
              left: 12,
              right: 8,
              top: 8,
              bottom: MediaQuery.of(context).viewInsets.bottom + 12,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_mentionQuery != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: MentionSuggestions(
                      results: _mentionResults,
                      loading: _mentionLoading,
                      query: _mentionQuery!,
                      onSelect: _pickMention,
                    ),
                  ),
                if (_taggedUserName != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 12, bottom: 4),
                    child: Row(
                      children: [
                        Text('Tagging: @$_taggedUserName', style: const TextStyle(color: Colors.blue, fontSize: 12, fontWeight: FontWeight.bold)),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () => setState(() {
                            _taggedUserId = null;
                            _taggedUserName = null;
                          }),
                          child: const Icon(Icons.close, size: 14, color: Colors.blue),
                        )
                      ],
                    ),
                  ),
                Row(
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
          ],
        ),
      ),
    ],
  ),
);
  }
}

// ── Shop Search Sheet ────────────────────────────────────────────────────────

// ── Shop & Reels Search Sheet (Explore Grid) ──────────────────────────────────

class _ShopSearchSheet extends ConsumerStatefulWidget {
  final Function(ReelModel reel)? onSelectReel;
  const _ShopSearchSheet({this.onSelectReel});

  @override
  ConsumerState<_ShopSearchSheet> createState() => _ShopSearchSheetState();
}

class _ShopSearchSheetState extends ConsumerState<_ShopSearchSheet> {
  final _searchController = TextEditingController();
  bool _isLoading = false;
  List<Map<String, dynamic>> _shopResults = [];

  Future<void> _search(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _shopResults = [];
        _isLoading = false;
      });
      return;
    }
    setState(() => _isLoading = true);
    final results = await ref.read(reelsRepoProvider).searchShops(trimmed);
    if (mounted) {
      setState(() {
        _shopResults = results;
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
    final allReels = ref.watch(reelsFeedProvider).value ?? [];
    final query = _searchController.text.trim().toLowerCase();

    final filteredReels = (query.isEmpty
        ? allReels
        : allReels.where((r) {
            final title = r.title.toLowerCase();
            final caption = r.caption.toLowerCase();
            final shop = r.shopName.toLowerCase();
            final prod = (r.linkedProductName ?? '').toLowerCase();
            return title.contains(query) ||
                caption.contains(query) ||
                shop.contains(query) ||
                prod.contains(query);
          })).take(48).toList();

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      padding: EdgeInsets.only(
        top: 16,
        left: 16,
        right: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          TextField(
            controller: _searchController,
            autofocus: false,
            onChanged: _search,
            decoration: InputDecoration(
              hintText: 'Search shops, @username, or reels...',
              hintStyle: const TextStyle(color: Colors.black38, fontSize: 14),
              prefixIcon: const Icon(Icons.search_rounded, color: AppColors.primary),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear_rounded, size: 20, color: Colors.grey),
                      onPressed: () {
                        _searchController.clear();
                        _search('');
                      },
                    )
                  : null,
              filled: true,
              fillColor: AppColors.background,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
          const SizedBox(height: 14),
          Expanded(
            child: query.isEmpty
                ? _buildExploreGrid(allReels)
                : _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : _buildSearchResults(_shopResults, filteredReels, query),
          ),
        ],
      ),
    );
  }

  Widget _buildExploreGrid(List<ReelModel> reels) {
    if (reels.isEmpty) {
      return const Center(
        child: Text(
          'No reels available',
          style: TextStyle(color: Colors.black45),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: const [
            Icon(Icons.grid_view_rounded, size: 16, color: AppColors.primary),
            SizedBox(width: 6),
            Text(
              'Explore Reels',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Expanded(
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 0.68,
              crossAxisSpacing: 6,
              mainAxisSpacing: 6,
            ),
            itemCount: reels.length,
            itemBuilder: (context, index) {
              final reel = reels[index];
              return _ReelGridTile(
                reel: reel,
                onTap: () {
                  Navigator.pop(context);
                  widget.onSelectReel?.call(reel);
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSearchResults(
    List<Map<String, dynamic>> shops,
    List<ReelModel> reels,
    String query,
  ) {
    if (shops.isEmpty && reels.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'No accounts or reels matching "$query"',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black45, fontSize: 14),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (shops.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Text(
                'Accounts & Shops',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: Colors.black87,
                ),
              ),
            ),
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: shops.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final shop = shops[index];
                return ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
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
                  title: Text(
                    shop['businessName'] ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  subtitle: Text(
                    '@${shop['username'] ?? ''}',
                    style: const TextStyle(color: AppColors.primary, fontSize: 12),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    context.push('/shop/${shop['phone']}');
                  },
                );
              },
            ),
            const SizedBox(height: 16),
          ],
          if (reels.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Text(
                'Matching Reels',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: Colors.black87,
                ),
              ),
            ),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                childAspectRatio: 0.68,
                crossAxisSpacing: 6,
                mainAxisSpacing: 6,
              ),
              itemCount: reels.length,
              itemBuilder: (context, index) {
                final reel = reels[index];
                return _ReelGridTile(
                  reel: reel,
                  onTap: () {
                    Navigator.pop(context);
                    widget.onSelectReel?.call(reel);
                  },
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _ReelGridTile extends StatelessWidget {
  final ReelModel reel;
  final VoidCallback onTap;

  const _ReelGridTile({
    required this.reel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final thumb = reel.thumbnailUrl ?? reel.linkedProductImageUrl;
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Container(
          color: Colors.black87,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (thumb != null && thumb.isNotEmpty)
                Image.network(
                  thumb,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Container(
                    color: Colors.grey.shade900,
                    child: const Icon(Icons.play_circle_fill_rounded, color: Colors.white38, size: 28),
                  ),
                )
              else
                Container(
                  color: Colors.grey.shade900,
                  child: const Icon(Icons.play_circle_fill_rounded, color: Colors.white38, size: 28),
                ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.8),
                      ],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
              ),
              const Center(
                child: Icon(
                  Icons.play_circle_fill_rounded,
                  color: Colors.white70,
                  size: 28,
                ),
              ),
              Positioned(
                left: 6,
                right: 6,
                bottom: 6,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (reel.title.isNotEmpty || reel.caption.isNotEmpty)
                      Text(
                        reel.title.isNotEmpty ? reel.title : reel.caption,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(Icons.remove_red_eye_outlined, color: Colors.white70, size: 10),
                        const SizedBox(width: 3),
                        Text(
                          formatCount(reel.viewsCount),
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 9,
                            fontWeight: FontWeight.w500,
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
    );
  }
}

// ── Report reason sheet ───────────────────────────────────────────────────────

/// The "..." next to a comment. Shows Delete for the viewer's own comment,
/// Report + Block for anyone else's — a comment previously had no
/// moderation entry point at all, matching the reel-level one this mirrors.
class _CommentMenuButton extends StatelessWidget {
  final bool isOwnComment;
  final VoidCallback onReport;
  final VoidCallback onBlock;
  final VoidCallback onDelete;

  const _CommentMenuButton({
    required this.isOwnComment,
    required this.onReport,
    required this.onBlock,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      padding: EdgeInsets.zero,
      icon: const Icon(Icons.more_vert, size: 18, color: Colors.black45),
      onSelected: (value) {
        switch (value) {
          case 'report':
            onReport();
          case 'block':
            onBlock();
          case 'delete':
            onDelete();
        }
      },
      itemBuilder: (context) => [
        if (isOwnComment)
          const PopupMenuItem(value: 'delete', child: Text('Delete'))
        else ...[
          const PopupMenuItem(value: 'report', child: Text('Report')),
          const PopupMenuItem(value: 'block', child: Text('Block user')),
        ],
      ],
    );
  }
}

class _ReportReasonSheet extends StatelessWidget {
  final String title;
  const _ReportReasonSheet({this.title = 'Report this reel'});

  static const _reasons = [
    'Misleading product or price claim',
    'Spam or off-platform contact scraping',
    'Inappropriate or offensive content',
    'Something else',
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
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
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(title, style: AppTextStyles.heading3),
          ),
          for (final reason in _reasons)
            ListTile(
              title: Text(reason),
              onTap: () => Navigator.pop(context, reason),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
