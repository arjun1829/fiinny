// lib/details/recurring/add_recurring_basic_screen.dart
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/recurring_service.dart';
import '../models/recurring_rule.dart';
import '../models/recurring_scope.dart';
import '../models/shared_item.dart';

// Local notifs & push (already in your project)
import '../../core/notifications/local_notifications.dart';
import '../../services/push/push_service.dart';

// Media + storage (for compressed attachment)
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:firebase_storage/firebase_storage.dart';

class AddRecurringBasicScreen extends StatefulWidget {
  final String userPhone;
  final RecurringScope scope;
  final List<String> participantUserIds;
  final bool mirrorToFriend;

  /// Optional initial values so this screen is globally usable
  final String? initialTitle;
  final double? initialAmount;
  final String? initialFrequency; // 'weekly'|'monthly'|'yearly'|'custom'
  final int? initialDueDay; // for monthly/yearly (1..28)
  final int? initialWeekday; // for weekly (0=Sun..6=Sat)
  final int? initialIntervalDays; // for custom

  AddRecurringBasicScreen({
    Key? key,
    required this.userPhone,
    required this.scope,
    this.participantUserIds = const <String>[],
    this.mirrorToFriend = true,
    this.initialTitle,
    this.initialAmount,
    this.initialFrequency,
    this.initialDueDay,
    this.initialWeekday,
    this.initialIntervalDays,
  })  : assert(scope.userPhone != null || scope.isGroup,
            'Recurring scope must include user phone for friend or be group'),
        super(key: key);

  @override
  State<AddRecurringBasicScreen> createState() =>
      _AddRecurringBasicScreenState();
}

class _AddRecurringBasicScreenState extends State<AddRecurringBasicScreen>
    with TickerProviderStateMixin {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();

  final _scroll = ScrollController();
  final _detailsKey = GlobalKey();
  final _reminderKey = GlobalKey();

  // Frequency
  String _frequency = 'monthly'; // weekly | monthly | yearly | custom
  int? _dueDay; // 1..28 for monthly/yearly
  int? _weekday; // 0..6 (Sun=0) for weekly
  int? _intervalDays; // for custom (>=1)

  // Split
  String _split = 'equal'; // equal | custom
  double _userShare = 50.0;
  double _friendShare = 50.0;

  // Reminder UI
  bool _notifyEnabled = true;
  int _daysBefore = 2;
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);

  // Calendar helper
  DateTime? _pickedCalendarDate;

  // Attachment (compressed)
  File? _attachedImage;
  String? _attachmentDownloadUrl;

  final _svc = RecurringService();
  bool _saving = false;

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

  // ---------- Presets ----------
  // You can mix image assets + glossy icons.
  final List<_Preset> _presets = const [
    // Top shared (with images)
    _Preset('Rent',
        frequency: 'monthly',
        dueDay: 1,
        suggestedAmount: 12000,
        asset: 'assets/presets/rent.png',
        priority: 1),
    _Preset('Maintenance',
        frequency: 'monthly',
        dueDay: 5,
        suggestedAmount: 1500,
        asset: 'assets/presets/maintenance.png',
        priority: 2),
    _Preset('Maid',
        frequency: 'monthly',
        dueDay: 1,
        suggestedAmount: 2500,
        asset: 'assets/presets/maid.png',
        priority: 3),
    _Preset('Cook',
        frequency: 'monthly',
        dueDay: 1,
        suggestedAmount: 3500,
        asset: 'assets/presets/cook.png',
        priority: 4),

    // Utilities (images)
    _Preset('Broadband / Wi-Fi',
        frequency: 'monthly',
        dueDay: 7,
        suggestedAmount: 799,
        asset: 'assets/presets/broadband.png',
        priority: 5),
    _Preset('Electricity',
        frequency: 'monthly',
        dueDay: 12,
        suggestedAmount: 1200,
        asset: 'assets/presets/electricity.png',
        priority: 6),
    _Preset('Water Bill',
        frequency: 'monthly',
        dueDay: 15,
        suggestedAmount: 350,
        asset: 'assets/presets/water.png',
        priority: 7),
    _Preset('DTH / TV',
        frequency: 'monthly',
        dueDay: 20,
        suggestedAmount: 350,
        asset: 'assets/presets/dth.png',
        priority: 8),

    // Essentials (images)
    _Preset('Online Groceries',
        frequency: 'weekly',
        weekday: 6, // Sat
        suggestedAmount: 1000,
        asset: 'assets/presets/groceries.png',
        priority: 9),
    _Preset('Milk',
        frequency: 'weekly',
        weekday: 1, // Mon
        suggestedAmount: 250,
        asset: 'assets/presets/milk.png',
        priority: 10),
    _Preset('Water Can',
        frequency: 'weekly',
        weekday: 5, // Fri
        suggestedAmount: 120,
        asset: 'assets/presets/watercan.png',
        priority: 11),

    // Lifestyle (images)
    _Preset('Gym',
        frequency: 'monthly',
        dueDay: 15,
        suggestedAmount: 1200,
        asset: 'assets/presets/gym.png',
        priority: 12),
    _Preset('Fuel',
        frequency: 'weekly',
        weekday: 0, // Sun
        suggestedAmount: 800,
        asset: 'assets/presets/fuel.png',
        priority: 13),

    // “Brand style” (images where possible; else icon+tint fallback)
    _Preset('Rentomojo',
        frequency: 'monthly',
        dueDay: 5,
        suggestedAmount: 999,
        asset: 'assets/presets/rentomojo.png',
        priority: 50),
    _Preset('Urban Company',
        frequency: 'monthly',
        dueDay: 10,
        suggestedAmount: 499,
        asset: 'assets/presets/urban_company.png',
        priority: 51),
    _Preset('Airtel Xstream Fiber',
        frequency: 'monthly',
        dueDay: 7,
        suggestedAmount: 799,
        asset: 'assets/presets/airtel_xstream.png',
        priority: 52),
    _Preset('JioFiber',
        frequency: 'monthly',
        dueDay: 7,
        suggestedAmount: 699,
        asset: 'assets/presets/jiofiber.png',
        priority: 53),
    _Preset('Tata Play',
        frequency: 'monthly',
        dueDay: 20,
        suggestedAmount: 350,
        asset: 'assets/presets/tataplay.png',
        priority: 54),

    // A couple of glossy-icon fallbacks (no image provided, still look good)
    _Preset('Househelp',
        frequency: 'monthly',
        dueDay: 1,
        suggestedAmount: 2200,
        icon: Icons.cleaning_services_rounded,
        color: Color(0xFF22C55E),
        priority: 60),
  ];

  @override
  void initState() {
    super.initState();

    // Seed from optional initial values
    _title.text = widget.initialTitle?.trim() ?? '';
    if (widget.initialAmount != null) {
      _amount.text = widget.initialAmount!.toStringAsFixed(
        widget.initialAmount!.truncateToDouble() == widget.initialAmount!
            ? 0
            : 2,
      );
    }

    _frequency = widget.initialFrequency ?? 'monthly';
    _dueDay = widget.initialDueDay ?? DateTime.now().day.clamp(1, 28);
    _weekday = widget.initialWeekday ?? (DateTime.now().weekday % 7);
    _intervalDays = (widget.initialIntervalDays ?? 7).clamp(1, 365);

    if (_frequency == 'weekly') {
      _dueDay = null;
    } else if (_frequency == 'custom') {
      _dueDay = null;
      _weekday = null;
    } else {
      _weekday = null;
      _intervalDays = null;
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    _notes.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // ---------------- helpers ----------------
  double _parseAmount() {
    final s = _amount.text.replaceAll(',', '').trim();
    return double.tryParse(s) ?? 0.0;
  }

  void _normalizeFromUser(double v) {
    _userShare = v.clamp(0, 100);
    _friendShare = 100 - _userShare;
  }

  Future<void> _scrollTo(GlobalKey key) async {
    await Future.delayed(const Duration(milliseconds: 60));
    final ctx = key.currentContext;
    if (ctx == null) return;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null) return;
    final y =
        box.localToGlobal(Offset.zero, ancestor: context.findRenderObject()).dy;
    await _scroll.animateTo(
      _scroll.offset + y - 96,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  void _applyPreset(_Preset p) {
    HapticFeedback.selectionClick();
    setState(() {
      _title.text = p.title;
      if (_parseAmount() <= 0 && p.suggestedAmount > 0) {
        _amount.text = p.suggestedAmount.toStringAsFixed(0);
      }
      _frequency = p.frequency;
      if (_frequency == 'weekly') {
        _weekday = p.weekday ?? (DateTime.now().weekday % 7);
        _dueDay = null;
        _intervalDays = null;
      } else if (_frequency == 'custom') {
        _intervalDays = (p.intervalDays ?? 7).clamp(1, 365);
        _weekday = null;
        _dueDay = null;
      } else {
        _dueDay = (p.dueDay ?? DateTime.now().day).clamp(1, 28);
        _weekday = null;
        _intervalDays = null;
      }
    });
    _scrollTo(_detailsKey);
  }

  // Calendar helper
  Future<void> _pickCalendarDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
      helpText: 'Pick a date to set due/day',
      builder: (c, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(
            primary: Colors.black,
            onPrimary: Colors.white,
            surface: Colors.white,
            onSurface: Colors.black87,
          ),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;

    setState(() {
      _pickedCalendarDate = picked;
      if (_frequency == 'weekly') {
        _weekday = picked.weekday % 7; // 1-7 → 1..6,0
      } else if (_frequency == 'custom') {
        // keep as anchorDate only
      } else {
        _dueDay = picked.day.clamp(1, 28);
      }
    });
  }

  // Reminder helpers
  String _fmtDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';
  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: _time);
    if (t != null) setState(() => _time = t);
  }

  String _reminderPreviewText(DateTime due) {
    final planned = DateTime(due.year, due.month, due.day, _time.hour, _time.minute)
        .subtract(Duration(days: _daysBefore));
    return '${_fmtDate(planned)} ${_fmtTime(TimeOfDay.fromDateTime(planned))}';
  }

  Future<void> _scheduleLocalOnce({
    required String id,
    required String title,
    required DateTime due,
  }) async {
    final now = DateTime.now();
    final planned = DateTime(due.year, due.month, due.day, _time.hour, _time.minute)
        .subtract(Duration(days: _daysBefore));
    final fireAt = planned.isAfter(now) ? planned : now.add(const Duration(minutes: 1));
    final payload = _isGroup && _groupId != null
        ? 'app://group/${_groupId}/recurring'
        : 'app://friend/${_friendId}/recurring';
    final itemId = _isGroup && _groupId != null
        ? 'group_${_groupId}_$id'
        : id;
    try {
      await LocalNotifs.init();
      await LocalNotifs.scheduleOnce(
        itemId: itemId,
        title: title.isEmpty ? 'Reminder' : title,
        fireAt: fireAt,
        body: 'Due on ${_fmtDate(due)}',
        payload: payload,
      );
    } catch (_) {
      await PushService.showLocal(
        title: title.isEmpty ? 'Reminder' : title,
        body: 'Saved — you’ll be reminded before ${_fmtDate(due)}',
        deeplink: payload,
      );
    }
  }

  // Pick → compress → upload attachment
  Future<void> _pickCompressUploadAttachment() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 92,
      );
      if (picked == null) return;

      final original = File(picked.path);
      final targetPath =
          '${Directory.systemTemp.path}/rec_${DateTime.now().millisecondsSinceEpoch}.jpg';

      final compressed = await FlutterImageCompress.compressAndGetFile(
        original.path,
        targetPath,
        quality: 82,
        minWidth: 1280,
        minHeight: 1280,
        format: CompressFormat.jpeg,
      );

      final toUpload = File(compressed?.path ?? original.path);
      setState(() => _attachedImage = toUpload);

      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final storagePath = _isGroup && _groupId != null
          ? 'groups/${_groupId}/recurring/$timestamp.jpg'
          : 'users/${widget.userPhone}/recurring/${_friendId ?? 'unknown'}/$timestamp.jpg';

      // Upload to Firebase Storage
      final ref = FirebaseStorage.instance.ref().child(storagePath);
      final task = await ref.putFile(
        toUpload,
        SettableMetadata(contentType: 'image/jpeg'),
      );
      final url = await task.ref.getDownloadURL();
      setState(() => _attachmentDownloadUrl = url);

      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Attachment uploaded')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Attachment failed: $e')));
      }
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) {
      await _scroll.animateTo(0,
          duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      return;
    }

    final amt = _parseAmount();

    // Participants
    final participants = _isGroup
        ? _groupParticipantIds
            .map((id) => ParticipantShare(userId: id))
            .toList()
        : <ParticipantShare>[
            ParticipantShare(
              userId: widget.userPhone,
              sharePct: _split == 'equal' ? 50.0 : _userShare,
            ),
            ParticipantShare(
              userId: _friendId!,
              sharePct: _split == 'equal' ? 50.0 : _friendShare,
            ),
          ];

    // Rule
    final rule = RecurringRule(
      frequency: _frequency,
      anchorDate: _pickedCalendarDate ?? DateTime.now(),
      status: 'active',
      amount: amt,
      participants: participants,
      dueDay: (_frequency == 'weekly' || _frequency == 'custom')
          ? null
          : (_dueDay ?? 1).clamp(1, 28),
      weekday: _frequency == 'weekly' ? (_weekday ?? 0) : null,
      intervalDays: _frequency == 'custom' ? (_intervalDays ?? 7) : null,
    );

    final nextDue = _svc.computeNextDue(rule);

    // Item
    final item = SharedItem(
      id: '',
      type: 'recurring',
      title: _title.text.trim(),
      note: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      meta: {
        if (_attachmentDownloadUrl != null)
          'attachmentUrl': _attachmentDownloadUrl,
      },
      rule: rule,
      nextDueAt: nextDue,
      participantUserIds: _isGroup ? _groupParticipantIds : null,
      ownerUserId: widget.userPhone,
      groupId: _isGroup ? _groupId : null,
      sharing: _isGroup ? 'group' : null,
    );

    setState(() => _saving = true);
    try {
      await PushService.init();

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
            title: item.title ?? 'Recurring',
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

        if (_notifyEnabled) {
          await _svc.setNotifyPrefs(
            userPhone: widget.userPhone,
            friendId: _friendId!,
            itemId: newId,
            enabled: true,
            daysBefore: _daysBefore,
            timeHHmm: _fmtTime(_time),
            notifyBoth: true,
          );
          await _scheduleLocalOnce(
            id: newId,
            title: item.title ?? 'Recurring',
            due: nextDue,
          );
        }
      }

      if (!mounted) return;
      Navigator.pop(context, item);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ---------------- UI ----------------
  @override
  Widget build(BuildContext context) {
    final amt = _parseAmount();
    final uAmt = _isGroup
        ? 0.0
        : amt * ((_split == 'equal' ? 50.0 : _userShare) / 100.0);
    final fAmt = _isGroup
        ? 0.0
        : amt * ((_split == 'equal' ? 50.0 : _friendShare) / 100.0);

    final sortedPresets = [..._presets]..sort((a, b) => a.priority.compareTo(b.priority));

    final previewParticipants = _isGroup
        ? _groupParticipantIds.map((id) => ParticipantShare(userId: id)).toList()
        : [
            ParticipantShare(
                userId: widget.userPhone,
                sharePct: _split == 'equal' ? 50.0 : _userShare),
            ParticipantShare(
                userId: _friendId!,
                sharePct: _split == 'equal' ? 50.0 : _friendShare),
          ];

    final previewRule = RecurringRule(
      frequency: _frequency,
      anchorDate: _pickedCalendarDate ?? DateTime.now(),
      status: 'active',
      amount: amt <= 0 ? 1 : amt,
      participants: previewParticipants,
      dueDay:
      (_frequency == 'weekly' || _frequency == 'custom') ? null : (_dueDay ?? 1).clamp(1, 28),
      weekday: _frequency == 'weekly' ? (_weekday ?? 0) : null,
      intervalDays: _frequency == 'custom' ? (_intervalDays ?? 7) : null,
    );
    final nextDuePreview = _svc.computeNextDue(previewRule);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Add Recurring', style: TextStyle(color: Colors.black)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0.6,
        shadowColor: Colors.black12,
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: Scrollbar(
            controller: _scroll,
            thumbVisibility: true,
            child: ListView(
              controller: _scroll,
              padding: EdgeInsets.fromLTRB(16, 12, 16, bottomInset + 24),
              children: [
              _sectionTitle('Quick pick'),
              _presetGrid(sortedPresets),

              const SizedBox(height: 14),
              _sectionTitle('Details', key: _detailsKey),
              _glossyCard(
                child: Column(
                  children: [
                    TextFormField(
                      controller: _title,
                      decoration: const InputDecoration(
                        labelText: 'Title',
                        hintText: 'e.g. Rent, Maid, Tuition',
                        prefixIcon: Icon(Icons.edit_rounded),
                      ),
                      validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Enter a title' : null,
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _amount,
                      decoration: const InputDecoration(
                        labelText: 'Amount (₹)',
                        prefixIcon: Icon(Icons.currency_rupee),
                      ),
                      keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))
                      ],
                      validator: (_) =>
                      _parseAmount() <= 0 ? 'Enter a valid amount' : null,
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 12),
              _sectionTitle('Repeat'),
              _glossyCard(
                child: Column(
                  children: [
                    DropdownButtonFormField<String>(
                      value: _frequency,
                      items: const [
                        DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                        DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                        DropdownMenuItem(value: 'yearly', child: Text('Yearly')),
                        DropdownMenuItem(value: 'custom', child: Text('Custom (every N days)')),
                      ],
                      onChanged: (v) => setState(() {
                        _frequency = v ?? 'monthly';
                        if (_frequency == 'weekly') {
                          _weekday ??= DateTime.now().weekday % 7;
                          _dueDay = null;
                          _intervalDays = null;
                        } else if (_frequency == 'custom') {
                          _intervalDays ??= 7;
                          _weekday = null;
                          _dueDay = null;
                        } else {
                          _dueDay ??= DateTime.now().day.clamp(1, 28);
                          _weekday = null;
                          _intervalDays = null;
                        }
                      }),
                      decoration: const InputDecoration(
                        labelText: 'Frequency',
                        prefixIcon: Icon(Icons.repeat_rounded),
                      ),
                    ),
                    const SizedBox(height: 10),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 200),
                      curve: Curves.easeOut,
                      child: _frequency == 'weekly'
                          ? DropdownButtonFormField<int>(
                        value: _weekday,
                        items: const [
                          DropdownMenuItem(value: 0, child: Text('Sunday')),
                          DropdownMenuItem(value: 1, child: Text('Monday')),
                          DropdownMenuItem(value: 2, child: Text('Tuesday')),
                          DropdownMenuItem(value: 3, child: Text('Wednesday')),
                          DropdownMenuItem(value: 4, child: Text('Thursday')),
                          DropdownMenuItem(value: 5, child: Text('Friday')),
                          DropdownMenuItem(value: 6, child: Text('Saturday')),
                        ],
                        onChanged: (v) => setState(() => _weekday = v),
                        decoration: const InputDecoration(
                          labelText: 'Weekday',
                          prefixIcon: Icon(Icons.event_repeat),
                        ),
                        validator: (v) => v == null ? 'Pick a weekday' : null,
                      )
                          : _frequency == 'custom'
                          ? TextFormField(
                        initialValue: (_intervalDays ?? 7).toString(),
                        decoration: const InputDecoration(
                          labelText: 'Interval days',
                          hintText: 'e.g. every 10 days',
                          prefixIcon: Icon(Icons.timelapse_outlined),
                        ),
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly
                        ],
                        onChanged: (v) => setState(() {
                          final n = int.tryParse(v) ?? 7;
                          _intervalDays = n.clamp(1, 365);
                        }),
                        validator: (v) {
                          final n = int.tryParse(v ?? '');
                          if (n == null || n < 1) {
                            return 'Enter a number ≥ 1';
                          }
                          return null;
                        },
                      )
                          : DropdownButtonFormField<int>(
                        value: _dueDay,
                        items: List.generate(28, (i) => i + 1)
                            .map((d) =>
                            DropdownMenuItem(value: d, child: Text('Day $d')))
                            .toList(),
                        onChanged: (v) => setState(() => _dueDay = v),
                        decoration: const InputDecoration(
                          labelText: 'Due day (1–28)',
                          prefixIcon: Icon(Icons.event_outlined),
                        ),
                        validator: (v) => v == null ? 'Pick a due day' : null,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _calendarHelperRow(),
                  ],
                ),
              ),

              const SizedBox(height: 12),
              if (!_isGroup) ...[
                _sectionTitle('Split'),
                _glossyCard(
                  child: Column(
                    children: [
                      Wrap(
                        spacing: 10,
                        children: [
                          ChoiceChip(
                            label: const Text('Equal (50/50)'),
                            selected: _split == 'equal',
                            onSelected: (_) => setState(() => _split = 'equal'),
                          ),
                          ChoiceChip(
                            label: const Text('Custom'),
                            selected: _split == 'custom',
                            onSelected: (_) => setState(() => _split = 'custom'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      AnimatedCrossFade(
                        duration: const Duration(milliseconds: 200),
                        crossFadeState: _split == 'custom'
                            ? CrossFadeState.showFirst
                            : CrossFadeState.showSecond,
                        firstChild: Column(
                          children: [
                            _sliderRow(
                              icon: Icons.person_outline,
                              label: 'Your share',
                              value: _userShare,
                              onChanged: (v) =>
                                  setState(() => _normalizeFromUser(v)),
                            ),
                            _sliderRow(
                              icon: Icons.group_outlined,
                              label: 'Friend share',
                              value: _friendShare,
                              onChanged: (v) => setState(() {
                                _friendShare = v.clamp(0, 100);
                                _userShare = 100 - _friendShare;
                              }),
                            ),
                          ],
                        ),
                        secondChild: const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),
              ],
              _sectionTitle('Notes & attachment'),
              _glossyCard(
                child: Column(
                  children: [
                    TextField(
                      controller: _notes,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Notes (optional)',
                        hintText: 'Any notes for this recurring item',
                        alignLabelWithHint: true,
                        prefixIcon: Icon(Icons.notes_outlined),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(Icons.attachment_outlined, size: 18),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Attachment (optional)',
                                  style: TextStyle(fontWeight: FontWeight.w800)),
                              Text(
                                _attachmentDownloadUrl == null
                                    ? 'Add a compressed photo (bill/screenshot)'
                                    : 'Attached',
                                style: const TextStyle(color: Colors.black54),
                              ),
                            ],
                          ),
                        ),
                        OutlinedButton.icon(
                          icon: Icon(
                            _attachedImage == null
                                ? Icons.add_photo_alternate
                                : Icons.change_circle_outlined,
                          ),
                          onPressed: _pickCompressUploadAttachment,
                          label: Text(_attachedImage == null ? 'Add photo' : 'Change'),
                        ),
                      ],
                    ),
                    if (_attachedImage != null) ...[
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.file(
                          _attachedImage!,
                          height: 120,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(height: 12),
              _sectionTitle('Remind me', key: _reminderKey),
              _glossyCard(
                child: Column(
                  children: [
                    SwitchListTile.adaptive(
                      value: _notifyEnabled,
                      onChanged: (v) => setState(() => _notifyEnabled = v),
                      title: const Text('Enable reminder'),
                      subtitle: const Text('Get a push before the due day'),
                      contentPadding: EdgeInsets.zero,
                    ),
                    AnimatedCrossFade(
                      duration: const Duration(milliseconds: 180),
                      crossFadeState: _notifyEnabled
                          ? CrossFadeState.showFirst
                          : CrossFadeState.showSecond,
                      firstChild: Column(
                        children: [
                          _reminderDayCard(),
                          const SizedBox(height: 8),
                          _reminderTimeCard(),
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'First reminder: ${_reminderPreviewText(nextDuePreview)}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 12.5),
                            ),
                          ),
                        ],
                      ),
                      secondChild: const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 14),
              _sectionTitle('Summary'),
              _glossyCard(
                child: _SummaryCard(
                  title: _title.text.trim().isEmpty ? '—' : _title.text.trim(),
                  frequency: _frequency,
                  amount: _parseAmount(),
                  dayOrWeekLabel: _frequency == 'weekly'
                      ? _weekdayName(_weekday ?? 0)
                      : _frequency == 'custom'
                      ? 'Every ${(_intervalDays ?? 7)} day(s)'
                      : (_dueDay == null ? '—' : 'Day $_dueDay'),
                  showShares: !_isGroup,
                  userSharePct: _split == 'equal' ? 50.0 : _userShare,
                  friendSharePct: _split == 'equal' ? 50.0 : _friendShare,
                  userAmt: _parseAmount() *
                      ((_split == 'equal' ? 50.0 : _userShare) / 100.0),
                  friendAmt: _parseAmount() *
                      ((_split == 'equal' ? 50.0 : _friendShare) / 100.0),
                  participantCount: _isGroup ? _groupParticipantIds.length : 2,
                  nextDueAt: nextDuePreview,
                ),
              ),

              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.check_rounded),
                label: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ------ UI atoms ------

  // Grid that uses image if available, else glossy icon.
  Widget _presetGrid(List<_Preset> items) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (items.isEmpty) {
          return const SizedBox.shrink();
        }
        const gap = 16.0;
        final maxWidth = constraints.maxWidth;
        final columns = math.max(2, math.min(4, (maxWidth / 168).floor()));
        final tileWidth = (maxWidth - gap * (columns - 1)) / columns;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final p in items)
              SizedBox(
                width: tileWidth,
                child: AspectRatio(
                  aspectRatio: 0.92,
                  child: _presetTile(p),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _presetTile(_Preset p) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _applyPreset(p),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          decoration: _cardDecoration(),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                height: 48,
                width: 48,
                child: Center(child: _presetAvatar(p)),
              ),
              const SizedBox(height: 12),
              Text(
                p.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0x0F111827),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  p.suggestedAmount > 0
                      ? '₹ ${p.suggestedAmount.toStringAsFixed(0)}'
                      : '—',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    color: Colors.black87,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _presetAvatar(_Preset p) {
    final radius = 22.0;

    if (p.asset != null && p.asset!.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Container(
          width: radius * 2,
          height: radius * 2,
          color: const Color(0xFFF3F4F6),
          child: Image.asset(
            p.asset!,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) {
              // graceful fallback to glossy icon
              return _glossyIconAvatar(p.icon ?? Icons.apps, p.color);
            },
          ),
        ),
      );
    }

    // fallback glossy icon avatar
    return _glossyIconAvatar(p.icon ?? Icons.apps, p.color);
  }

  Widget _glossyIconAvatar(IconData icon, Color? tint) {
    final base = tint ?? const Color(0xFF111827);
    final radius = 22.0;
    return Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            _tint(base, .12),
            _tint(base, .24),
          ],
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x19000000), blurRadius: 10, offset: Offset(0, 6)),
        ],
      ),
      child: Center(
        child: Icon(icon, color: base, size: 22),
      ),
    );
  }

  Color _tint(Color c, double opacity) =>
      Color.fromARGB((opacity * 255).round(), c.red, c.green, c.blue);

  Widget _calendarHelperRow() {
    return Container(
      margin: const EdgeInsets.only(top: 2),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: _cardDecoration(),
      child: Row(
        children: [
          const Icon(Icons.calendar_today_outlined, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Pick from calendar (optional)',
                    style:
                    TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                Text(
                  _pickedCalendarDate == null
                      ? 'Use a date to auto-fill day/weekday'
                      : 'Picked: ${_fmtDate(_pickedCalendarDate!)}',
                  style: const TextStyle(color: Colors.black54, fontSize: 12.5),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: _pickCalendarDate,
            child: const Text('Choose'),
          ),
        ],
      ),
    );
  }

  Widget _reminderDayCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('When to remind',
              style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.notifications_active_outlined, size: 18),
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
              SizedBox(
                width: 84,
                child: Text(
                  '$_daysBefore day(s)',
                  textAlign: TextAlign.right,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _reminderTimeCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: _cardDecoration(),
      child: Row(
        children: [
          const Icon(Icons.access_time_rounded, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Reminder time',
                    style: TextStyle(fontWeight: FontWeight.w800)),
                Text(
                  'At ${_fmtTime(_time)}',
                  style: const TextStyle(color: Colors.black54),
                ),
              ],
            ),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.schedule_outlined),
            onPressed: _pickTime,
            label: const Text('Change'),
          ),
        ],
      ),
    );
  }

  Widget _glossyCard({required Widget child}) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: _cardDecoration(),
      child: child,
    );
  }

  BoxDecoration _cardDecoration() {
    return BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFFFFFFF), Color(0xFFF9FAFB)],
      ),
      boxShadow: const [
        BoxShadow(color: Color(0x1F000000), blurRadius: 16, offset: Offset(0, 8)),
      ],
      border: Border.all(color: const Color(0xFFE9ECEF)),
    );
  }

  Widget _sectionTitle(String t, {Key? key}) => Padding(
    key: key,
    padding: const EdgeInsets.only(bottom: 8, left: 2),
    child: Text(
      t,
      style: const TextStyle(
          fontWeight: FontWeight.w900, fontSize: 16, color: Colors.black),
    ),
  );

  Widget _sliderRow({
    required IconData icon,
    required String label,
    required double value,
    required ValueChanged<double> onChanged,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.black87),
        const SizedBox(width: 8),
        Expanded(
          child: Slider(
            value: value,
            min: 0,
            max: 100,
            divisions: 100,
            label: '${value.toStringAsFixed(0)}%',
            onChanged: onChanged,
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 58,
          child: Text(
            '${value.toStringAsFixed(0)}%',
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }

  String _weekdayName(int v) {
    switch (v) {
      case 0:
        return 'Sunday';
      case 1:
        return 'Monday';
      case 2:
        return 'Tuesday';
      case 3:
        return 'Wednesday';
      case 4:
        return 'Thursday';
      case 5:
        return 'Friday';
      case 6:
        return 'Saturday';
    }
    return '—';
  }
}

// ---------------- Summary card ----------------

class _SummaryCard extends StatelessWidget {
  final String title;
  final String frequency;
  final double amount;
  final String dayOrWeekLabel;
  final DateTime nextDueAt;
  final bool showShares;
  final double? userSharePct;
  final double? friendSharePct;
  final double? userAmt;
  final double? friendAmt;
  final int participantCount;

  const _SummaryCard({
    Key? key,
    required this.title,
    required this.frequency,
    required this.amount,
    required this.dayOrWeekLabel,
    required this.nextDueAt,
    required this.showShares,
    this.userSharePct,
    this.friendSharePct,
    this.userAmt,
    this.friendAmt,
    this.participantCount = 0,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    String amtFmt(double v) =>
        v <= 0 ? '—' : '₹ ${v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 2)}';

    final rows = <Widget>[
      _row('Title', title),
      _row('Amount', amtFmt(amount)),
      _row('Frequency', frequency.isEmpty
          ? '—'
          : frequency[0].toUpperCase() + frequency.substring(1)),
      _row(
        frequency == 'weekly'
            ? 'Weekday'
            : frequency == 'custom'
            ? 'Interval'
            : 'Due day',
        dayOrWeekLabel,
      ),
      _row('Next due', nextDueAt.toIso8601String().substring(0, 10)),
      const Divider(height: 18),
    ];

    if (showShares) {
      rows
        ..add(_row(
            'Your share',
            '${(userSharePct ?? 0).toStringAsFixed(0)}%  •  '
                '${amtFmt(userAmt ?? 0)}'))
        ..add(_row(
            'Friend share',
            '${(friendSharePct ?? 0).toStringAsFixed(0)}%  •  '
                '${amtFmt(friendAmt ?? 0)}'));
    } else {
      final label = participantCount <= 0
          ? '—'
          : participantCount == 1
              ? '1 member'
              : '$participantCount members';
      rows.add(_row('Participants', label));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: rows,
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
              child: Text(k,
                  style: const TextStyle(
                      color: Colors.black54, fontWeight: FontWeight.w700))),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

// ---------------- Preset model ----------------

class _Preset {
  final String title;
  final String frequency; // weekly/monthly/yearly/custom
  final int? dueDay; // for monthly/yearly
  final int? weekday; // 0..6 for weekly
  final int? intervalDays; // for custom
  final double suggestedAmount;

  // Visuals
  final String? asset;   // local asset image path (if provided, used)
  final IconData? icon;  // fallback colorful icon
  final Color? color;    // tint for glossy icon
  final int priority;    // sort order (lower = earlier)

  const _Preset(
      this.title, {
        required this.frequency,
        this.dueDay,
        this.weekday,
        this.intervalDays,
        this.suggestedAmount = 0,
        this.asset,
        this.icon,
        this.color,
        this.priority = 100,
      });
}
