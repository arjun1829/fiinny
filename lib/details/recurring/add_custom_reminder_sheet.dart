// lib/details/recurring/add_custom_reminder_sheet.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/recurring_service.dart';
import '../models/recurring_rule.dart';
import '../models/recurring_scope.dart';
import '../models/shared_item.dart';
import '../../core/notifications/local_notifications.dart';

// ✅ Same pipeline you already verified
import '../../services/push/push_service.dart';
import '../../services/notification_service.dart';

class AddCustomReminderSheet extends StatefulWidget {
  final String userPhone;
  final RecurringScope scope;
  final List<String> participantUserIds;
  final bool mirrorToFriend;
  const AddCustomReminderSheet({
    Key? key,
    required this.userPhone,
    required this.scope,
    this.participantUserIds = const <String>[],
    this.mirrorToFriend = true,
  }) : super(key: key);

  @override
  State<AddCustomReminderSheet> createState() => _AddCustomReminderSheetState();
}

class _AddCustomReminderSheetState extends State<AddCustomReminderSheet> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();

  // First due date (date-only), default = today
  DateTime _firstDue = DateTime(
    DateTime.now().year,
    DateTime.now().month,
    DateTime.now().day,
  );

  // Frequency UI
  String _freq = 'monthly'; // 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  int _weekday = DateTime.now().weekday; // 1..7 (Mon..Sun)
  int _customDays = 3; // for custom: every N days (>=1)

  // Notification UI
  bool _notifyEnabled = true;
  int _daysBefore = 2; // 0..7
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);
  bool _notifyBoth = true;

  bool _saving = false;
  final _svc = RecurringService();

  bool get _isGroup => widget.scope.isGroup;
  String? get _friendId => widget.scope.friendId;
  String? get _groupId => widget.scope.groupId;

  List<String> get _groupParticipantIds {
    final ids = <String>{widget.userPhone.trim()};
    for (final phone in widget.participantUserIds) {
      final trimmed = phone.trim();
      if (trimmed.isNotEmpty) ids.add(trimmed);
    }
    return ids.where((e) => e.isNotEmpty).toList();
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  // --------- Pickers ---------
  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: _time);
    if (t != null) setState(() => _time = t);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = _firstDue.isBefore(now)
        ? DateTime(now.year, now.month, now.day)
        : _firstDue;

    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 3),
      helpText: 'Pick first due date',
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: Colors.teal),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        _firstDue = DateTime(picked.year, picked.month, picked.day);
        _weekday = _firstDue.weekday; // sensible default for weekly
      });
    }
  }

  // --------- Formatting helpers ---------
  String _fmtDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.year}';

  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  // --------- Save ---------
  Future<void> _save() async {
    if (_saving) return;
    if (!_form.currentState!.validate()) return;

    final now = DateTime.now();

    // Build rule based on frequency choice
    final participants = _isGroup
        ? _groupParticipantIds
            .map((id) => ParticipantShare(userId: id))
            .toList()
        : [
            ParticipantShare(userId: widget.userPhone, sharePct: 50.0),
            ParticipantShare(userId: _friendId!, sharePct: 50.0),
          ];

    final rule = RecurringRule(
      frequency: _freq,
      anchorDate: _firstDue, // respected as first due
      status: 'active',
      amount: 0, // pure reminder
      participants: participants,
      // For monthly store dueDay (clamped ≤ 28 for Feb safety)
      dueDay: _freq == 'monthly' ? _firstDue.day.clamp(1, 28) : null,
      // For weekly store weekday (1..7)
      weekday: _freq == 'weekly' ? _weekday.clamp(1, 7) : null,
      // For custom store intervalDays (requires your RecurringRule support)
      intervalDays: _freq == 'custom' ? _customDays.clamp(1, 365) : null,
    );

    // Compute first next due: if firstDue is today/future -> use it; else roll forward
    final computed = _svc.computeNextDue(rule, from: now);
    final DateTime nextDue =
    _firstDue.isAfter(now.subtract(const Duration(minutes: 1)))
        ? _firstDue
        : computed;

    final item = SharedItem(
      id: '', // service assigns id
      type: 'reminder',
      title: _title.text.trim(),
      rule: rule,
      nextDueAt: nextDue,
      participantUserIds: _isGroup ? _groupParticipantIds : null,
      ownerUserId: widget.userPhone,
      groupId: _isGroup ? _groupId : null,
      sharing: _isGroup ? 'group' : null,
    );

    setState(() => _saving = true);
    try {
      // 0) Make sure the local-notifs pipeline is ready (same as prefs screen)
      await PushService.init(); // idempotent; ensures channels on Android & hooks

      String newId;
      if (_isGroup) {
        final ids = _groupParticipantIds;
        newId = await _svc.addToGroup(
          _groupId!,
          item,
          participantUserIds: ids,
        );

        if (_notifyEnabled) {
          await _svc.setNotifyPrefsGroup(
            groupId: _groupId!,
            itemId: newId,
            enabled: true,
            daysBefore: _daysBefore,
            timeHHmm: _fmtTime(_time),
          );

          await _scheduleLocalOnce(
            id: newId,
            title: item.title?.trim().isEmpty == true ? 'Reminder' : item.title!,
            due: nextDue,
          );
        }
      } else {
        newId = await _svc.add(
          widget.userPhone,
          _friendId!,
          item,
          mirrorToFriend: widget.mirrorToFriend,
        );

        await _svc.setNotifyPrefs(
          userPhone: widget.userPhone,
          friendId: _friendId!,
          itemId: newId,
          enabled: _notifyEnabled,
          daysBefore: _daysBefore,
          timeHHmm: _fmtTime(_time),
          notifyBoth: _notifyBoth,
          mirrorToFriend: widget.mirrorToFriend,
        );

        if (_notifyEnabled) {
          await _scheduleLocalOnce(
            id: newId,
            title: item.title?.trim().isEmpty == true ? 'Reminder' : item.title!,
            due: nextDue,
          );
        }
      }

      if (!mounted) return;
      Navigator.pop(context, true); // signal success
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save reminder: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Schedules a single local notification using the verified stack.
  /// Tries LocalNotifs first. If that fails, falls back to NotificationService.showNotification.
  Future<void> _scheduleLocalOnce({
    required String id,
    required String title,
    required DateTime due,
  }) async {
    final now = DateTime.now();

    // Compute planned fire time = (due @ chosen time) - daysBefore
    final planned = DateTime(
      due.year,
      due.month,
      due.day,
      _time.hour,
      _time.minute,
    ).subtract(Duration(days: _daysBefore));

    // If it's in the past (e.g., large daysBefore), bump to now + 1 min.
    final fireAt = planned.isAfter(now)
        ? planned
        : now.add(const Duration(minutes: 1));

    final payload = _isGroup && _groupId != null
        ? 'app://group/${_groupId}/recurring'
        : 'app://friend/${_friendId}/recurring';
    final itemId = _isGroup && _groupId != null
        ? 'group_${_groupId}_$id'
        : id;

    // Try your wrapper first (keeps your existing implementation)
    try {
      try {
        await LocalNotifs.init();
      } catch (_) {
        // ignore; scheduleOnce may still work if already initialized
      }

      await LocalNotifs.scheduleOnce(
        itemId: itemId,
        title: title,
        fireAt: fireAt,
        body: 'Due on ${_fmtDate(due)}',
        payload: payload,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Reminder scheduled for ${_fmtDate(fireAt)} ${_fmtTime(TimeOfDay.fromDateTime(fireAt))}',
            ),
          ),
        );
      }
      return;
    } catch (_) {
      // Fall through to the fallback below.
    }

    // 🔥 Fallback: use the prefs-screen path for reliability in QA.
    final ms = fireAt.difference(DateTime.now()).inMilliseconds;
    if (ms <= 0) {
      await NotificationService().showNotification(
        title: title,
        body: 'Due on ${_fmtDate(due)}',
        payload: payload,
      );
    } else {
      Future.delayed(Duration(milliseconds: ms), () async {
        await NotificationService().showNotification(
          title: title,
          body: 'Due on ${_fmtDate(due)}',
          payload: payload,
        );
      });
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Reminder saved. Fallback scheduled for '
                '${_fmtDate(fireAt)} ${_fmtTime(TimeOfDay.fromDateTime(fireAt))}',
          ),
        ),
      );
    }
  }

  // Same test path as NotificationPrefsScreen (known-good)
  Future<void> _testLocalNow() async {
    try {
      await PushService.init(); // ensure channels
      await PushService.debugLocalTest();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Test notification sent (PushService).')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Test failed: $e')),
      );
    }
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return SafeArea(
      child: AnimatedPadding(
        // Prevent keyboard overflow in bottom sheet
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOut,
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Grab handle
                Center(
                  child: Container(
                    height: 5,
                    width: 56,
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.black26,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),

                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: cs.primary.withOpacity(.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.alarm_rounded, color: cs.primary),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text(
                        'Add Custom Reminder',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 18,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // ---- Title ----
                _sectionCard(
                  child: TextFormField(
                    controller: _title,
                    autofocus: true,
                    maxLength: 80,
                    decoration: const InputDecoration(
                      counterText: '',
                      labelText: 'Title',
                      hintText: 'e.g. Pay society guard, water can, etc.',
                      prefixIcon: Icon(Icons.edit_note_rounded),
                    ),
                    textInputAction: TextInputAction.next,
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) return 'Enter a title';
                      if (v.trim().length < 3) return 'Make it at least 3 chars';
                      return null;
                    },
                  ),
                ),
                const SizedBox(height: 12),

                // ---- First due date ----
                _sectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.event_rounded),
                        title: Text('First due date'),
                        subtitle: Text('This is the first occurrence'),
                      ),
                      InkWell(
                        onTap: _pickDate,
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 12),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Text(
                                _fmtDate(_firstDue),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                              const Spacer(),
                              TextButton.icon(
                                onPressed: _pickDate,
                                icon: const Icon(Icons.edit_calendar_outlined),
                                label: const Text('Change'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ---- Repeat options ----
                _sectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.repeat_rounded),
                        title: Text('Repeat'),
                        subtitle: Text('Choose how often to repeat'),
                      ),
                      DropdownButtonFormField<String>(
                        value: _freq,
                        decoration: const InputDecoration(
                          labelText: 'Frequency',
                          prefixIcon: Icon(Icons.autorenew_rounded),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'daily', child: Text('Every day')),
                          DropdownMenuItem(value: 'weekly', child: Text('Every week')),
                          DropdownMenuItem(value: 'monthly', child: Text('Every month')),
                          DropdownMenuItem(value: 'yearly', child: Text('Every year')),
                          DropdownMenuItem(value: 'custom', child: Text('Custom (every N days)')),
                        ],
                        onChanged: (v) => setState(() => _freq = v ?? 'monthly'),
                      ),
                      const SizedBox(height: 8),

                      if (_freq == 'weekly') ...[
                        DropdownButtonFormField<int>(
                          value: _weekday,
                          decoration: const InputDecoration(
                            labelText: 'Weekday',
                            prefixIcon: Icon(Icons.event_available_outlined),
                          ),
                          items: const [
                            DropdownMenuItem(value: 1, child: Text('Monday')),
                            DropdownMenuItem(value: 2, child: Text('Tuesday')),
                            DropdownMenuItem(value: 3, child: Text('Wednesday')),
                            DropdownMenuItem(value: 4, child: Text('Thursday')),
                            DropdownMenuItem(value: 5, child: Text('Friday')),
                            DropdownMenuItem(value: 6, child: Text('Saturday')),
                            DropdownMenuItem(value: 7, child: Text('Sunday')),
                          ],
                          onChanged: (v) => setState(() => _weekday = v ?? 1),
                        ),
                      ],

                      if (_freq == 'custom') ...[
                        const SizedBox(height: 8),
                        TextFormField(
                          initialValue: _customDays.toString(),
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: const InputDecoration(
                            labelText: 'Every N days',
                            hintText: 'e.g. 3',
                            prefixIcon: Icon(Icons.timelapse_rounded),
                          ),
                          validator: (v) {
                            if (_freq != 'custom') return null;
                            final n = int.tryParse(v ?? '');
                            if (n == null || n < 1) return 'Enter a number ≥ 1';
                            if (n > 365) return 'Keep it ≤ 365 days';
                            return null;
                          },
                          onChanged: (v) {
                            final n = int.tryParse(v);
                            if (n != null && n >= 1 && n <= 365) {
                              setState(() => _customDays = n);
                            }
                          },
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ---- Notify section ----
                _sectionCard(
                  child: Column(
                    children: [
                      SwitchListTile.adaptive(
                        value: _notifyEnabled,
                        onChanged: (v) => setState(() => _notifyEnabled = v),
                        title: const Text('Notify'),
                        subtitle: const Text('Send a local notification before the due'),
                        contentPadding: EdgeInsets.zero,
                      ),
                      AnimatedCrossFade(
                        crossFadeState: _notifyEnabled
                            ? CrossFadeState.showFirst
                            : CrossFadeState.showSecond,
                        duration: const Duration(milliseconds: 150),
                        firstChild: Column(
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.notifications_active, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Slider(
                                    value: _daysBefore.toDouble(),
                                    min: 0,
                                    max: 7,
                                    divisions: 7,
                                    label: '$_daysBefore day(s) before',
                                    onChanged: (v) =>
                                        setState(() => _daysBefore = v.toInt()),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                OutlinedButton.icon(
                                  icon: const Icon(Icons.access_time),
                                  onPressed: _pickTime,
                                  label: Text(_fmtTime(_time)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: cs.primary.withOpacity(.08),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  'Next alert (preview): ${_fmtDate(_previewFireAt())} at ${_fmtTime(TimeOfDay.fromDateTime(_previewFireAt()))}',
                                  style: TextStyle(
                                    color: cs.primary,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: OutlinedButton.icon(
                                icon: const Icon(Icons.notification_important_outlined),
                                label: const Text('Test on this device'),
                                onPressed: _testLocalNow,
                              ),
                            ),
                            const SizedBox(height: 8),
                            if (!_isGroup)
                              CheckboxListTile(
                                value: _notifyBoth,
                                onChanged: (v) =>
                                    setState(() => _notifyBoth = v ?? true),
                                title: const Text('Notify both participants'),
                                subtitle: const Text(
                                    'Sends to you and your friend (recommended)'),
                                dense: true,
                                controlAffinity: ListTileControlAffinity.leading,
                                contentPadding: EdgeInsets.zero,
                              ),
                          ],
                        ),
                        secondChild: const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Actions
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed:
                        _saving ? null : () => Navigator.of(context).maybePop(),
                        icon: const Icon(Icons.close_rounded),
                        label: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _saving ? null : _save,
                        icon: _saving
                            ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                            : const Icon(Icons.check_rounded),
                        label: const Text('Save'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  DateTime _previewFireAt() {
    // Preview uses current choices; may be in the past (that’s OK for preview)
    final planned = DateTime(
      _firstDue.year,
      _firstDue.month,
      _firstDue.day,
      _time.hour,
      _time.minute,
    ).subtract(Duration(days: _daysBefore));
    return planned;
  }

  Widget _sectionCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}
