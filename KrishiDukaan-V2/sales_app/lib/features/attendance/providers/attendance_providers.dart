import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/auth_provider.dart';
import '../../../core/utils/date_range.dart';
import '../data/attendance.dart';
import '../data/attendance_repository.dart';

final attendanceRepositoryProvider = Provider<AttendanceRepository>(
  (ref) => AttendanceRepository(),
);

final todayAttendanceProvider = FutureProvider<AttendanceRecord?>((ref) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return null;
  return ref.watch(attendanceRepositoryProvider).today(uid);
});

final attendanceInRangeProvider =
    FutureProvider.family<List<AttendanceRecord>, RangePreset>((
      ref,
      preset,
    ) async {
      final uid = ref.watch(currentUidProvider);
      if (uid == null) return const [];
      final (from, to) = preset.resolve();
      return ref.watch(attendanceRepositoryProvider).inRange(uid, from, to);
    });
