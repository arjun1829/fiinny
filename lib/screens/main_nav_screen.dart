import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import 'expenses_screen.dart';
import 'friends_screen.dart';
import 'package:lifemap/sharing/screens/sharing_screen.dart';

class MainNavScreen extends StatefulWidget {
  final String userPhone;
  const MainNavScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<MainNavScreen> createState() => _MainNavScreenState();
}

class _MainNavScreenState extends State<MainNavScreen> with TickerProviderStateMixin {
  int _currentIndex = 0;
  late final List<Widget> _screens;
  late final List<AnimationController> _shineControllers;
  late final List<Animation<double>> _shineAnimations;
  late final List<TickerFuture?> _shineTicker;
  late final List<IconData> _iconData;

  @override
  void initState() {
    super.initState();
    _screens = [
      DashboardScreen(userPhone: widget.userPhone),
      ExpensesScreen(userPhone: widget.userPhone),
      FriendsScreen(userPhone: widget.userPhone),
      SharingScreen(currentUserPhone: widget.userPhone),
    ];

    _iconData = [
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
  }

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

  @override
  void dispose() {
    for (var ctrl in _shineControllers) {
      ctrl.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.only(bottom: 0),
        child: Container(
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
            showUnselectedLabels: true,
            onTap: _onTabTapped,
            items: List.generate(_iconData.length, (i) {
              final selected = _currentIndex == i;
              return BottomNavigationBarItem(
                icon: Stack(
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 320),
                      curve: Curves.ease,
                      decoration: selected
                          ? BoxDecoration(
                        shape: BoxShape.circle,
                        color: Theme.of(context)
                            .colorScheme
                            .primary
                            .withOpacity(0.09),
                      )
                          : null,
                      child: SizedBox(
                        width: 28,
                        height: 28,
                        child: AnimatedBuilder(
                          animation: _shineControllers[i],
                          builder: (context, child) {
                            return CustomPaint(
                              painter: selected
                                  ? ShinePainter(_shineAnimations[i].value)
                                  : null,
                              child: Icon(
                                _iconData[i],
                                size: selected ? 27 : 23,
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
                label: [
                  "Dashboard",
                  "Expenses",
                  "Friends",
                  "Sharing",
                ][i],
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
  bool shouldRepaint(covariant ShinePainter oldDelegate) {
    return position != oldDelegate.position;
  }
}
