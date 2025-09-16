// lib/ui_devtools/parse_debug_screen.dart
import 'package:flutter/material.dart';

class ParseDebugScreen extends StatelessWidget {
  const ParseDebugScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Parser Devtools (disabled)')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Legacy parsing_core-based devtools are disabled in this build.',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
