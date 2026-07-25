import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../services/app_update_service.dart';
import 'app_brand_icon.dart';

/// Key storing the last version the user tapped "Later" on, so an optional
/// update is advertised once per release instead of on every cold start.
/// A forced update ignores this entirely.
const _snoozedVersionKey = 'update_snoozed_version';

/// Shows the branded update prompt for [info], unless the user already
/// snoozed this exact version (optional updates only).
///
/// Returns immediately when there's nothing to advertise, so callers can fire
/// this unconditionally after startup.
Future<void> maybeShowUpdateDialog(
  BuildContext context,
  AppUpdateInfo info, {
  bool isHindi = false,
}) async {
  if (!info.needsUpdate) return;

  if (!info.isForced) {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getString(_snoozedVersionKey) == info.latestVersion) return;
    } catch (_) {
      // Prefs unavailable — fall through and show it; a duplicate prompt is
      // better than silently skipping a real update.
    }
  }

  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    barrierDismissible: !info.isForced,
    builder: (_) => _AppUpdateDialog(info: info, isHindi: isHindi),
  );
}

class _AppUpdateDialog extends StatelessWidget {
  final AppUpdateInfo info;
  final bool isHindi;

  const _AppUpdateDialog({required this.info, required this.isHindi});

  Future<void> _openStore(BuildContext context) async {
    final url = info.storeUrl;
    if (url == null) return;
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isHindi
                ? 'स्टोर नहीं खुल सका। कृपया Play Store से अपडेट करें।'
                : 'Could not open the store. Please update from the Play Store.',
          ),
        ),
      );
    }
  }

  Future<void> _snooze(BuildContext context) async {
    // Remember this version so we don't re-prompt on every launch.
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_snoozedVersionKey, info.latestVersion);
    } catch (_) {
      /* non-fatal — worst case the prompt reappears next launch */
    }
    if (context.mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final forced = info.isForced;

    return PopScope(
      // A forced update must not be escapable via the system back gesture.
      canPop: !forced,
      child: Dialog(
        backgroundColor: Colors.white,
        insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppBrandIcon(size: 72, elevated: true),
              const SizedBox(height: 18),
              Text(
                forced
                    ? (isHindi ? 'अपडेट ज़रूरी है' : 'Update Required')
                    : (isHindi ? 'नया अपडेट उपलब्ध है' : 'Update Available'),
                textAlign: TextAlign.center,
                style: AppTextStyles.heading2.copyWith(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                forced
                    ? (isHindi
                        ? 'KrishiDukan का उपयोग जारी रखने के लिए कृपया नया वर्शन इंस्टॉल करें।'
                        : 'Please install the latest version to continue using KrishiDukan.')
                    : (isHindi
                        ? 'KrishiDukan का नया वर्शन उपलब्ध है — नए फ़ीचर्स और सुधारों के लिए अभी अपडेट करें।'
                        : 'A new version of KrishiDukan is available with the latest features and fixes.'),
                textAlign: TextAlign.center,
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.onSurfaceVariant,
                  height: 1.45,
                ),
              ),

              if (info.releaseNotes != null) ...[
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceVariant.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    info.releaseNotes!,
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.onSurface,
                      height: 1.5,
                    ),
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],

              const SizedBox(height: 14),
              // Version pill — reassures the user what they're moving to.
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'v${info.currentVersion}  →  v${info.latestVersion}',
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),

              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => _openStore(context),
                  icon: const Icon(Icons.system_update_alt_rounded, size: 18),
                  label: Text(isHindi ? 'अभी अपडेट करें' : 'Update Now'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    textStyle: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              if (!forced) ...[
                const SizedBox(height: 4),
                TextButton(
                  onPressed: () => _snooze(context),
                  child: Text(
                    isHindi ? 'बाद में' : 'Later',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
