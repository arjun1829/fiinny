import 'package:flutter/material.dart';

/// Shell that manages a single overlay entry used for ads.
class AdsShell extends StatefulWidget {
  const AdsShell({super.key, this.child});

  final Widget? child;

  @override
  State<AdsShell> createState() => _AdsShellState();
}

class _AdsShellState extends State<AdsShell> {
  OverlayEntry? _entry;
  bool _inserting = false;
  bool _scheduled = false;

  OverlayState? _resolveOverlay() {
    final overlay = Overlay.maybeOf(context);
    if (overlay != null) {
      return overlay;
    }

    final navigator = Navigator.maybeOf(context, rootNavigator: true);
    return navigator?.overlay;
  }

  @override
  void initState() {
    super.initState();
    _entry = OverlayEntry(builder: _buildBanner);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _scheduleInsert();
  }

  void _scheduleInsert() {
    if (!mounted || _inserting) return;
    if (_entry?.mounted ?? false) {
      return;
    }
    _inserting = true;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        _inserting = false;
        return;
      }

      final overlay = _resolveOverlay();
      if (overlay == null) {
        _inserting = false;
        if (!_scheduled) {
          _scheduled = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _scheduled = false;
            if (mounted) {
              _scheduleInsert();
            }
          });
        }
        return;
      }

      _entry ??= OverlayEntry(builder: _buildBanner);
      if (!(_entry!.mounted)) {
        overlay.insert(_entry!);
      }

      _inserting = false;
    });
  }

  @override
  void didUpdateWidget(covariant AdsShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    _scheduleInsert();
  }

  @override
  void dispose() {
    try {
      _entry?.remove();
    } catch (_) {}
    _entry = null;
    _inserting = false;
    _scheduled = false;
    super.dispose();
  }

  Widget _buildBanner(BuildContext context) {
    return Positioned.fill(
      child: IgnorePointer(
        ignoring: true,
        child: Container(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return widget.child ?? const SizedBox.shrink();
  }
}

extension AdsInsetsX on BuildContext {
  double adsBottomPadding({double extra = 0}) {
    final media = MediaQuery.of(this);
    final safePadding = media.padding.bottom > 0
        ? media.padding.bottom
        : media.viewPadding.bottom;
    return safePadding + extra;
  }
}
