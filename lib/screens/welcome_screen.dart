import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'auth_gate.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({Key? key}) : super(key: key);

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  late final PageController _pageController;
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
    debugPrint("✅ WelcomeScreen initialized");

    _pageController = PageController(initialPage: 0);

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
    Navigator.of(context).pushReplacement(
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);
    final screen = media.size;
    final isLast = _currentPage == _onboardData.length - 1;
    final progress = (_currentPage + 1) / _onboardData.length;
    final bottomPad = media.padding.bottom;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
              child: Row(
                children: [
                  Text("Fiinny",
                      style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                  const Spacer(),
                  if (!isLast)
                    TextButton(onPressed: _skipToEnd, child: const Text("Skip")),
                ],
              ),
            ),

            // Progress Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 4,
                backgroundColor: Colors.grey.shade300,
              ),
            ),

            const SizedBox(height: 12),

            // PageView
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _onboardData.length,
                onPageChanged: (int page) {
                  setState(() {
                    _currentPage = page;
                    _showSwipeHint = page == 0;
                  });
                },
                itemBuilder: (_, idx) {
                  final data = _onboardData[idx];
                  return _OnboardCard(
                    image: data['image']!,
                    title: data['title']!,
                    desc: data['desc']!,
                  );
                },
              ),
            ),

            // Dots
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _onboardData.length,
                      (idx) => Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: _currentPage == idx ? 16 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _currentPage == idx ? theme.colorScheme.primary : Colors.grey,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
            ),

            // CTA Button
            Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 10 + bottomPad),
              child: isLast
                  ? ElevatedButton(
                onPressed: _openAuth,
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text("Get Started"),
              )
                  : const SizedBox.shrink(),
            ),
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
    final textScale = media.textScaleFactor.clamp(1.0, 1.2);

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Flexible(
              child: Image.asset(
                image,
                height: 200,
                errorBuilder: (ctx, error, stack) =>
                const Icon(Icons.broken_image, size: 64),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              title,
              textAlign: TextAlign.center,
              textScaleFactor: textScale,
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Text(
              desc,
              textAlign: TextAlign.center,
              textScaleFactor: textScale,
              style: theme.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}
