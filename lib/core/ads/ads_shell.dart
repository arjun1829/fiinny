import 'dart:async';
import 'package:flutter/material.dart';

import 'ad_service.dart';
import 'ad_slots.dart';

const double kGlobalAnchoredAdHeight = 60.0;

class AdsVisibilityController extends ValueNotifier<bool> {
  AdsVisibilityController({bool visible = true}) : super(visible);

  bool get isVisible => value;

  void show() => value = true;
  void hide() => value = false;
  void setVisible(bool show) => value = show;
}

class AdsVisibilityScope extends InheritedNotifier<AdsVisibilityController> {
  const AdsVisibilityScope({
    super.key,
    required this.controller,
    required super.child,
  }) : super(notifier: controller);

  final AdsVisibilityController controller;

  static AdsVisibilityController? maybeOf(BuildContext context) {
    final scope =
        context.dependOnInheritedWidgetOfExactType<AdsVisibilityScope>();
    return scope?.controller;
  }

  static AdsVisibilityController of(BuildContext context) {
    final controller = maybeOf(context);
    assert(controller != null,
        'AdsVisibilityScope.of() called with no AdsShell ancestor.');
    return controller!;
  }

  static const double bannerHeight = kGlobalAnchoredAdHeight;
}

class AdsShell extends StatefulWidget {
  const AdsShell({super.key, this.child});

  final Widget? child;

  @override
  State<AdsShell> createState() => _AdsShellState();
}

class _AdsShellState extends State<AdsShell> {
  static const double _bannerHeight = kGlobalAnchoredAdHeight;

  late final AdsVisibilityController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AdsVisibilityController();
    unawaited(AdService.initLater());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final child = widget.child ?? const SizedBox.shrink();

    return AdsVisibilityScope(
      controller: _controller,
      child: ValueListenableBuilder<bool>(
        valueListenable: _controller,
        child: child,
        builder: (context, visible, child) {
          final media = MediaQuery.of(context);
          final adHeight = visible ? _bannerHeight : 0.0;
          final mediaWithPadding = media.copyWith(
            padding: media.padding.copyWith(
              bottom: media.padding.bottom + adHeight,
            ),
            viewPadding: media.viewPadding.copyWith(
              bottom: media.viewPadding.bottom + adHeight,
            ),
          );

          return Stack(
            children: [
              Positioned.fill(
                child: MediaQuery(
                  data: mediaWithPadding,
                  child: child!,
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  switchInCurve: Curves.easeOut,
                  switchOutCurve: Curves.easeIn,
                  child: visible
                      ? const AdsBannerSlot(
                          padding: EdgeInsets.zero,
                        )
                      : const SizedBox.shrink(),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

extension AdsInsetsX on BuildContext {
  double adsBottomPadding({double extra = 0}) {
    final media = MediaQuery.of(this);
    final safePadding = media.padding.bottom > 0
        ? media.padding.bottom
        : media.viewPadding.bottom;
    final bannerHeight = AdsVisibilityScope.maybeOf(this)?.isVisible == true
        ? AdsVisibilityScope.bannerHeight
        : 0.0;
    final effective = safePadding < bannerHeight ? bannerHeight : safePadding;
    return effective + extra;
  }
}
