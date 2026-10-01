import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/router/app_router.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../../dealers/providers/dealer_providers.dart';
import '../data/day_session.dart';
import '../providers/day_session_providers.dart';

/// Per-date visit counts for the whole history.
///
/// Derived from ONE range query starting at the oldest session rather than a
/// query per session — a rep with six months of history would otherwise cost
/// ~180 reads just to open this list.
final _visitCountByDateProvider = FutureProvider<Map<String, int>>((ref) async {
  final uid = ref.watch(currentUidProvider);
  final sessions = ref.watch(sessionHistoryProvider).value;
  if (uid == null || sessions == null || sessions.isEmpty) return const {};

  final oldest = sessions
      .map((s) => s.date)
      .where((d) => d.isNotEmpty)
      .fold<String?>(null, (a, b) => a == null || b.compareTo(a) < 0 ? b : a);
  if (oldest == null) return const {};

  final visits = await ref
      .read(dealerVisitRepositoryProvider)
      .since(uid, oldest);
  final counts = <String, int>{};
  for (final v in visits) {
    if (v.visitedAt == null) continue;
    final key = IstDate.key(v.visitedAt!);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
});

class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(sessionHistoryProvider);
    final counts = ref.watch(_visitCountByDateProvider).value ?? const {};

    return Scaffold(
      appBar: AppBar(
        title: const Text('Daily Sessions'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go(Routes.home),
        ),
      ),
      body: sessionsAsync.when(
        loading: () => const LoadingView(message: 'Loading your history…'),
        error: (e, _) => ErrorView(
          message:
              'Could not load your sessions. Check your connection and try again.',
          onRetry: () => ref.invalidate(sessionHistoryProvider),
        ),
        data: (sessions) {
          if (sessions.isEmpty) {
            return const EmptyView(
              icon: Icons.calendar_month_outlined,
              title: 'No sessions yet',
              message:
                  'Tap Start Day on the home screen to begin tracking a working day. '
                  'Each day you complete shows up here with its route and timeline.',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(sessionHistoryProvider);
              await ref.read(sessionHistoryProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: sessions.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final s = sessions[i];
                return _SessionRow(
                  session: s,
                  visitCount: counts[s.date] ?? 0,
                  onTap: () => context.go('${Routes.home}/sessions/${s.id}'),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({
    required this.session,
    required this.visitCount,
    required this.onTap,
  });

  final DaySession session;
  final int visitCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final completed = session.isCompleted;
    return AppCard(
      onTap: onTap,
      child: Column(
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
                alignment: Alignment.center,
                child: Icon(
                  completed ? Icons.check_rounded : Icons.access_time_rounded,
                  size: 21,
                  color: completed ? AppColors.success : AppColors.harvest,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      IstDate.longLabel(session.date),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${IstDate.timeLabel(session.startedAt)} – '
                      '${completed ? IstDate.timeLabel(session.endedAt) : 'ongoing'}',
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
          const SizedBox(height: 14),
          Row(
            children: [
              _Pill(
                icon: Icons.storefront_outlined,
                text: FormatUtils.plural(visitCount, 'visit'),
              ),
              const SizedBox(width: 8),
              _Pill(
                icon: Icons.timer_outlined,
                text: FormatUtils.duration(session.workedMinutes),
              ),
              const SizedBox(width: 8),
              _Pill(
                icon: Icons.route_outlined,
                text: FormatUtils.distance(session.totalDistanceKm),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainer,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 13, color: AppColors.outline),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
