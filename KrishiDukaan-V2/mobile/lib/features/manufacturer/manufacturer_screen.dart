import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../dashboard/dashboard_screen.dart';

class ManufacturerScreen extends StatelessWidget {
  const ManufacturerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Manufacturer entry point — forward to the unified dashboard.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.mounted) context.go('/dashboard');
    });
    return const DashboardScreen();
  }
}
