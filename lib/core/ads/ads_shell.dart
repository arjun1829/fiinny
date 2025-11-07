import 'package:flutter/material.dart';

/// Shell that manages a single overlay entry used for ads.
class AdsShell extends StatefulWidget {
  const AdsShell({super.key, this.child});

  final Widget? child;

  @override
  State<AdsShell> createState() => _AdsShellState();
}

class _AdsShellState extends State<AdsShell> {
  OverlayEntry? _bannerEntry;
  bool _inserted = false;
  bool _scheduledInsert = false;

  @override
  void initState() {
    super.initState();
    _bannerEntry = OverlayEntry(builder: _buildBanner);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _scheduleInsert();
  }

  void _scheduleInsert() {
    if (_scheduledInsert || _inserted || _bannerEntry == null) return;
    _scheduledInsert = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduledInsert = false;
      if (!mounted || _inserted || _bannerEntry == null) return;
      final overlay = Overlay.of(context, rootOverlay: true);
      if (overlay != null && overlay.mounted) {
        overlay.insert(_bannerEntry!);
        _inserted = true;
      }
    });
  }

  @override
  void didUpdateWidget(covariant AdsShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_inserted) {
      _scheduleInsert();
    }
  }

  @override
  void dispose() {
    _bannerEntry?.remove();
    _bannerEntry = null;
    _inserted = false;
    _scheduledInsert = false;
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
