import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// A back arrow that always works. When the screen was opened with
/// `context.go` (after checkout, from a notification) there is nothing to pop,
/// so Flutter shows no back arrow and the user had to close the app; this
/// pops when it can and otherwise goes to [fallback].
class BackOrHomeButton extends StatelessWidget {
  final String fallback;
  final Color? color;
  const BackOrHomeButton({super.key, this.fallback = '/profile', this.color});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      color: color,
      tooltip: MaterialLocalizations.of(context).backButtonTooltip,
      onPressed: () {
        final router = GoRouter.of(context);
        if (router.canPop()) {
          router.pop();
        } else {
          router.go(fallback);
        }
      },
    );
  }
}

/// A plain bar with [BackOrHomeButton] around [child], for the loading /
/// error / not-found states of screens whose normal state draws its own
/// (sliver) bar — those states otherwise had no way back at all.
class BackBarBody extends StatelessWidget {
  final Widget child;
  final String fallback;

  const BackBarBody({super.key, required this.child, this.fallback = '/'});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(leading: BackOrHomeButton(fallback: fallback)),
        body: child,
      );
}
