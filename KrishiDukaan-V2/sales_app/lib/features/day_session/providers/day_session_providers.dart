import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/auth_provider.dart';
import '../../../core/utils/date_range.dart';
import '../data/day_session.dart';
import '../data/day_session_repository.dart';

final daySessionRepositoryProvider = Provider<DaySessionRepository>(
  (ref) => DaySessionRepository(),
);

/// The session the dashboard acts on — the open one if there is any, else today's.
final currentSessionProvider = FutureProvider<DaySession?>((ref) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return null;
  return ref.watch(daySessionRepositoryProvider).currentSession(uid);
});

/// Full session history, newest day first.
final sessionHistoryProvider = FutureProvider<List<DaySession>>((ref) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const [];
  return ref.watch(daySessionRepositoryProvider).history(uid);
});

final sessionByIdProvider = FutureProvider.family<DaySession?, String>((
  ref,
  sessionId,
) async {
  return ref.watch(daySessionRepositoryProvider).byId(sessionId);
});

final sessionsInRangeProvider =
    FutureProvider.family<List<DaySession>, RangePreset>((ref, preset) async {
      final uid = ref.watch(currentUidProvider);
      if (uid == null) return const [];
      final (from, to) = preset.resolve();
      return ref.watch(daySessionRepositoryProvider).inRange(uid, from, to);
    });
