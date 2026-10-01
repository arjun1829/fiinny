import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/router/app_router.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../../dashboard/widgets/day_session_card.dart';
import '../../dealers/providers/dealer_providers.dart';
import '../providers/day_session_providers.dart';
import '../widgets/route_map.dart';
import '../widgets/visit_timeline.dart';

class SessionDetailScreen extends ConsumerWidget {
  const SessionDetailScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUidProvider);
    final sessionAsync = ref.watch(sessionByIdProvider(sessionId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Session Details'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go('${Routes.home}/sessions'),
        ),
      ),
      body: sessionAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(
          message: 'Could not load this session.',
          onRetry: () => ref.invalidate(sessionByIdProvider(sessionId)),
        ),
        data: (session) {
          // A session belonging to someone else is treated as missing rather
          // than "forbidden" — the rules would deny the visit reads anyway, and
          // there is nothing useful the rep could do with the distinction.
          if (session == null || session.salesExecutiveId != uid) {
            return EmptyView(
              icon: Icons.help_outline_rounded,
              title: 'Session not found',
              message:
                  'This session may have been removed, or it belongs to another account.',
              action: FilledButton(
                onPressed: () => context.go('${Routes.home}/sessions'),
                style: FilledButton.styleFrom(minimumSize: const Size(180, 48)),
                child: const Text('Back to sessions'),
              ),
            );
          }

          final visitsAsync = ref.watch(visitsForDateProvider(session.date));
          final visits = visitsAsync.value ?? const [];

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Text(
                IstDate.longLabel(session.date),
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              DaySessionCard(session: session, visitCount: visits.length),

              const SizedBox(height: 24),
              const SectionLabel('Route map'),
              if (visitsAsync.isLoading)
                const SizedBox(height: 300, child: LoadingView())
              else
                RouteMap(session: session, visits: visits),

              const SizedBox(height: 24),
              SectionLabel(
                'Visit timeline',
                trailing: visits.isEmpty
                    ? null
                    : StatusChip(
                        label: '${visits.length}',
                        color: AppColors.primary,
                        background: AppColors.primaryContainer,
                      ),
              ),
              if (visitsAsync.isLoading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 30),
                  child: LoadingView(),
                )
              else
                AppCard(
                  child: visits.isEmpty
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            'No dealer visits were logged on this day.',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppColors.onSurfaceVariant,
                            ),
                          ),
                        )
                      : VisitTimeline(session: session, visits: visits),
                ),
            ],
          );
        },
      ),
    );
  }
}
