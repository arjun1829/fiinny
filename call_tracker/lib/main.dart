import 'package:flutter/material.dart';

import 'app_state.dart';
import 'core/background.dart';
import 'ui/home_shell.dart';
import 'ui/setup_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = await AppState.create();
  if (state.prefs.setupDone) {
    // Re-register in case the phone cleared scheduled work (update, reboot).
    scheduleBackgroundSync();
  }
  runApp(CallTrackerApp(state: state));
}

class CallTrackerApp extends StatefulWidget {
  const CallTrackerApp({super.key, required this.state});
  final AppState state;

  @override
  State<CallTrackerApp> createState() => _CallTrackerAppState();
}

class _CallTrackerAppState extends State<CallTrackerApp> {
  late bool _setupDone = widget.state.prefs.setupDone;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Call Tracker',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1565C0)),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF1565C0), brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: _setupDone
          ? HomeShell(state: widget.state)
          : SetupScreen(state: widget.state, onDone: () => setState(() => _setupDone = true)),
    );
  }
}
