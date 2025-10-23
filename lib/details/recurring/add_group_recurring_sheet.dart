import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/recurring_rule.dart';
import '../models/shared_item.dart';
import '../services/recurring_service.dart';

// local notifs (best-effort preview)
import '../../core/notifications/local_notifications.dart';

class AddGroupRecurringSheet extends StatefulWidget {
  final String groupId;
  final String currentUserPhone;
  /// 'recurring' | 'subscription' | 'reminder'
  final String typeKey;
  final List<String> participantUserIds;
  const AddGroupRecurringSheet({
    Key? key,
    required this.groupId,
    required this.currentUserPhone,
    this.typeKey = 'recurring',
    this.participantUserIds = const <String>[],
  }) : super(key: key);

  @override
  State<AddGroupRecurringSheet> createState() => _AddGroupRecurringSheetState();
}

class _AddGroupRecurringSheetState extends State<AddGroupRecurringSheet> {
  final _form = GlobalKey<FormState>();
  final _svc = RecurringService();

  final _title = TextEditingController();
  final _amount = TextEditingController();
  final _note   = TextEditingController();

  // cadence
  String _freq = 'monthly'; // daily|weekly|monthly|yearly|custom
  int    _dueDay = DateTime.now().day.clamp(1, 28);
  int    _weekday = DateTime.now().weekday; // 1..7
  int    _intervalDays = 7;

  // notify
  bool _notify = true;
  int  _daysBefore = 2;
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.typeKey == 'subscription') {
      _freq = 'monthly';
    } else if (widget.typeKey == 'reminder') {
      _amount.text = '0';
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  double _parseAmt() {
    final s = _amount.text.replaceAll(',', '').trim();
    return double.tryParse(s) ?? 0.0;
  }

  String _fmtDate(DateTime d) =>
      '${d.day.toString().padLeft(2,'0')}-${d.month.toString().padLeft(2,'0')}-${d.year}';
  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2,'0')}:${t.minute.toString().padLeft(2,'0')}';

  Future<void> _save() async {
    if (_saving) return;
    if (!_form.currentState!.validate()) return;

    final now = DateTime.now();
    final title = _title.text.trim();

    final participantIds = <String>{
      ...widget.participantUserIds,
      widget.currentUserPhone,
    }
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();

    if (participantIds.isEmpty) {
      final fallback = widget.currentUserPhone.trim();
      if (fallback.isNotEmpty) {
        participantIds.add(fallback);
      }
    }

    final participants = participantIds
        .map((id) => ParticipantShare(userId: id))
        .toList(growable: false);

    final rule = RecurringRule(
      frequency: _freq,
      anchorDate: DateTime(now.year, now.month, now.day),
      status: 'active',
      amount: widget.typeKey == 'reminder' ? 0.0 : _parseAmt(),
      participants: participants,
      dueDay: (_freq == 'monthly' || _freq == 'yearly') ? _dueDay.clamp(1, 28) : null,
      weekday: _freq == 'weekly' ? _weekday.clamp(1, 7) : null,
      intervalDays: _freq == 'custom' ? _intervalDays.clamp(1, 365) : null,
    );

    // First nextDue (respect "today or future" if possible)
    DateTime next = _svc.computeNextDue(rule, from: now);

    final item = SharedItem(
      id: '',
      type: widget.typeKey,          // 'recurring' | 'subscription' | 'reminder'
      title: title,
      note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      rule: rule,
      nextDueAt: next,
      participantUserIds: participantIds,
      ownerUserId: widget.currentUserPhone,
      groupId: widget.groupId,
      sharing: 'group',
      meta: {
        'createdIn': 'group',
      },
    );

    setState(() => _saving = true);
    try {
      final id = await _svc.addToGroup(
        widget.groupId,
        item,
        participantUserIds: participantIds,
      );

      if (_notify) {
        await _svc.setNotifyPrefsGroup(
          groupId: widget.groupId,
          itemId: id,
          enabled: true,
          daysBefore: _daysBefore,
          timeHHmm: _fmtTime(_time),
        );

        // Best-effort local preview (doesn't need to be perfect)
        try {
          await LocalNotifs.init();
          final planned = DateTime(
            next.year, next.month, next.day, _time.hour, _time.minute,
          ).subtract(Duration(days: _daysBefore));
          final fireAt = planned.isAfter(now) ? planned : now.add(const Duration(minutes: 1));
          await LocalNotifs.scheduleOnce(
            itemId: 'group_${widget.groupId}_$id',
            title: title.isEmpty ? 'Reminder' : title,
            body: 'Due on ${_fmtDate(next)}',
            fireAt: fireAt,
          );
        } catch (_) {}
      }

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSub = widget.typeKey == 'subscription';
    final isReminder = widget.typeKey == 'reminder';

    return SafeArea(
      child: AnimatedPadding(
        duration: const Duration(milliseconds: 150),
        padding: EdgeInsets.only(
          left: 16, right: 16, top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(height: 5, width: 56,
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.black26, borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.teal.withOpacity(.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        isSub ? Icons.subscriptions_rounded
                            : (isReminder ? Icons.alarm_rounded : Icons.repeat_rounded),
                        color: Colors.teal,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        isSub ? 'Add Group Subscription'
                            : (isReminder ? 'Add Group Reminder' : 'Add Group Recurring'),
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                // Title
                TextFormField(
                  controller: _title,
                  autofocus: true,
                  maxLength: 80,
                  decoration: InputDecoration(
                    counterText: '',
                    labelText: isSub ? 'Service name' : 'Title',
                    prefixIcon: Icon(isSub ? Icons.subscriptions_outlined : Icons.edit_rounded),
                  ),
                  validator: (v) =>
                  (v == null || v.trim().length < 3) ? 'Enter a valid title' : null,
                ),
                const SizedBox(height: 10),

                // Amount (not for pure reminder)
                if (!isReminder) ...[
                  TextFormField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                    decoration: const InputDecoration(
                      labelText: 'Amount (₹)',
                      prefixIcon: Icon(Icons.currency_rupee),
                    ),
                    validator: (_) => _parseAmt() <= 0 ? 'Enter a valid amount' : null,
                  ),
                  const SizedBox(height: 10),
                ],

                // Cadence
                DropdownButtonFormField<String>(
                  value: _freq,
                  items: const [
                    DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                    DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                    DropdownMenuItem(value: 'yearly', child: Text('Yearly')),
                    DropdownMenuItem(value: 'daily', child: Text('Daily')),
                    DropdownMenuItem(value: 'custom', child: Text('Custom (every N days)')),
                  ],
                  onChanged: (v) => setState(() => _freq = v ?? 'monthly'),
                  decoration: const InputDecoration(
                    labelText: 'Repeat',
                    prefixIcon: Icon(Icons.repeat_rounded),
                  ),
                ),

                const SizedBox(height: 8),
                if (_freq == 'monthly' || _freq == 'yearly')
                  DropdownButtonFormField<int>(
                    value: _dueDay,
                    items: List.generate(28, (i) => i + 1)
                        .map((d) => DropdownMenuItem(value: d, child: Text('Day $d')))
                        .toList(),
                    onChanged: (v) => setState(() => _dueDay = v ?? 1),
                    decoration: const InputDecoration(
                      labelText: 'Due day (1–28)',
                      prefixIcon: Icon(Icons.event_outlined),
                    ),
                  ),
                if (_freq == 'weekly') ...[
                  const SizedBox(height: 8),
                  DropdownButtonFormField<int>(
                    value: _weekday,
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
                    decoration: const InputDecoration(
                      labelText: 'Weekday',
                      prefixIcon: Icon(Icons.event_available_outlined),
                    ),
                  ),
                ],
                if (_freq == 'custom') ...[
                  const SizedBox(height: 8),
                  TextFormField(
                    initialValue: '7',
                    decoration: const InputDecoration(
                      labelText: 'Every N days',
                      prefixIcon: Icon(Icons.timelapse_rounded),
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    validator: (v) {
                      final n = int.tryParse(v ?? '');
                      if (n == null || n < 1) return 'Enter a number ≥ 1';
                      return null;
                    },
                    onChanged: (v) => setState(() {
                      final n = int.tryParse(v);
                      if (n != null) _intervalDays = n.clamp(1, 365);
                    }),
                  ),
                ],

                const SizedBox(height: 10),
                TextFormField(
                  controller: _note,
                  minLines: 2, maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Notes (optional)',
                    prefixIcon: Icon(Icons.sticky_note_2_outlined),
                  ),
                ),

                const SizedBox(height: 12),
                SwitchListTile.adaptive(
                  value: _notify,
                  onChanged: (v) => setState(() => _notify = v),
                  title: const Text('Notify'),
                  subtitle: const Text('Send a local reminder before due'),
                  contentPadding: EdgeInsets.zero,
                ),
                AnimatedCrossFade(
                  crossFadeState: _notify ? CrossFadeState.showFirst : CrossFadeState.showSecond,
                  duration: const Duration(milliseconds: 150),
                  firstChild: Row(
                    children: [
                      const Icon(Icons.notifications_active, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Slider(
                          value: _daysBefore.toDouble(),
                          min: 0, max: 7, divisions: 7,
                          label: '$_daysBefore day(s) before',
                          onChanged: (v) => setState(() => _daysBefore = v.toInt()),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final t = await showTimePicker(context: context, initialTime: _time);
                          if (t != null) setState(() => _time = t);
                        },
                        icon: const Icon(Icons.access_time),
                        label: Text(_fmtTime(_time)),
                      ),
                    ],
                  ),
                  secondChild: const SizedBox.shrink(),
                ),

                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _saving ? null : () => Navigator.pop(context),
                        icon: const Icon(Icons.close_rounded),
                        label: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _saving ? null : _save,
                        icon: _saving
                            ? const SizedBox(width:18,height:18,child:CircularProgressIndicator(strokeWidth:2))
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
}
