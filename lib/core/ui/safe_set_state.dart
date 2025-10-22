// lib/core/ui/safe_set_state.dart
import 'package:flutter/widgets.dart';

extension StateSetStateSafe on State {
  void setStateSafe(VoidCallback fn) {
    if (!mounted) return;
    // ignore: invalid_use_of_protected_member
    setState(fn);
  }
}
