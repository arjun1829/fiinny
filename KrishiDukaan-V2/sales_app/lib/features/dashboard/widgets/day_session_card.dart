import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../../day_session/data/day_session.dart';

/// Start / end stamps, hours and distance for one working day.
class DaySessionCard extends StatelessWidget {
  const DaySessionCard({
    super.key,
    required this.session,
    required this.visitCount,
  });

  final DaySession session;
  final int visitCount;

  @override
  Widget build(BuildContext context) {
    final completed = session.isCompleted;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 42,
                width: 42,
                decoration: BoxDecoration(
                  color: completed
                      ? AppColors.successContainer
                      : AppColors.harvestContainer,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  completed ? Icons.task_alt_rounded : Icons.wb_sunny_rounded,
                  size: 22,
                  color: completed ? AppColors.success : AppColors.harvest,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      completed ? 'Day completed' : 'Day in progress',
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      IstDate.longLabel(session.date),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              StatusChip(
                label: completed ? 'Completed' : 'Active',
                color: completed ? AppColors.success : AppColors.harvest,
                background: completed
                    ? AppColors.successContainer
                    : AppColors.harvestContainer,
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 14),
          Row(
            children: [
              _Stat(
                icon: Icons.play_circle_outline_rounded,
                label: 'Started',
                value: IstDate.timeLabel(session.startedAt),
              ),
              _Stat(
                icon: Icons.stop_circle_outlined,
                label: 'Ended',
                value: completed ? IstDate.timeLabel(session.endedAt) : '—',
              ),
              _Stat(
                icon: Icons.timer_outlined,
                label: 'Hours',
                value: FormatUtils.duration(session.workedMinutes),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _Stat(
                icon: Icons.route_outlined,
                label: 'Distance',
                value: FormatUtils.distance(session.totalDistanceKm),
              ),
              _Stat(
                icon: Icons.storefront_outlined,
                label: 'Visits',
                value: '$visitCount',
              ),
              const _Stat(icon: null, label: '', value: ''),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.label, required this.value});

  final IconData? icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    if (icon == null) return const Expanded(child: SizedBox());
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: AppColors.outline),
              const SizedBox(width: 4),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
