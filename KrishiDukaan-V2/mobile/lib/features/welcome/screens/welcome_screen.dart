import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import 'splash_screen.dart' show kWelcomeSeenPref;

class _WelcomePage {
  final IconData icon;
  final List<IconData> orbitIcons;
  final String title;
  final String description;

  const _WelcomePage({
    required this.icon,
    required this.orbitIcons,
    required this.title,
    required this.description,
  });
}

const _pages = [
  _WelcomePage(
    icon: Icons.storefront_outlined,
    orbitIcons: [Icons.grass, Icons.water_drop_outlined, Icons.bug_report_outlined],
    title: 'Welcome to KrishiDukaan',
    description:
        'Your one-stop shop for fertilizers, pesticides, seeds and every '
        'agri input — genuine products from trusted sellers.',
  ),
  _WelcomePage(
    icon: Icons.location_on_outlined,
    orbitIcons: [Icons.store_outlined, Icons.map_outlined, Icons.local_offer_outlined],
    title: 'Find Stores Near You',
    description:
        'Compare prices and discounts from stores around you, get '
        'directions, or order online for home delivery.',
  ),
  _WelcomePage(
    icon: Icons.menu_book_outlined,
    orbitIcons: [Icons.eco_outlined, Icons.science_outlined, Icons.tips_and_updates_outlined],
    title: 'Crop Hubs & Expert Tips',
    description:
        'Learn the right nutrition, protection and practices for your '
        'crops from our knowledge hubs — free, in your language.',
  ),
  _WelcomePage(
    icon: Icons.trending_up_outlined,
    orbitIcons: [Icons.inventory_2_outlined, Icons.receipt_long_outlined, Icons.currency_rupee],
    title: 'Grow Your Agri Business',
    description:
        'Retailer or manufacturer? List your products, reach more '
        'farmers and manage orders from a powerful dashboard.',
  ),
];

/// First-install welcome carousel. Skip / Get Started both mark the
/// welcome-seen flag and continue to login.
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final _controller = PageController();
  int _page = 0;

  bool get _isLast => _page == _pages.length - 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kWelcomeSeenPref, true);
    if (!mounted) return;
    context.go('/login');
  }

  void _next() {
    if (_isLast) {
      _finish();
    } else {
      _controller.nextPage(
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // ── Skip ──────────────────────────────────────────────────────
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 200),
                  opacity: _isLast ? 0 : 1,
                  child: TextButton(
                    onPressed: _isLast ? null : _finish,
                    child: Text(
                      'Skip',
                      style: AppTextStyles.bodyMedium.copyWith(
                        color: AppColors.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ),

            // ── Pages ─────────────────────────────────────────────────────
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _pages.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) => _PageBody(
                  page: _pages[i],
                  active: i == _page,
                ),
              ),
            ),

            // ── Dots ──────────────────────────────────────────────────────
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pages.length, (i) {
                final selected = i == _page;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOut,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: selected ? 24 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.primary
                        : AppColors.primary.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            const SizedBox(height: 24),

            // ── Next / Get Started ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: _next,
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Row(
                      key: ValueKey(_isLast),
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _isLast ? 'Get Started' : 'Next',
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          _isLast ? Icons.rocket_launch_outlined
                                  : Icons.arrow_forward,
                          size: 18,
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
    );
  }
}

// ─── Single page body with animated illustration ─────────────────────────────

class _PageBody extends StatelessWidget {
  final _WelcomePage page;
  final bool active;
  const _PageBody({required this.page, required this.active});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _AnimatedArt(page: page, active: active),
          const SizedBox(height: 40),
          // Entrance animation for the text whenever the page becomes active
          TweenAnimationBuilder<double>(
            key: ValueKey('${page.title}-$active'),
            tween: Tween(begin: active ? 0.0 : 1.0, end: 1.0),
            duration: const Duration(milliseconds: 450),
            curve: Curves.easeOutCubic,
            builder: (_, t, child) => Opacity(
              opacity: t,
              child: Transform.translate(
                offset: Offset(0, (1 - t) * 24),
                child: child,
              ),
            ),
            child: Column(
              children: [
                Text(
                  page.title,
                  textAlign: TextAlign.center,
                  style: AppTextStyles.heading1.copyWith(fontSize: 24),
                ),
                const SizedBox(height: 14),
                Text(
                  page.description,
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body.copyWith(
                    color: AppColors.onSurfaceVariant,
                    height: 1.5,
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

/// Floating hero icon inside a soft gradient disc, with three small satellite
/// icons gently bobbing around it.
class _AnimatedArt extends StatefulWidget {
  final _WelcomePage page;
  final bool active;
  const _AnimatedArt({required this.page, required this.active});

  @override
  State<_AnimatedArt> createState() => _AnimatedArtState();
}

class _AnimatedArtState extends State<_AnimatedArt>
    with SingleTickerProviderStateMixin {
  late final AnimationController _float;

  @override
  void initState() {
    super.initState();
    _float = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _float,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_float.value);
        return SizedBox(
          width: 260,
          height: 260,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Gradient disc
              Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [
                      AppColors.primary.withValues(alpha: 0.14),
                      AppColors.primary.withValues(alpha: 0.05),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
              ),
              // Hero icon, floating up and down
              Transform.translate(
                offset: Offset(0, -8 + t * 16),
                child: Container(
                  padding: const EdgeInsets.all(26),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.primary,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.35),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Icon(widget.page.icon, size: 56, color: Colors.white),
                ),
              ),
              // Satellite icons at fixed angles, bobbing in counter-phase
              _satellite(widget.page.orbitIcons[0],
                  const Alignment(-0.9, -0.55), 1 - t),
              _satellite(widget.page.orbitIcons[1],
                  const Alignment(0.95, -0.25), t),
              _satellite(widget.page.orbitIcons[2],
                  const Alignment(-0.35, 0.95), 1 - t),
            ],
          ),
        );
      },
    );
  }

  Widget _satellite(IconData icon, Alignment alignment, double phase) {
    return Align(
      alignment: alignment,
      child: Transform.translate(
        offset: Offset(0, -5 + phase * 10),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.25)),
            boxShadow: const [
              BoxShadow(
                color: Colors.black12,
                blurRadius: 8,
                offset: Offset(0, 3),
              ),
            ],
          ),
          child: Icon(icon, size: 20, color: AppColors.primary),
        ),
      ),
    );
  }
}
