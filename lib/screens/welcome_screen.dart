// lib/screens/welcome_screen.dart
import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'auth_gate.dart';
import '../services/notification_service.dart';
import '../services/startup_prefs.dart';

// ---- Mint colors tuned to match the artwork ----
const kMintBase = Color(0xFF21B9A3); // lighter mint
const kMintDeep = Color(0xFF159E8A); // deeper mint for gradient start

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with SingleTickerProviderStateMixin {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _showSwipeHint = true;

  // Auto-advance + progress animation (stories-style)
  late AnimationController _progressCtl;
  Timer? _autoTimer;
  static const _kAutoInterval = Duration(seconds: 2);

  // CTA breathing pulse
  bool _pulseUp = true;
  Timer? _pulseTimer;

  // CTA height (bigger)
  static const double _kCtaHeight = 60;

  // 👉 Updated slogans (Option A)
  final List<Map<String, String>> _onboardData = const [
    {
      'image': 'assets/onboarding/onboarding_1.png',
      'title': "See Every Rupee",
      'desc': "Automatic tracking that’s clean, fast, and accurate.",
    },
    {
      'image': 'assets/onboarding/onboarding_5.png',
      'title': "Grow Together",
      'desc': "Share totals, set goals, and stay in sync—on your terms.",
    },
    {
      'image': 'assets/onboarding/onboarding_2.png',
      'title': "Split. Settle. Smile.",
      'desc': "Fair splits with friends, minus the awkward math.",
    },
    {
      'image': 'assets/onboarding/onboarding_4.png',
      'title': "Plan Big, Anywhere",
      'desc': "Save for what matters—travel, home, study.",
    },
  ];

  @override
  void initState() {
    super.initState();
    unawaited(StartupPrefs.markWelcomeSeen());
    _progressCtl = AnimationController(vsync: this, duration: _kAutoInterval);

    // Capture context to ensure we check the correct synchronous context
    final ctx = context;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await NotificationService.requestPermissionLight();
      if (!ctx.mounted) return;
      for (final d in _onboardData) {
        precacheImage(AssetImage(d['image']!), ctx);
      }
      _startAuto();
      _startPulse();
    });
  }

  @override
  void dispose() {
    _autoTimer?.cancel();
    _pulseTimer?.cancel();
    _progressCtl.dispose();
    _pageController.dispose();
    super.dispose();
  }

  // ---------- Auto advance ----------
  void _startAuto() {
    _autoTimer?.cancel();
    _progressCtl
      ..stop()
      ..reset()
      ..forward();
    _autoTimer = Timer(_kAutoInterval, () {
      if (!mounted) return;
      if (_currentPage < _onboardData.length - 1) {
        _pageController.nextPage(
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
        );
      } else {
        _progressCtl.stop();
      }
    });
  }

  void _stopAuto() {
    _autoTimer?.cancel();
    _progressCtl.stop();
  }

  // ---------- CTA pulse ----------
  void _startPulse() {
    _pulseTimer?.cancel();
    _pulseTimer = Timer.periodic(const Duration(milliseconds: 1200), (_) {
      if (!mounted) return;
      setState(() => _pulseUp = !_pulseUp);
    });
  }

  void _openAuth() async {
    if (!mounted) return;
    HapticFeedback.mediumImpact();
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const AuthGate()),
    );
  }

  void _skipToEnd() {
    HapticFeedback.lightImpact();
    _pageController.animateToPage(
      _onboardData.length - 1,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeInOutCubic,
    );
  }

  Future<void> _openQuickTour() async {
    final theme = Theme.of(context);
    final data = _onboardData[_currentPage];

    final List<String> helperPoints = switch (_currentPage) {
      0 => [
          "Connect bank/email later — you can start manually.",
          "Dashboard shows today’s spend, income, and a quick nudge.",
          "Everything is editable — nothing is locked in."
        ],
      1 => [
          "Invite partner from Sharing → Add Partner.",
          "Choose what you share (totals, categories, goals).",
          "You can revoke access anytime."
        ],
      2 => [
          "Create a group, add friends by name/phone.",
          "Import Splitwise screenshot to auto-create members.",
          "Review splits before saving."
        ],
      _ => [
          "Multi-currency friendly; set your default in Profile.",
          "Offline-first — data syncs when you’re back online.",
          "Privacy-first: you control what is shared."
        ],
    };

    await showModalBottomSheet(
      context: context,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(16),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: Material(
                color: theme.colorScheme.surface.withValues(alpha: 0.92),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("How this works",
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.2,
                          )),
                      const SizedBox(height: 8),
                      Text(data['title']!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w600,
                          )),
                      const SizedBox(height: 14),
                      ...helperPoints.map((p) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.check_circle_outline,
                                    size: 18),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    p,
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      height: 1.35,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(ctx),
                          style: ElevatedButton.styleFrom(
                            backgroundColor:
                                Theme.of(context).colorScheme.surface,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(
                                color: Colors.black.withValues(alpha: 0.10),
                                width: 1,
                              ),
                            ),
                          ).copyWith(
                            overlayColor: WidgetStatePropertyAll(
                              Colors.black.withValues(alpha: 0.06),
                            ),
                          ),
                          child: const Text(
                            "Got it",
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      )
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);
    final screen = media.size;
    final isLast = _currentPage == _onboardData.length - 1;
    final bottomPad = media.padding.bottom;

    // Button style uses transparent bg; gradient painted behind it.
    final primaryBtnStyle = ElevatedButton.styleFrom(
      backgroundColor: Colors.transparent,
      foregroundColor: Colors.white,
      minimumSize: const Size.fromHeight(_kCtaHeight),
      padding: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      shadowColor: Colors.transparent,
      textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
    ).copyWith(
      overlayColor:
          WidgetStatePropertyAll(Colors.white.withValues(alpha: 0.08)),
    );

    return Scaffold(
      // FORCE pure white so images blend seamlessly
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Container(
          color: theme.scaffoldBackgroundColor, // no gradient
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top bar
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
                child: Row(
                  children: [
                    Text(
                      "Fiinny",
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      tooltip: "Quick tour",
                      onPressed: _openQuickTour,
                      icon: const Icon(Icons.help_outline),
                      color: theme.iconTheme.color,
                    ),
                    if (!isLast)
                      TextButton(
                        onPressed: _skipToEnd,
                        style: TextButton.styleFrom(
                          foregroundColor: theme.colorScheme.onSurface
                              .withValues(alpha: 0.9),
                          textStyle: const TextStyle(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        child: const Text("Skip"),
                      ),
                  ],
                ),
              ),

              // Story-style progress rail
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: Row(
                  children: List.generate(_onboardData.length, (i) {
                    final isActive = i == _currentPage;
                    return Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                            right: i == _onboardData.length - 1 ? 0 : 6),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(3),
                          child: SizedBox(
                            height: 4,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                Container(
                                    color: theme.textTheme.bodyMedium?.color
                                        ?.withValues(alpha: 0.08)),
                                if (i < _currentPage)
                                  FractionallySizedBox(
                                    widthFactor: 1,
                                    alignment: Alignment.centerLeft,
                                    child: Container(
                                      color: theme.textTheme.bodyMedium?.color
                                          ?.withValues(alpha: 0.85),
                                    ),
                                  ),
                                if (isActive)
                                  AnimatedBuilder(
                                    animation: _progressCtl,
                                    builder: (_, __) => FractionallySizedBox(
                                      widthFactor: _progressCtl.value,
                                      alignment: Alignment.centerLeft,
                                      child: Container(
                                        color: theme.textTheme.bodyMedium?.color
                                            ?.withValues(alpha: 0.85),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),

              // Content area
              Expanded(
                child: Stack(
                  children: [
                    // Pause/resume auto-play on interaction
                    GestureDetector(
                      onTapDown: (_) => _stopAuto(),
                      onTapUp: (_) => _startAuto(),
                      onHorizontalDragStart: (_) => _stopAuto(),
                      onHorizontalDragEnd: (_) => _startAuto(),
                      child: PageView.builder(
                        controller: _pageController,
                        physics: const ClampingScrollPhysics(),
                        itemCount: _onboardData.length,
                        onPageChanged: (int page) {
                          setState(() {
                            _currentPage = page;
                            _showSwipeHint = page == 0;
                          });
                          _startAuto(); // restart progress for the new page
                        },
                        itemBuilder: (_, idx) {
                          final data = _onboardData[idx];
                          return Center(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 10),
                              child: ConstrainedBox(
                                constraints: BoxConstraints(
                                  maxWidth: 640, // tablet friendly
                                  maxHeight: screen.height * 0.62,
                                  minHeight: 360,
                                ),
                                child: _OnboardCard(
                                  image: data['image']!,
                                  title: data['title']!,
                                  desc: data['desc']!,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    // Swipe hint (first page only)
                    if (_showSwipeHint && !isLast)
                      Positioned.fill(
                        child: IgnorePointer(
                          ignoring: true,
                          child: Align(
                            alignment: const Alignment(0, 0.92),
                            child: AnimatedOpacity(
                              opacity: 1,
                              duration: const Duration(milliseconds: 600),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.swipe,
                                      size: 18,
                                      color: theme.textTheme.bodySmall?.color
                                          ?.withValues(alpha: 0.55)),
                                  const SizedBox(width: 6),
                                  Text(
                                    "Swipe to continue",
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(
                                          color: theme
                                              .textTheme.bodySmall?.color
                                              ?.withValues(alpha: 0.55),
                                          fontWeight: FontWeight.w600,
                                        ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // CTA (only on last page) with pulse + glossy sheen + gradient + shadow
              Padding(
                padding: EdgeInsets.fromLTRB(
                    20, 0, 20, isLast ? (10 + bottomPad) : 0),
                child: isLast
                    ? TweenAnimationBuilder<double>(
                        tween: Tween(
                            begin: _pulseUp ? 1.0 : 1.03,
                            end: _pulseUp ? 1.03 : 1.0),
                        duration: const Duration(milliseconds: 1200),
                        curve: Curves.easeInOut,
                        builder: (context, scale, child) =>
                            Transform.scale(scale: scale, child: child),
                        child: _GlossyCtaButton(
                          label: "Get Started",
                          onPressed: _openAuth,
                          buttonStyle: primaryBtnStyle,
                          height: _kCtaHeight,
                          gradientColors: [
                            theme.colorScheme.primary,
                            theme.colorScheme.secondary,
                          ],
                        ),
                      )
                    : const SizedBox.shrink(),
              ),

              // Footer links
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 8, top: 8),
                  child: Center(
                    child: Wrap(
                      spacing: 16,
                      children: [
                        _FooterLink(
                            text: "Privacy",
                            onTap: () => _openInfoSheet("Privacy")),
                        _FooterLink(
                            text: "Terms",
                            onTap: () => _openInfoSheet("Terms")),
                        _FooterLink(
                            text: "Support",
                            onTap: () => _openInfoSheet("Support")),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openInfoSheet(String title) async {
    final theme = Theme.of(context);
    String body;
    switch (title) {
      case "Privacy":
        body = """
We value your privacy. Fiinny processes your data locally where possible and syncs securely to your account when enabled.

• Data you control: incomes, expenses, goals, attachments.
• Permissions: SMS/Gmail/Drive are off by default and can be revoked anytime.
• Storage: Google Firebase (IND/EU) with encryption in transit and at rest.
• Deletion: Delete account from Profile → Privacy to remove synced data.
""";
        break;
      case "Terms":
        body = """
By using Fiinny, you agree to:

• Use the app for personal, lawful purposes.
• Keep your login secure.
• Understand that insights are suggestions, not financial advice.
• Accept that services may change as we improve the product.
""";
        break;
      default: // Support
        body = """
Need help? We’re here.

• Email: support@fiinny.app
• FAQ: Settings → Help & FAQs
• Share logs: Settings → Diagnostics (redacts sensitive content)
""";
    }

    await showModalBottomSheet(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Text(
              body,
              style: theme.textTheme.bodyMedium?.copyWith(height: 1.35),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text("Close"),
              ),
            )
          ],
        ),
      ),
    );
  }
}

class _OnboardCard extends StatelessWidget {
  final String image;
  final String title;
  final String desc;

  const _OnboardCard({
    required this.image,
    required this.title,
    required this.desc,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);
    final textScale =
        media.textScaler.clamp(minScaleFactor: 1.0, maxScaleFactor: 1.3);

    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          decoration: BoxDecoration(
            // ✅ Full white card background (matches pure-white screen & image matte)
            color: theme.cardColor,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: theme.dividerColor.withValues(alpha: 0.08),
              width: 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: theme.shadowColor.withValues(alpha: 0.08),
                blurRadius: 22,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(22, 22, 22, 26),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // ✅ White image-holder so PNG/WebP blends perfectly
              Flexible(
                flex: 4,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.04), // hairline
                      width: 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.white.withValues(alpha: 0.06),
                        blurRadius: 18,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Image.asset(
                    image,
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.high,
                  ),
                ),
              ),

              // Title
              Text(
                title,
                textAlign: TextAlign.center,
                textScaler: textScale,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.1,
                ),
              ),
              const SizedBox(height: 10),

              // Description
              Text(
                desc,
                textAlign: TextAlign.center,
                textScaler: textScale,
                style: theme.textTheme.bodyLarge?.copyWith(
                  height: 1.35,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.80),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GlossyCtaButton extends StatefulWidget {
  final String label;
  final VoidCallback onPressed;
  final ButtonStyle buttonStyle;
  final double height;
  final List<Color> gradientColors;

  const _GlossyCtaButton({
    required this.label,
    required this.onPressed,
    required this.buttonStyle,
    required this.height,
    required this.gradientColors,
  });

  @override
  State<_GlossyCtaButton> createState() => _GlossyCtaButtonState();
}

class _GlossyCtaButtonState extends State<_GlossyCtaButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sheenCtl;

  @override
  void initState() {
    super.initState();
    _sheenCtl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void dispose() {
    _sheenCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(16);

    return SizedBox(
      width: double.infinity, // full width
      height: widget.height, // big height
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          boxShadow: const [
            BoxShadow(
              // deeper, softer shadow
              color: Color(0x33000000), // ~20% black
              blurRadius: 28,
              offset: Offset(0, 12),
            ),
          ],
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: widget.gradientColors,
          ),
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // base button (transparent, uses gradient behind)
              ElevatedButton(
                onPressed: widget.onPressed,
                style: widget.buttonStyle,
                child: Text(
                  widget.label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                  ),
                ),
              ),
              // glossy sheen sweep
              IgnorePointer(
                child: AnimatedBuilder(
                  animation: _sheenCtl,
                  builder: (context, _) => CustomPaint(
                    painter: _SheenPainter(_sheenCtl.value),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheenPainter extends CustomPainter {
  final double t;
  _SheenPainter(this.t);

  @override
  void paint(Canvas canvas, Size size) {
    final bandW = size.width * 0.26; // a bit wider band
    final x = lerpDouble(-bandW, size.width + bandW, t)!;

    canvas.save();
    canvas.translate(x, 0);
    canvas.rotate(0.35);

    final rect =
        Rect.fromLTWH(-bandW / 2, -size.height * 0.3, bandW, size.height * 1.6);
    final gradient = const LinearGradient(
      begin: Alignment.centerLeft,
      end: Alignment.centerRight,
      colors: [
        Color(0x00FFFFFF),
        Color(0x66FFFFFF), // glossy core brighter
        Color(0x11FFFFFF), // soft tail
        Color(0x00FFFFFF),
      ],
      stops: [0.0, 0.45, 0.7, 1.0],
    );
    final paint = Paint()..shader = gradient.createShader(rect);
    canvas.drawRect(rect, paint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _SheenPainter old) => old.t != t;
}

class _FooterLink extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  const _FooterLink({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Text(
          text,
          style: theme.textTheme.bodySmall?.copyWith(
            decoration: TextDecoration.underline,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
