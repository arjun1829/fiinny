import 'package:flutter/material.dart';

import '../app_state.dart';
import 'calls_screen.dart';
import 'common.dart';
import 'contacts_screen.dart';
import 'dashboard_screen.dart';
import 'pending_screen.dart';
import 'settings_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.state});
  final AppState state;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  var _tab = 0;

  @override
  void initState() {
    super.initState();
    widget.state.sync();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    return ListenableBuilder(
      listenable: s,
      builder: (context, _) {
        final pending = s.pending.length;
        return Scaffold(
          appBar: AppBar(
            title: const Text('Call Tracker'),
            actions: [
              IconButton(
                tooltip: 'Sync now',
                onPressed: s.syncing ? null : s.sync,
                icon: const Icon(Icons.sync),
              ),
              IconButton(
                tooltip: 'Settings',
                icon: const Icon(Icons.settings),
                onPressed: () => Navigator.push(
                    context, MaterialPageRoute(builder: (_) => SettingsScreen(state: s))),
              ),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(28),
              child: SyncBar(state: s),
            ),
          ),
          body: IndexedStack(index: _tab, children: [
            DashboardScreen(state: s, openPending: () => setState(() => _tab = 1)),
            PendingScreen(state: s),
            CallsScreen(state: s),
            ContactsScreen(state: s),
          ]),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              const NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Home'),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: pending > 0,
                  backgroundColor: kRed,
                  label: Text('$pending'),
                  child: const Icon(Icons.phone_missed),
                ),
                label: 'Pending',
              ),
              const NavigationDestination(icon: Icon(Icons.list_alt), label: 'All calls'),
              const NavigationDestination(icon: Icon(Icons.contacts_outlined), label: 'Contacts'),
            ],
          ),
        );
      },
    );
  }
}
