import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/router/app_router.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../../attendance/providers/attendance_providers.dart';
import '../../day_session/data/day_session.dart';
import '../../day_session/providers/day_controller.dart';
import '../../day_session/providers/day_session_providers.dart';
import '../../dealers/providers/dealer_providers.dart';
import '../widgets/day_session_card.dart';
import '../widgets/module_tile.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentSalesUserProvider);
    final sessionAsync = ref.watch(currentSessionProvider);
    final visitsAsync = ref.watch(todayVisitsProvider);
    final attendanceAsync = ref.watch(todayAttendanceProvider);
    final dayState = ref.watch(dayControllerProvider);

    final session = sessionAsync.value;
    final visitCount = visitsAsync.value?.length ?? 0;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _greeting(),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            Text(
              user?.displayName ?? 'Sales Executive',
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Profile',
            onPressed: () => context.go('${Routes.home}/profile'),
            icon: CircleAvatar(
              radius: 16,
              backgroundColor: AppColors.primary.withValues(alpha: 0.10),
              child: Text(
                user?.initials ?? '—',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(currentSessionProvider);
          ref.invalidate(todayVisitsProvider);
          ref.invalidate(todayAttendanceProvider);
          await ref.read(currentSessionProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            // ── Working day ───────────────────────────────────────────────
            if (sessionAsync.isLoading && session == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: LoadingView(),
              )
            else if (session == null || session.isCompleted)
              _DayActionCard(session: session, visitCount: visitCount)
            else
              _ActiveDay(session: session, visitCount: visitCount),

            if (dayState.error != null) ...[
              const SizedBox(height: 10),
              _ErrorBanner(
                message: dayState.error!,
                onDismiss: () =>
                    ref.read(dayControllerProvider.notifier).clearError(),
              ),
            ],

            // ── Today at a glance ─────────────────────────────────────────
            const SizedBox(height: 24),
            const SectionLabel('Today'),
            Row(
              children: [
                Expanded(
                  child: _MiniStat(
                    icon: Icons.storefront_rounded,
                    label: 'Visits',
                    value: '$visitCount',
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _MiniStat(
                    icon: Icons.how_to_reg_rounded,
                    label: 'Attendance',
                    value:
                        attendanceAsync.value?.status.label ??
                        (attendanceAsync.isLoading ? '…' : 'Not marked'),
                    color:
                        attendanceAsync.value?.status.color ??
                        AppColors.outline,
                  ),
                ),
              ],
            ),

            // ── Modules ───────────────────────────────────────────────────
            const SizedBox(height: 24),
            const SectionLabel('Modules'),
            ModuleTile(
              icon: Icons.storefront_rounded,
              title: 'Dealer Visits',
              subtitle:
                  'Log visits to retailers, distributors and manufacturers',
              accent: AppColors.primary,
              onTap: () => context.go(Routes.dealers),
            ),
            const SizedBox(height: 12),
            ModuleTile(
              icon: Icons.calendar_month_rounded,
              title: 'Daily Sessions',
              subtitle: 'Your day history with route maps and timelines',
              accent: AppColors.harvest,
              onTap: () => context.go('${Routes.home}/sessions'),
            ),
            const SizedBox(height: 12),
            ModuleTile(
              icon: Icons.how_to_reg_rounded,
              title: 'Attendance',
              subtitle: 'Mark your day and review your monthly record',
              accent: AppColors.info,
              onTap: () => context.go('${Routes.home}/attendance'),
            ),
            const SizedBox(height: 12),
            ModuleTile(
              icon: Icons.receipt_long_rounded,
              title: 'Expenses',
              subtitle: 'Claim field expenses and track approvals',
              accent: AppColors.success,
              onTap: () => context.go(Routes.expenses),
            ),
            const SizedBox(height: 12),
            ModuleTile(
              icon: Icons.link_rounded,
              title: 'Referrals & Offer Links',
              subtitle: 'Share your link, send ready-made plans, see who paid',
              accent: AppColors.primaryLight,
              onTap: () => context.go('${Routes.home}/referrals'),
            ),
            const SizedBox(height: 12),
            ModuleTile(
              icon: Icons.insert_chart_rounded,
              title: 'Reports',
              subtitle: 'Weekly and monthly performance summary',
              accent: AppColors.error,
              onTap: () => context.go(Routes.reports),
            ),
          ],
        ),
      ),
    );
  }

  static String _greeting() {
    final hour = IstDate.nowIst().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

// ── No open session: Start Day ─────────────────────────────────────────────

class _DayActionCard extends ConsumerWidget {
  const _DayActionCard({required this.session, required this.visitCount});

  final DaySession? session;
  final int visitCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(dayControllerProvider);
    final alreadyDone = session?.isCompleted ?? false;

    return Column(
      children: [
        if (alreadyDone) ...[
          DaySessionCard(session: session!, visitCount: visitCount),
          const SizedBox(height: 12),
        ],
        AppCard(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    height: 44,
                    width: 44,
                    decoration: BoxDecoration(
                      color: AppColors.harvestContainer,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.wb_sunny_rounded,
                      size: 22,
                      color: AppColors.harvest,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          alreadyDone
                              ? 'Start another session'
                              : 'Start your day',
                          style: const TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w800,
                            color: AppColors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Your location is captured to begin tracking',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.onSurfaceVariant,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: state.busy
                    ? null
                    : () => ref.read(dayControllerProvider.notifier).startDay(),
                child: _ButtonLabel(phase: state.phase, idleLabel: 'Start Day'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Open session: summary + End Day ────────────────────────────────────────

class _ActiveDay extends ConsumerWidget {
  const _ActiveDay({required this.session, required this.visitCount});

  final DaySession session;
  final int visitCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(dayControllerProvider);
    // An ACTIVE session dated before today is a day the rep forgot to close.
    final stale = session.date != IstDate.today();

    return Column(
      children: [
        if (stale) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.warningContainer,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.history_toggle_off_rounded,
                  size: 18,
                  color: AppColors.harvest,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'You have an unfinished day from '
                    '${IstDate.longLabel(session.date)}. End it before starting a new one.',
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: Color(0xFF8A6100),
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        DaySessionCard(session: session, visitCount: visitCount),
        const SizedBox(height: 12),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.error),
          onPressed: state.busy
              ? null
              : () => ref.read(dayControllerProvider.notifier).endDay(session),
          child: _ButtonLabel(phase: state.phase, idleLabel: 'End Day'),
        ),
      ],
    );
  }
}

/// Names the current network step so a long End Day never looks like a hang.
class _ButtonLabel extends StatelessWidget {
  const _ButtonLabel({required this.phase, required this.idleLabel});

  final DayPhase phase;
  final String idleLabel;

  @override
  Widget build(BuildContext context) {
    if (phase == DayPhase.idle) return Text(idleLabel);
    final text = switch (phase) {
      DayPhase.locating => 'Getting location…',
      DayPhase.calculating => 'Calculating route…',
      DayPhase.saving => 'Saving…',
      DayPhase.idle => idleLabel,
    };
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(
          height: 17,
          width: 17,
          child: CircularProgressIndicator(
            strokeWidth: 2.2,
            valueColor: AlwaysStoppedAnimation(Colors.white),
          ),
        ),
        const SizedBox(width: 10),
        Text(text),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 10),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: AppColors.errorContainer,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 18,
            color: AppColors.error,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.error,
                height: 1.4,
              ),
            ),
          ),
          IconButton(
            onPressed: onDismiss,
            visualDensity: VisualDensity.compact,
            icon: const Icon(
              Icons.close_rounded,
              size: 16,
              color: AppColors.error,
            ),
          ),
        ],
      ),
    );
  }
}
