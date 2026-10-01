import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/router/app_router.dart';
import '../../../core/services/location_service.dart';
import '../../../core/utils/date_range.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../data/attendance.dart';
import '../providers/attendance_providers.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  RangePreset _range = RangePreset.thisMonth;
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final todayAsync = ref.watch(todayAttendanceProvider);
    final historyAsync = ref.watch(attendanceInRangeProvider(_range));
    final today = todayAsync.value;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go(Routes.home),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(todayAttendanceProvider);
          ref.invalidate(attendanceInRangeProvider(_range));
          await ref.read(todayAttendanceProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            // ── Today ─────────────────────────────────────────────────────
            const SectionLabel('Today'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              IstDate.longLabel(IstDate.today()),
                              style: const TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              today == null
                                  ? 'Not marked yet'
                                  : 'Checked in at ${IstDate.timeLabel(today.checkInAt)}'
                                        '${today.checkOutAt != null ? ' · out ${IstDate.timeLabel(today.checkOutAt)}' : ''}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (today != null)
                        StatusChip(
                          label: today.status.label,
                          color: today.status.color,
                          background: today.status.background,
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Mark today as',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in AttendanceStatus.values)
                        ChoiceChip(
                          label: Text(s.label),
                          selected: today?.status == s,
                          onSelected: _saving ? null : (_) => _mark(s, today),
                          labelStyle: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: today?.status == s
                                ? Colors.white
                                : AppColors.onSurface,
                          ),
                          selectedColor: s.color,
                          backgroundColor: AppColors.surfaceContainerLow,
                          side: BorderSide(
                            color: today?.status == s
                                ? s.color
                                : AppColors.divider,
                          ),
                          showCheckmark: false,
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Starting your day from the home screen marks you present '
                    'automatically — use these only to correct it.',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: AppColors.outline,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),

            // ── History ───────────────────────────────────────────────────
            const SizedBox(height: 26),
            SectionLabel(
              'Record',
              trailing: DropdownButtonHideUnderline(
                child: DropdownButton<RangePreset>(
                  value: _range,
                  isDense: true,
                  borderRadius: BorderRadius.circular(12),
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                  ),
                  items: [
                    for (final p in RangePreset.values)
                      DropdownMenuItem(value: p, child: Text(p.label)),
                  ],
                  onChanged: (p) => setState(() => _range = p ?? _range),
                ),
              ),
            ),

            historyAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: LoadingView(),
              ),
              error: (e, _) => ErrorView(
                message: 'Could not load your attendance record.',
                onRetry: () =>
                    ref.invalidate(attendanceInRangeProvider(_range)),
              ),
              data: (records) {
                if (records.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: EmptyView(
                      icon: Icons.event_available_outlined,
                      title: 'Nothing marked yet',
                      message:
                          'Days you start from the home screen appear here automatically.',
                    ),
                  );
                }
                final working = records.where((r) => r.status.isWorking).length;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AppCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.insights_rounded,
                            size: 18,
                            color: AppColors.primary,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '$working of ${records.length} marked days worked'
                              ' · ${_range.subtitle}',
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: AppColors.onSurface,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final r in records) ...[
                      _RecordRow(record: r),
                      const SizedBox(height: 10),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _mark(
    AttendanceStatus status,
    AttendanceRecord? existing,
  ) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null || _saving) return;
    setState(() => _saving = true);

    // A working status wants a position stamp; leave and week-off do not, and
    // waiting for GPS to mark a leave day would be pointless friction.
    LatLngPoint? geo;
    if (status.isWorking && existing?.checkInAt == null) {
      try {
        geo = await LocationService.current();
      } catch (_) {}
    }

    try {
      await ref
          .read(attendanceRepositoryProvider)
          .mark(uid: uid, dateKey: IstDate.today(), status: status, geo: geo);
      ref.invalidate(todayAttendanceProvider);
      ref.invalidate(attendanceInRangeProvider(_range));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Today marked as ${status.label}')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _RecordRow extends StatelessWidget {
  const _RecordRow({required this.record});
  final AttendanceRecord record;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            height: 38,
            width: 38,
            decoration: BoxDecoration(
              color: record.status.background,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Text(
              IstDate.parse(record.date).day.toString(),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: record.status.color,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  IstDate.longLabel(record.date),
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  record.checkInAt == null
                      ? (record.note ?? '—')
                      : '${IstDate.timeLabel(record.checkInAt)}'
                            '${record.checkOutAt != null ? ' – ${IstDate.timeLabel(record.checkOutAt)}' : ''}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          StatusChip(
            label: record.status.label,
            color: record.status.color,
            background: record.status.background,
          ),
        ],
      ),
    );
  }
}
