import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/theme.dart';

/// True when the device reports no network at all. A captive Wi-Fi still
/// reads as "online" here; billing surfaces its own clear error if the save
/// itself can't reach the server.
final offlineProvider = StreamProvider<bool>((ref) async* {
  final c = Connectivity();
  bool none(List<ConnectivityResult> r) =>
      r.isEmpty || r.every((x) => x == ConnectivityResult.none);
  try {
    yield none(await c.checkConnectivity());
  } catch (_) {
    yield false;
  }
  yield* c.onConnectivityChanged.map(none);
});

class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offline = ref.watch(offlineProvider).valueOrNull ?? false;
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      child: offline
          ? Material(
              color: AppColors.warning,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_off_rounded,
                          size: 16, color: Colors.black87),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Offline — showing saved data. New bills and payments need internet.',
                          style: TextStyle(
                              color: Colors.black87,
                              fontSize: 12,
                              fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            )
          : const SizedBox(width: double.infinity),
    );
  }
}
