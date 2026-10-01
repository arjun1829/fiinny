import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/auth_provider.dart';
import '../../../core/services/directions_service.dart';
import '../../../core/services/location_service.dart';
import '../../../core/utils/ist_date.dart';
import '../../attendance/data/attendance.dart';
import '../../attendance/providers/attendance_providers.dart';
import '../../dealers/data/dealer_visit.dart';
import '../../dealers/providers/dealer_providers.dart';
import '../data/day_session.dart';
import '../data/day_session_repository.dart';
import 'day_session_providers.dart';

/// What the Start/End Day button is doing right now. Each value maps to its own
/// button label — ending a day takes three network round trips and a rep
/// staring at one undifferentiated spinner assumes the app has hung.
enum DayPhase { idle, locating, calculating, saving }

class DayState {
  final DayPhase phase;
  final String? error;
  const DayState({this.phase = DayPhase.idle, this.error});

  bool get busy => phase != DayPhase.idle;
}

final dayControllerProvider = NotifierProvider<DayController, DayState>(
  DayController.new,
);

class DayController extends Notifier<DayState> {
  @override
  DayState build() => const DayState();

  /// Opens the working day at the rep's current position, and marks them
  /// present for the day in the same action — a rep who has started their day
  /// in the field is present by definition, and asking them to record it twice
  /// is how attendance data ends up incomplete.
  Future<bool> startDay() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null || state.busy) return false;

    state = const DayState(phase: DayPhase.locating);
    try {
      final geo = await LocationService.current();

      state = const DayState(phase: DayPhase.saving);
      final sessionId = await ref
          .read(daySessionRepositoryProvider)
          .startDay(uid, geo);

      // Attendance is a convenience, not the point of Start Day: if it fails
      // the session is already open and the rep can mark the day by hand.
      try {
        await ref
            .read(attendanceRepositoryProvider)
            .mark(
              uid: uid,
              dateKey: IstDate.today(),
              status: AttendanceStatus.present,
              geo: geo,
              source: 'AUTO',
              daySessionId: sessionId,
            );
      } catch (_) {}

      _refresh();
      state = const DayState();
      return true;
    } on LocationException catch (e) {
      state = DayState(error: e.message);
      return false;
    } catch (_) {
      state = const DayState(
        error: 'Could not start your day. Please try again.',
      );
      return false;
    }
  }

  /// Closes the day: captures the end position, resolves the road route over
  /// start → each of today's visits in order → end, then writes the session as
  /// COMPLETED and stamps the attendance check-out.
  Future<bool> endDay(DaySession session) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null || state.busy) return false;

    try {
      state = const DayState(phase: DayPhase.locating);
      final endGeo = await LocationService.current();

      state = const DayState(phase: DayPhase.calculating);
      // Visits are read for the session's OWN date, not for today — a rep
      // closing yesterday's forgotten session must get yesterday's route.
      final visits = await ref
          .read(dealerVisitRepositoryProvider)
          .forDate(uid, session.date);
      final ordered = sortVisits(visits);
      final visitPoints = [
        for (final v in ordered)
          if (v.geo != null) v.geo!,
      ];

      final route = await DirectionsService.route(
        DaySessionRepository.waypointsFor(session, visitPoints, endGeo),
      );

      state = const DayState(phase: DayPhase.saving);
      await ref
          .read(daySessionRepositoryProvider)
          .endDay(session: session, endGeo: endGeo, route: route);

      try {
        await ref
            .read(attendanceRepositoryProvider)
            .checkOut(uid: uid, dateKey: session.date, geo: endGeo);
      } catch (_) {}

      _refresh();
      state = const DayState();
      return true;
    } on LocationException catch (e) {
      state = DayState(error: e.message);
      return false;
    } catch (_) {
      state = const DayState(
        error: 'Could not end your day. Please try again.',
      );
      return false;
    }
  }

  void clearError() => state = const DayState();

  void _refresh() {
    ref.invalidate(currentSessionProvider);
    ref.invalidate(sessionHistoryProvider);
    ref.invalidate(todayAttendanceProvider);
    ref.invalidate(todayVisitsProvider);
  }
}
