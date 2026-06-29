import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// App version + build number read from the platform package metadata
/// (driven by pubspec `version:`), so the UI never drifts from the real build.
final appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  final version = info.version; // e.g. 2.0.6
  final build = info.buildNumber; // e.g. 106
  return build.isNotEmpty ? '$version ($build)' : version;
});
