// lib/screens/welcome_screen.dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme_provider.dart';
import 'auth_gate.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({Key? key}) : super(key: key);

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _showSwipeHint = true;

  final List<Map<String, String>> _onboardData = const [
    {
      'image': 'assets/onboarding/onboarding_1.png',
      'title': "Track Every Penny",
      'desc': "Know exactly where your money goes—clear, fast, and automatic.",
    },
    {
      'image': 'assets/onboarding/onboarding_5.png',
      'title': "Grow Together",
      'desc': "Build shared goals with your partner and stay in sync, effortlessly.",
    },
    {
      'image': 'assets/onboarding/onboarding_2.png',
      'title': "Split With Friends",
      'desc': "Split and settle bills without awkwardness—transparent and fair.",
    },
    {
      'image': 'assets/onboarding/onboarding_4.png',
      'title': "Plan Big, Anywhere",
      'desc': "Track, save, and plan for what matters—wherever life takes you.",
    },
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final d in _onboardData) {
        precacheImage(AssetImage(d['image']!), context);
      }
    });
  }

  Future<void> _markOnboardingSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('seen_onboarding', true);
  }

  void _openAuth() async {
    await _markOnboardingSeen();
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const AuthGate()),
    );
  }

  void _next() {
    if (_currentPage < _onboardData.length - 1) {
      HapticFeedback.lightImpact();
      _pageController.nextPage(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    }
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
        "Permissions: choose what you share (totals, categories, goals).",
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
                color: theme.colorScheme.surface.withOpacity(0.92),
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
                            const Icon(Icons.check_circle_outline, size: 18),
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
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text("Got it"),
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
    final progress = (_currentPage + 1) / _onboardData.length;
    final bottomPad = media.padding.bottom;

    final primaryBtnStyle = ElevatedButton.styleFrom(
      backgroundColor: theme.colorScheme.primary,         // darker CTA
      foregroundColor: theme.colorScheme.onPrimary,
      padding: const EdgeInsets.symmetric(vertical: 16),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    );

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                theme.colorScheme.primary.withOpacity(0.08),
                theme.colorScheme.surfaceVariant.withOpacity(0.06),
                theme.colorScheme.surface.withOpacity(0.02),
              ],
            ),
          ),
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
                    ),
                    // Darker Skip
                    if (!isLast)
                      TextButton(
                        onPressed: _skipToEnd,
                        style: TextButton.styleFrom(
                          foregroundColor:
                          theme.colorScheme.onSurface.withOpacity(0.9),
                          textStyle: const TextStyle(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        child: const Text("Skip"),
                      ),
                  ],
                ),
              ),

              // Progress line
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 4,
                    backgroundColor: Colors.black.withOpacity(0.06),
                    valueColor: AlwaysStoppedAnimation<Color>(
                      theme.colorScheme.primary.withOpacity(0.9),
                    ),
                  ),
                ),
              ),

              // Content area
              Expanded(
                child: Stack(
                  children: [
                    PageView.builder(
                      controller: _pageController,
                      physics: const ClampingScrollPhysics(),
                      itemCount: _onboardData.length,
                      onPageChanged: (int page) {
                        setState(() {
                          _currentPage = page;
                          _showSwipeHint = page == 0; // hint only on first page
                        });
                      },
                      itemBuilder: (_, idx) {
                        final data = _onboardData[idx];
                        return Center(
                          child: Padding(
                            padding:
                            const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
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

                    // Swipe hint (first page only, well above footer)
                    if (_showSwipeHint && !isLast)
                      Positioned.fill(
                        child: IgnorePointer(
                          ignoring: true,
                          child: Align(
                            alignment: const Alignment(0, 0.80),
                            child: AnimatedOpacity(
                              opacity: 1,
                              duration: const Duration(milliseconds: 600),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.swipe,
                                      size: 18,
                                      color: Colors.black.withOpacity(0.55)),
                                  const SizedBox(width: 6),
                                  Text(
                                    "Swipe to continue",
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Colors.black.withOpacity(0.55),
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

              // Dots
              Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(
                    _onboardData.length,
                        (idx) => AnimatedContainer(
                      duration: const Duration(milliseconds: 240),
                      margin: const EdgeInsets.symmetric(horizontal: 5),
                      width: _currentPage == idx ? 22 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: _currentPage == idx
                            ? theme.colorScheme.onSurface.withOpacity(0.85)
                            : theme.colorScheme.onSurface.withOpacity(0.25),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: theme.colorScheme.primary.withOpacity(
                            _currentPage == idx ? 0.35 : 0.15,
                          ),
                          width: 1,
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // CTA: only on last page; maintain space otherwise so layout doesn't jump
              Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, isLast ? (10 + bottomPad) : 0),
                child: isLast
                    ? ElevatedButton(
                  onPressed: _openAuth,
                  style: primaryBtnStyle,
                  child: const Text("Get Started"),
                )
                    : const SizedBox(height: 0),
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
                        _FooterLink(text: "Privacy", onTap: () => _openInfoSheet("Privacy")),
                        _FooterLink(text: "Terms", onTap: () => _openInfoSheet("Terms")),
                        _FooterLink(text: "Support", onTap: () => _openInfoSheet("Support")),
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
    await showModalBottomSheet(
      context: context,
      useSafeArea: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style:
                theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Text(
              "Coming soon. You can add your $title content here.",
              style: theme.textTheme.bodyMedium,
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
    final textScale = media.textScaleFactor.clamp(1.0, 1.3);

    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface.withOpacity(0.96),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: theme.colorScheme.outline.withOpacity(0.14),
              width: 1.0,
            ),
            // Stronger, softer card shadow
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.12),
                blurRadius: 26,
                spreadRadius: 2,
                offset: const Offset(0, 14),
              ),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(22, 22, 22, 26),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Image sits on a mini-card for extra depth
              Flexible(
                flex: 4,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceVariant.withOpacity(0.25),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.08),
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
                textScaleFactor: textScale,
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
                textScaleFactor: textScale,
                style: theme.textTheme.bodyLarge?.copyWith(
                  height: 1.35,
                  color: theme.colorScheme.onSurface.withOpacity(0.80),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
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
            color: theme.colorScheme.onSurface.withOpacity(0.7),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
