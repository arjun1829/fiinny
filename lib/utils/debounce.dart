// lib/utils/debounce.dart
import 'dart:async';

class Debouncer {
  final Duration delay;
  Timer? _t;
  Debouncer([this.delay = const Duration(milliseconds: 180)]);
  void call(void Function() run) {
    _t?.cancel();
    _t = Timer(delay, run);
  }
  void dispose() => _t?.cancel();
}
