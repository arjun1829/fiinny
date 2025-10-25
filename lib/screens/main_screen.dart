import 'package:flutter/material.dart';

import 'package:lifemap/widgets/nav/bottom_bar_with_ad.dart';
import 'dashboard_screen.dart';
import 'friends_screen.dart';
import 'goals_screen.dart';
import 'profile_screen.dart';

class MainScreen extends StatefulWidget {
  final String userId;
  const MainScreen({Key? key, required this.userId}) : super(key: key);

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _selectedIndex = 0;

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      DashboardScreen(userPhone: widget.userId),
      FriendsScreen(userPhone: widget.userId),
      GoalsScreen(userId: widget.userId),
      ProfileScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      body: _screens[_selectedIndex],
      bottomNavigationBar: BottomBarWithAd(
        navBar: DecoratedBox(
          decoration: BoxDecoration(color: theme.colorScheme.surface),
          child: Padding(
            padding: EdgeInsets.fromLTRB(0, 8, 0, bottomInset > 0 ? bottomInset : 12),
            child: BottomNavigationBar(
              currentIndex: _selectedIndex,
              type: BottomNavigationBarType.fixed,
              selectedItemColor: theme.colorScheme.primary,
              unselectedItemColor: theme.colorScheme.onSurface.withOpacity(0.7),
              showUnselectedLabels: true,
              backgroundColor: Colors.transparent,
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(Icons.dashboard_outlined),
                  label: 'Dashboard',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.group_outlined),
                  label: 'Friends',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.flag_outlined),
                  label: 'Goals',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.person_outline),
                  label: 'Profile',
                ),
              ],
              onTap: (i) {
                setState(() => _selectedIndex = i);
              },
            ),
          ),
        ),
      ),
    );
  }
}
