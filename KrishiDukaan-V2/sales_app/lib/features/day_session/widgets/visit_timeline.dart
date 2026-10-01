import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/ist_date.dart';
import '../../dealers/data/dealer_visit.dart';
import '../data/day_session.dart';

/// The day as a vertical sequence: start, each visit in route order, end.
class VisitTimeline extends StatelessWidget {
  const VisitTimeline({super.key, required this.session, required this.visits});

  final DaySession session;
  final List<DealerVisit> visits;

  @override
  Widget build(BuildContext context) {
    final ordered = sortVisits(visits);
    return Column(
      children: [
        _Node(
          icon: Icons.play_arrow_rounded,
          color: AppColors.success,
          title: 'Day started',
          subtitle: IstDate.timeLabel(session.startedAt),
          isFirst: true,
          isLast: ordered.isEmpty && session.endedAt == null,
        ),
        for (var i = 0; i < ordered.length; i++)
          _Node(
            index: i + 1,
            color: AppColors.primary,
            title: ordered[i].dealerName,
            subtitle: IstDate.timeLabel(ordered[i].visitedAt),
            detail: ordered[i].purposeLabel,
            note: ordered[i].notes,
            isLast: i == ordered.length - 1 && session.endedAt == null,
          ),
        if (session.endedAt != null)
          _Node(
            icon: Icons.stop_rounded,
            color: AppColors.error,
            title: 'Day ended',
            subtitle: IstDate.timeLabel(session.endedAt),
            isLast: true,
          ),
      ],
    );
  }
}

class _Node extends StatelessWidget {
  const _Node({
    this.icon,
    this.index,
    required this.color,
    required this.title,
    required this.subtitle,
    this.detail,
    this.note,
    this.isFirst = false,
    this.isLast = false,
  });

  final IconData? icon;
  final int? index;
  final Color color;
  final String title;
  final String subtitle;
  final String? detail;
  final String? note;
  final bool isFirst;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Rail
          Column(
            children: [
              Container(
                width: 2,
                height: 6,
                color: isFirst ? Colors.transparent : AppColors.divider,
              ),
              Container(
                height: 28,
                width: 28,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                  border: Border.all(color: color.withValues(alpha: 0.35)),
                ),
                alignment: Alignment.center,
                child: icon != null
                    ? Icon(icon, size: 15, color: color)
                    : Text(
                        '$index',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: color,
                        ),
                      ),
              ),
              Expanded(
                child: Container(
                  width: 2,
                  color: isLast ? Colors.transparent : AppColors.divider,
                ),
              ),
            ],
          ),
          const SizedBox(width: 14),
          // Content
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(top: 6, bottom: isLast ? 0 : 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.onSurface,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  if (detail != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      detail!,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: color,
                      ),
                    ),
                  ],
                  if (note != null && note!.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 11,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainer,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        note!.trim(),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.onSurfaceVariant,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
