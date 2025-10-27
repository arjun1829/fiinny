import 'dart:async';
import 'package:flutter/material.dart';

import 'dashboard_screen.dart';
import 'expenses_screen.dart';
import 'friends_screen.dart';
import 'package:lifemap/sharing/screens/sharing_screen.dart';
import 'package:lifemap/services/user_service.dart';

class MainNavScreen extends StatefulWidget {
  final String userPhone;
  const MainNavScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<MainNavScreen> createState() => _MainNavScreenState();
}

class _MainNavScreenState extends State<MainNavScreen>
    with TickerProviderStateMixin {
  int _currentIndex = 0;
  String? _resolvedPhone;
  bool _resolving = false;
  StreamSubscription? _resolveSub;

  late final List<AnimationController> _shineControllers;
  late final List<Animation<double>> _shineAnimations;
  late final List<TickerFuture?> _shineTicker;
  late final List<IconData> _iconData;

  @override
  void initState() {
    super.initState();
    _iconData = const [
      Icons.dashboard_rounded,
      Icons.list_alt_rounded,
      Icons.group_rounded,
      Icons.people_outline,
    ];

    _shineControllers = List.generate(
      _iconData.length,
          (i) => AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 800),
      ),
    );

    _shineAnimations = List.generate(
      _iconData.length,
          (i) => Tween<double>(begin: -1.2, end: 1.2).animate(
        CurvedAnimation(parent: _shineControllers[i], curve: Curves.easeInOut),
      ),
    );

    _shineTicker = List.generate(_iconData.length, (_) => null);
    _startShine(0);
    _resolvePhoneIfNeeded();
  }

  @override
  void didUpdateWidget(covariant MainNavScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userPhone != widget.userPhone) {
      _resolvedPhone = null;
      _resolvePhoneIfNeeded();
    }
  }

  @override
  void dispose() {
    for (var ctrl in _shineControllers) {
      ctrl.dispose();
    }
    _resolveSub?.cancel();
    super.dispose();
  }

  // ----------- UID → Phone Resolution -----------

  bool _looksLikeUid(String v) =>
      v.length >= 20 && RegExp(r'^[A-Za-z0-9_\-]+$').hasMatch(v);

  String get _effectivePhone => _resolvedPhone ?? widget.userPhone;

  Future<void> _resolvePhoneIfNeeded() async {
    if (!_looksLikeUid(widget.userPhone)) return;
    if (_resolvedPhone != null || _resolving) return;

    setState(() => _resolving = true);
    try {
      final phone = await UserService()
          .getPhoneForUid(widget.userPhone)
          .timeout(const Duration(seconds: 6), onTimeout: () => null);

      if (!mounted) return;
      setState(() {
        _resolvedPhone = (phone?.isNotEmpty ?? false)
            ? phone
            : widget.userPhone; // fallback to UID
      });
    } catch (_) {
      if (mounted) setState(() => _resolvedPhone = widget.userPhone);
    } finally {
      if (mounted) setState(() => _resolving = false);
    }
  }

  // ----------- Shine Animation -----------

  void _startShine(int index) async {
    if (!mounted) return;
    _shineControllers[index].reset();
    _shineTicker[index] = _shineControllers[index].forward();
    await Future.delayed(const Duration(milliseconds: 900));
    if (_currentIndex == index && mounted) {
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted && _currentIndex == index) _startShine(index);
      });
    }
  }

  void _onTabTapped(int index) {
    if (_currentIndex == index) return;
    setState(() {
      _currentIndex = index;
      _startShine(index);
    });
  }

  // ----------- UI -----------

  @override
  Widget build(BuildContext context) {
    final phone = _effectivePhone;
    final screens = <Widget>[
      DashboardScreen(userPhone: phone),
      ExpensesScreen(userPhone: phone),
      FriendsScreen(userPhone: phone),
      SharingScreen(currentUserPhone: phone),
    ];

    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(index: _currentIndex, children: screens),
          if (_resolving)
            const Positioned.fill(
              child: IgnorePointer(
                ignoring: true,
                child: SizedBox(),
              ),
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        bottom: true,
        child: Container(
          padding: const EdgeInsets.fromLTRB(0, 2, 0, 0),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(
              top: BorderSide(
                color: Colors.grey.withOpacity(0.13),
                width: 1.2,
              ),
            ),
          ),
          child: BottomNavigationBar(
            type: BottomNavigationBarType.fixed,
            backgroundColor: Colors.transparent,
            currentIndex: _currentIndex,
            elevation: 0,
            selectedItemColor: Theme.of(context).colorScheme.primary,
            unselectedItemColor: const Color(0xFF535A68),
            selectedFontSize: 11,
            unselectedFontSize: 10,
            selectedLabelStyle: const TextStyle(
              height: 1.0,
              fontWeight: FontWeight.w600,
            ),
            unselectedLabelStyle: const TextStyle(height: 1.0),
            selectedIconTheme: const IconThemeData(size: 22),
            unselectedIconTheme: const IconThemeData(size: 19),
            showUnselectedLabels: true,
            onTap: _onTabTapped,
            items: List.generate(_iconData.length, (i) {
              final selected = _currentIndex == i;
              return BottomNavigationBarItem(
                icon: Stack(
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeOut,
                      decoration: selected
                          ? BoxDecoration(
                              shape: BoxShape.circle,
                              color: Theme.of(context)
                                  .colorScheme
                                  .primary
                                  .withOpacity(0.10),
                            )
                          : null,
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: AnimatedBuilder(
                          animation: _shineControllers[i],
                          builder: (context, child) {
                            return CustomPaint(
                              painter: selected
                                  ? ShinePainter(_shineAnimations[i].value)
                                  : null,
                              child: Icon(
                                _iconData[i],
                                size: selected ? 22 : 19,
                                color: selected
                                    ? Theme.of(context).colorScheme.primary
                                    : const Color(0xFF535A68),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                  ],
                ),
                label: const ["Dashboard", "Expenses", "Friends", "Sharing"][i],
              );
            }),
          ),
        ),
      ),
    );
  }
}

class ShinePainter extends CustomPainter {
  final double position;
  ShinePainter(this.position);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..shader = LinearGradient(
        colors: [
          Colors.white.withOpacity(0.00),
          Colors.white.withOpacity(0.22),
          Colors.white.withOpacity(0.45),
          Colors.white.withOpacity(0.00),
        ],
        stops: const [0.09, 0.32, 0.68, 0.93],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height))
      ..blendMode = BlendMode.plus;

    final shineWidth = size.width * 0.44;
    final shineRect = Rect.fromLTWH(
      size.width * (position - 0.22),
      0,
      shineWidth,
      size.height,
    );

    canvas.drawRRect(
      RRect.fromRectAndRadius(shineRect, Radius.circular(shineWidth / 1.6)),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant ShinePainter oldDelegate) =>
      position != oldDelegate.position;
}
