import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../data/dealer.dart';
import '../data/dealer_visit.dart';

class DealerCard extends StatefulWidget {
  const DealerCard({
    super.key,
    required this.dealer,
    required this.canManage,
    required this.lastVisit,
    required this.todayVisit,
    required this.onMarkVisited,
    required this.onEdit,
    required this.onDeactivate,
    required this.onDetail,
  });

  final Dealer dealer;

  /// Whether this account may edit or remove this dealer. Mirrors the
  /// `dealers` update rule: the rep who created it, or any admin.
  final bool canManage;
  final DealerVisit? lastVisit;
  final DealerVisit? todayVisit;
  final VoidCallback onMarkVisited;
  final VoidCallback onEdit;
  final VoidCallback onDeactivate;

  /// Opens the dealer detail page. Wired only to the name/owner text below —
  /// not the whole card — so it never competes with Call, Directions, Edit,
  /// Remove or Mark as Visited, each of which is its own tap target.
  final VoidCallback onDetail;

  @override
  State<DealerCard> createState() => _DealerCardState();
}

class _DealerCardState extends State<DealerCard> {
  @override
  Widget build(BuildContext context) {
    final d = widget.dealer;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Avatar(imageUrl: d.imageUrl),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: widget.onDetail,
                        borderRadius: BorderRadius.circular(8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              d.shopName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              d.ownerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12.5,
                                color: AppColors.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    StatusChip(
                      label: d.type.label,
                      color: AppColors.primary,
                      background: AppColors.primaryContainer,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (d.phone.isNotEmpty)
                  _Line(icon: Icons.phone_outlined, text: d.phone),
                if (d.address.isNotEmpty)
                  _Line(
                    icon: Icons.place_outlined,
                    text: d.address,
                    maxLines: 2,
                  ),
                const SizedBox(height: 12),
                _visitStrip(),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: widget.todayVisit != null
                      ? OutlinedButton.icon(
                          onPressed: widget.onMarkVisited,
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                            foregroundColor: AppColors.primary,
                            side: BorderSide(
                              color: AppColors.primary.withValues(alpha: 0.35),
                            ),
                          ),
                          icon: const Icon(Icons.add_rounded, size: 18),
                          label: const Text('Add another visit'),
                        )
                      : FilledButton.icon(
                          onPressed: widget.onMarkVisited,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                          ),
                          icon: const Icon(Icons.task_alt_rounded, size: 18),
                          label: const Text('Mark as Visited'),
                        ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Row(
            children: [
              _Action(
                icon: Icons.call_outlined,
                label: 'Call',
                color: AppColors.primary,
                enabled: d.phone.isNotEmpty,
                onTap: () => _launch(Uri(scheme: 'tel', path: d.phone)),
              ),
              const _VDivider(),
              _Action(
                icon: Icons.navigation_outlined,
                label: 'Directions',
                color: AppColors.onSurfaceVariant,
                enabled: d.geo != null,
                onTap: () => _launch(
                  Uri.parse(
                    'https://www.google.com/maps/dir/?api=1&destination=${d.geo!.lat},${d.geo!.lng}',
                  ),
                ),
              ),
              if (widget.canManage) ...[
                const _VDivider(),
                _Action(
                  icon: Icons.edit_outlined,
                  label: 'Edit',
                  color: AppColors.onSurfaceVariant,
                  enabled: true,
                  onTap: widget.onEdit,
                ),
                const _VDivider(),
                _Action(
                  icon: Icons.remove_circle_outline_rounded,
                  label: 'Remove',
                  color: AppColors.error,
                  enabled: true,
                  onTap: _confirmDeactivate,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _visitStrip() {
    if (widget.todayVisit != null) {
      return _Strip(
        icon: Icons.check_circle_rounded,
        color: AppColors.success,
        background: AppColors.successContainer,
        text:
            'Visited today · ${IstDate.timeLabel(widget.todayVisit!.visitedAt)}'
            ' · ${widget.todayVisit!.purposeLabel}',
      );
    }
    if (widget.lastVisit != null) {
      return _Strip(
        icon: Icons.schedule_rounded,
        color: AppColors.onSurfaceVariant,
        background: AppColors.surfaceContainer,
        text:
            'Last visit ${IstDate.relativeLabel(widget.lastVisit!.visitedAt)}'
            ' · ${widget.lastVisit!.purposeLabel}',
      );
    }
    return const _Strip(
      icon: Icons.schedule_rounded,
      color: AppColors.outline,
      background: AppColors.surfaceContainer,
      text: 'No visits yet',
    );
  }

  Future<void> _confirmDeactivate() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove dealer?'),
        content: Text(
          '${widget.dealer.shopName} will be hidden from the dealer list for '
          'the whole team. Visits already logged against it are kept.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true) widget.onDeactivate();
  }

  Future<void> _launch(Uri uri) async {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No app available to handle that.')),
      );
    }
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text, this.maxLines = 1});

  final IconData icon;
  final String text;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 14, color: AppColors.outline),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              maxLines: maxLines,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.onSurfaceVariant,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Strip extends StatelessWidget {
  const _Strip({
    required this.icon,
    required this.color,
    required this.background,
    required this.text,
  });

  final IconData icon;
  final Color color;
  final Color background;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: color,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.label,
    required this.color,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: enabled ? 1 : 0.35,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(
              children: [
                Icon(icon, size: 17, color: color),
                const SizedBox(height: 3),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VDivider extends StatelessWidget {
  const _VDivider();

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 34, color: AppColors.divider);
}

/// Dealer photo when one exists, falling back to the plain icon avatar
/// otherwise — including when the URL is missing, malformed, or fails to load,
/// so a bad reference never breaks the card.
class _Avatar extends StatelessWidget {
  const _Avatar({required this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    if (url == null || url.isEmpty) return const _FallbackIcon();

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => showDialog<void>(
        context: context,
        builder: (_) => _ImagePreviewDialog(imageUrl: url),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.network(
          url,
          height: 44,
          width: 44,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => const _FallbackIcon(),
        ),
      ),
    );
  }
}

/// Full, uncropped view of a dealer photo. Opened only when a photo exists —
/// the caller never wires this up for the fallback icon.
class _ImagePreviewDialog extends StatelessWidget {
  const _ImagePreviewDialog({required this.imageUrl});

  final String imageUrl;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.black,
      insetPadding: const EdgeInsets.all(12),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Tapping the backdrop dismisses, same as the barrier itself —
          // InteractiveViewer would otherwise swallow the tap.
          Positioned.fill(
            child: GestureDetector(
              onTap: () => Navigator.pop(context),
              behavior: HitTestBehavior.opaque,
            ),
          ),
          InteractiveViewer(
            minScale: 1,
            maxScale: 4,
            child: Image.network(
              imageUrl,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) => const Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'This photo could not be loaded.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 13.5),
                ),
              ),
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: Material(
              color: Colors.black54,
              shape: const CircleBorder(),
              child: InkWell(
                onTap: () => Navigator.pop(context),
                customBorder: const CircleBorder(),
                child: const Padding(
                  padding: EdgeInsets.all(8),
                  child: Icon(
                    Icons.close_rounded,
                    size: 20,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FallbackIcon extends StatelessWidget {
  const _FallbackIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      width: 44,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Icon(
        Icons.storefront_rounded,
        size: 21,
        color: AppColors.primary,
      ),
    );
  }
}
