// lib/details/recurring/add_subscription_screen.dart
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

import '../services/recurring_service.dart';
import '../models/recurring_rule.dart';
import '../models/shared_item.dart';

// Reminders (reuse your pipeline)
import '../../core/notifications/local_notifications.dart';
import '../../services/push/push_service.dart';

class AddSubscriptionScreen extends StatefulWidget {
  final String userPhone;
  final String friendId;
  const AddSubscriptionScreen({
    Key? key,
    required this.userPhone,
    required this.friendId,
  }) : super(key: key);

  @override
  State<AddSubscriptionScreen> createState() => _AddSubscriptionScreenState();
}

/* ---------- Preset model + catalog ---------- */

class _SubPreset {
  final String id; // e.g. "netflix"
  final String title;
  final int defaultAmount; // in INR (whole ₹)
  final String? logo; // Clearbit logo or asset path
  final List<String> tags; // e.g. ["video","family"]
  final String frequency; // default "monthly"
  const _SubPreset({
    required this.id,
    required this.title,
    required this.defaultAmount,
    this.logo,
    this.tags = const [],
    this.frequency = 'monthly',
  });
}

// Put commonly shared up top to bias the grid
const List<_SubPreset> _kAllPresets = [
  // Very commonly shared in India
  _SubPreset(id: 'netflix', title: 'Netflix', defaultAmount: 649, logo: 'https://logo.clearbit.com/netflix.com', tags: ['video','family']),
  _SubPreset(id: 'prime', title: 'Amazon Prime Video', defaultAmount: 299, logo: 'https://logo.clearbit.com/primevideo.com', tags: ['video','bundle']),
  _SubPreset(id: 'ytp', title: 'YouTube Premium', defaultAmount: 169, logo: 'https://logo.clearbit.com/youtube.com', tags: ['music','video']),
  _SubPreset(id: 'spotify', title: 'Spotify', defaultAmount: 119, logo: 'https://logo.clearbit.com/spotify.com', tags: ['music']),
  _SubPreset(id: 'jiofiber', title: 'JioFiber', defaultAmount: 699, logo: 'https://logo.clearbit.com/jio.com', tags: ['broadband']),
  _SubPreset(id: 'airtelx', title: 'Airtel Xstream Fiber', defaultAmount: 799, logo: 'https://logo.clearbit.com/airtel.in', tags: ['broadband']),

  // More presets
  _SubPreset(id: 'hotstar', title: 'Disney+ Hotstar', defaultAmount: 299, logo: 'https://logo.clearbit.com/hotstar.com', tags: ['video']),
  _SubPreset(id: 'sonyliv', title: 'Sony LIV', defaultAmount: 299, logo: 'https://logo.clearbit.com/sonyliv.com', tags: ['video']),
  _SubPreset(id: 'zee5', title: 'Zee5', defaultAmount: 199, logo: 'https://logo.clearbit.com/zee5.com', tags: ['video']),
  _SubPreset(id: 'jiocinema', title: 'JioCinema Premium', defaultAmount: 59, logo: 'https://logo.clearbit.com/jiocinema.com', tags: ['video']),

  // Music
  _SubPreset(id: 'applemusic', title: 'Apple Music', defaultAmount: 149, logo: 'https://logo.clearbit.com/apple.com', tags: ['music']),
  _SubPreset(id: 'jiosaavn', title: 'JioSaavn Pro', defaultAmount: 99, logo: 'https://logo.clearbit.com/jiosaavn.com', tags: ['music']),
  _SubPreset(id: 'gaana', title: 'Gaana Plus', defaultAmount: 99, logo: 'https://logo.clearbit.com/gaana.com', tags: ['music']),

  // Storage & productivity
  _SubPreset(id: 'googleone', title: 'Google One', defaultAmount: 130, logo: 'https://logo.clearbit.com/google.com', tags: ['storage','productivity']),
  _SubPreset(id: 'icloud', title: 'iCloud+', defaultAmount: 75, logo: 'https://logo.clearbit.com/apple.com', tags: ['storage','productivity']),
  _SubPreset(id: 'm365', title: 'Microsoft 365', defaultAmount: 489, logo: 'https://logo.clearbit.com/microsoft.com', tags: ['productivity']),
  _SubPreset(id: 'canva', title: 'Canva Pro', defaultAmount: 499, logo: 'https://logo.clearbit.com/canva.com', tags: ['productivity','creative']),

  // Telecom (28/30 day cycles treated as monthly)
  _SubPreset(id: 'jio', title: 'Jio (mobile)', defaultAmount: 299, logo: 'https://logo.clearbit.com/jio.com', tags: ['telecom']),
  _SubPreset(id: 'airtel', title: 'Airtel (mobile)', defaultAmount: 399, logo: 'https://logo.clearbit.com/airtel.in', tags: ['telecom']),
  _SubPreset(id: 'vi', title: 'Vi (mobile)', defaultAmount: 299, logo: 'https://logo.clearbit.com/myvi.in', tags: ['telecom']),

  // Food memberships
  _SubPreset(id: 'swiggyone', title: 'Swiggy One', defaultAmount: 199, logo: 'https://logo.clearbit.com/swiggy.com', tags: ['food','membership']),
  _SubPreset(id: 'zomatogold', title: 'Zomato Gold', defaultAmount: 199, logo: 'https://logo.clearbit.com/zomato.com', tags: ['food','membership']),

  // Rentals / household sharing
  _SubPreset(id: 'rentomojo', title: 'RentoMojo', defaultAmount: 499, logo: 'https://logo.clearbit.com/rentomojo.com', tags: ['rental','household']),
  _SubPreset(id: 'furlenco', title: 'Furlenco', defaultAmount: 999, logo: 'https://logo.clearbit.com/furlenco.com', tags: ['rental','household']),
];

class _AddSubscriptionScreenState extends State<AddSubscriptionScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _amount = TextEditingController();
  final _noteCtrl = TextEditingController();

  // Jump targets for auto-scroll
  final _detailsKey = GlobalKey();

  // Billing day (1..28)
  int? _dueDay;

  // Split mode
  String _split = 'equal'; // 'equal' | 'custom'
  double _userShare = 50.0; // percent
  double _friendShare = 50.0; // percent

  // Presets UI
  final TextEditingController _searchCtrl = TextEditingController();
  String _activeTag = 'All';

  // Reminder UI
  bool _notifyEnabled = true;
  int _daysBefore = 2;
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);

  // Attachment
  final _picker = ImagePicker();
  Uint8List? _attachmentBytes; // compressed preview bytes
  String? _uploadedAttachmentUrl;

  bool _saving = false;

  final _svc = RecurringService();

  @override
  void initState() {
    super.initState();
    _dueDay = DateTime.now().day.clamp(1, 28);
  }

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    _noteCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  double _parseAmount() {
    final s = _amount.text.replaceAll(',', '').trim();
    return double.tryParse(s) ?? 0.0;
  }

  void _pickPreset(_SubPreset p) {
    setState(() {
      _title.text = p.title;
      if ((_amount.text.trim()).isEmpty || _parseAmount() <= 0) {
        _amount.text = p.defaultAmount.toStringAsFixed(0);
      }
      _dueDay ??= DateTime.now().day.clamp(1, 28);
    });
    _scrollToDetails();
  }

  void _normalizeSharesFromUser(double v) {
    _userShare = v.clamp(0, 100);
    _friendShare = (100 - _userShare);
  }

  // --------- Reminder helpers ----------
  String _fmtDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';
  String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: _time);
    if (t != null) setState(() => _time = t);
  }

  Future<void> _scheduleLocalOnce({
    required String id,
    required String title,
    required DateTime due,
  }) async {
    // planned fire time = (due @ chosen time) - daysBefore
    final now = DateTime.now();
    final planned = DateTime(due.year, due.month, due.day, _time.hour, _time.minute)
        .subtract(Duration(days: _daysBefore));
    final fireAt = planned.isAfter(now) ? planned : now.add(const Duration(minutes: 1));
    try {
      await LocalNotifs.init();
      await LocalNotifs.scheduleOnce(
        itemId: id,
        title: title.isEmpty ? 'Reminder' : title,
        fireAt: fireAt,
        body: 'Due on ${_fmtDate(due)}',
        payload: 'app://friend/${widget.friendId}/recurring',
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Reminder set for ${_fmtDate(fireAt)} ${_fmtTime(TimeOfDay.fromDateTime(fireAt))}')),
      );
    } catch (_) {
      // Best-effort local fallbacks via PushService banner
      await PushService.showLocal(
        title: title.isEmpty ? 'Reminder' : title,
        body: 'Saved — you’ll be reminded before ${_fmtDate(due)}',
        deeplink: 'app://friend/${widget.friendId}/recurring',
      );
    }
  }

  Future<void> _pickAttachment() async {
    try {
      final x = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 100, // keep source quality, we will compress ourselves
      );
      if (x == null) return;

      final raw = await x.readAsBytes();

      // compress to ~<= 220 KB JPEG (iterate quality)
      int quality = 75;
      Uint8List? out = await FlutterImageCompress.compressWithList(
        raw,
        minWidth: 1600,
        minHeight: 1600,
        quality: quality,
        format: CompressFormat.jpeg,
      );

      // if still large, reduce further
      while (out != null && out.lengthInBytes > 220 * 1024 && quality > 40) {
        quality -= 10;
        out = await FlutterImageCompress.compressWithList(
          out,
          quality: quality,
          format: CompressFormat.jpeg,
        );
      }

      if (out == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not compress image')),
        );
        return;
      }

      setState(() {
        _attachmentBytes = out;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Attachment failed: $e')),
      );
    }
  }

  Future<String?> _uploadAttachment(String newId) async {
    if (_attachmentBytes == null) return null;
    try {
      final path = 'users/${widget.userPhone}/friends/${widget.friendId}/recurring_attachments/$newId.jpg';
      final ref = FirebaseStorage.instance.ref(path);
      await ref.putData(
        _attachmentBytes!,
        SettableMetadata(contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000'),
      );
      return await ref.getDownloadURL();
    } catch (e) {
      // Don't fail the whole save if upload fails
      debugPrint('Attachment upload failed: $e');
      return null;
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;

    final amt = _parseAmount();
    final day = (_dueDay ?? 1).clamp(1, 28);
    final note = _noteCtrl.text.trim();

    // Build participants based on split
    final participants = <ParticipantShare>[
      ParticipantShare(userId: widget.userPhone, sharePct: _split == 'equal' ? 50.0 : _userShare),
      ParticipantShare(userId: widget.friendId, sharePct: _split == 'equal' ? 50.0 : _friendShare),
    ];

    final rule = RecurringRule(
      frequency: 'monthly',
      anchorDate: DateTime.now(),
      status: 'active',
      amount: amt,
      participants: participants,
      dueDay: day,
    );

    final nextDue = _svc.computeNextDue(rule);

    final item = SharedItem(
      id: '', // service assigns id
      type: 'subscription',
      title: _title.text.trim(),
      note: note.isEmpty ? null : note,
      rule: rule,
      nextDueAt: nextDue,
      meta: {
        'category': 'subscription',
        'service': _slugFromTitle(_title.text.trim()),
      },
    );

    setState(() => _saving = true);
    try {
      // Ensure push stack is ready (idempotent)
      await PushService.init();

      // 1) Create
      final newId = await _svc.add(widget.userPhone, widget.friendId, item);

      // 2) Upload attachment (optional) then patch doc with URL
      if (_attachmentBytes != null) {
        final url = await _uploadAttachment(newId);
        _uploadedAttachmentUrl = url;
        if (url != null) {
          await _svc.patch(
            widget.userPhone,
            widget.friendId,
            newId,
            {
              'meta': {
                'category': 'subscription',
                'service': _slugFromTitle(_title.text.trim()),
                'attachmentUrl': url,
              },
            },
          );
        }
      }

      // 3) Reminder prefs (+ schedule first local if enabled)
      if (_notifyEnabled) {
        await _svc.setNotifyPrefs(
          userPhone: widget.userPhone,
          friendId: widget.friendId,
          itemId: newId,
          enabled: true,
          daysBefore: _daysBefore,
          timeHHmm: _fmtTime(_time),
          notifyBoth: true,
        );

        await _scheduleLocalOnce(
          id: newId,
          title: item.title ?? 'Subscription',
          due: nextDue,
        );
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

  void _scrollToDetails() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final ctx = _detailsKey.currentContext;
      if (ctx != null) {
        await Scrollable.ensureVisible(
          ctx,
          duration: const Duration(milliseconds: 380),
          alignment: 0.05,
          curve: Curves.easeOutCubic,
        );
      }
    });
  }

  String _slugFromTitle(String t) =>
      t.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '_').replaceAll(RegExp(r'^_|_$'), '');

  /* ---------------- UI ---------------- */

  @override
  Widget build(BuildContext context) {
    final amt = _parseAmount();
    final uAmt = amt * ((_split == 'equal' ? 50.0 : _userShare) / 100.0);
    final fAmt = amt * ((_split == 'equal' ? 50.0 : _friendShare) / 100.0);

    final filtered = _filteredPresets();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Add Subscription', style: TextStyle(color: Colors.black)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0.6,
        shadowColor: Colors.black12,
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _searchBar(),
              const SizedBox(height: 10),
              _filterChips(),
              const SizedBox(height: 12),

              _sectionTitle('Pick a service'),
              _glossyCard(
                padding: const EdgeInsets.all(10),
                child: LayoutBuilder(
                  builder: (ctx, c) {
                    final crossCount = (c.maxWidth ~/ 110).clamp(2, 4); // tighter grid
                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossCount,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 0.78,
                      ),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) => _presetTile(filtered[i], i),
                    );
                  },
                ),
              ),

              const SizedBox(height: 14),
              _sectionTitle('Details'),
              KeyedSubtree(
                key: _detailsKey,
                child: _glossyCard(
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _title,
                        decoration: const InputDecoration(
                          labelText: 'Service name',
                          prefixIcon: Icon(Icons.subscriptions_outlined),
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter a name' : null,
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _amount,
                        decoration: const InputDecoration(
                          labelText: 'Amount (₹)',
                          prefixIcon: Icon(Icons.currency_rupee),
                        ),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                        validator: (_) => _parseAmount() <= 0 ? 'Enter a valid amount' : null,
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _noteCtrl,
                        minLines: 2,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Notes (optional)',
                          hintText: 'E.g. 4 screens plan shared with Akash & Riya',
                          prefixIcon: Icon(Icons.note_alt_outlined),
                        ),
                      ),
                      const SizedBox(height: 10),
                      _attachmentRow(),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),
              _sectionTitle('Billing day'),
              _glossyCard(
                child: DropdownButtonFormField<int>(
                  value: _dueDay,
                  items: List.generate(28, (i) => i + 1)
                      .map((d) => DropdownMenuItem(value: d, child: Text('Day $d')))
                      .toList(),
                  onChanged: (v) => setState(() => _dueDay = v),
                  decoration: const InputDecoration(
                    labelText: 'Choose day (1–28)',
                    prefixIcon: Icon(Icons.event_outlined),
                  ),
                  validator: (v) => v == null ? 'Pick a billing day' : null,
                ),
              ),

              const SizedBox(height: 12),
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
                      crossFadeState: _split == 'custom' ? CrossFadeState.showFirst : CrossFadeState.showSecond,
                      firstChild: Column(
                        children: [
                          _sliderRow(
                            icon: Icons.person_outline,
                            label: 'Your share',
                            value: _userShare,
                            onChanged: (v) => setState(() => _normalizeSharesFromUser(v)),
                          ),
                          _sliderRow(
                            icon: Icons.group_outlined,
                            label: 'Friend share',
                            value: _friendShare,
                            onChanged: (v) => setState(() {
                              _friendShare = v.clamp(0, 100);
                              _userShare = (100 - _friendShare);
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
              _sectionTitle('Remind me'),
              _glossyCard(
                child: Column(
                  children: [
                    SwitchListTile.adaptive(
                      value: _notifyEnabled,
                      onChanged: (v) => setState(() => _notifyEnabled = v),
                      title: const Text('Enable reminder'),
                      subtitle: const Text('Get a push before the billing day'),
                      contentPadding: EdgeInsets.zero,
                    ),
                    AnimatedCrossFade(
                      duration: const Duration(milliseconds: 160),
                      crossFadeState: _notifyEnabled ? CrossFadeState.showFirst : CrossFadeState.showSecond,
                      firstChild: Column(
                        children: [
                          Row(
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
                                icon: const Icon(Icons.access_time),
                                onPressed: _pickTime,
                                label: Text(_fmtTime(_time)),
                              ),
                            ],
                          ),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'Preview: ${_previewText()}',
                              style: const TextStyle(fontWeight: FontWeight.w700),
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
                child: _Summary(
                  title: _title.text.trim().isEmpty ? '—' : _title.text.trim(),
                  amount: amt,
                  userSharePct: _split == 'equal' ? 50.0 : _userShare,
                  friendSharePct: _split == 'equal' ? 50.0 : _friendShare,
                  userShareAmt: uAmt,
                  friendShareAmt: fAmt,
                  dueDay: _dueDay,
                ),
              ),

              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.check_rounded),
                label: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /* ---------- UI helpers ---------- */

  Widget _searchBar() {
    return _glossyCard(
      child: TextField(
        controller: _searchCtrl,
        decoration: InputDecoration(
          hintText: 'Search services (e.g., Netflix, Jio, Spotify)',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _searchCtrl.text.isEmpty
              ? null
              : IconButton(
            onPressed: () {
              _searchCtrl.clear();
              setState(() {});
            },
            icon: const Icon(Icons.clear),
          ),
        ),
        onChanged: (_) => setState(() {}),
      ),
    );
  }

  Widget _filterChips() {
    const tags = ['All', 'video', 'music', 'storage', 'productivity', 'telecom', 'broadband', 'food', 'rental', 'household'];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          for (final t in tags) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(_prettyTag(t)),
                selected: _activeTag == t,
                onSelected: (_) => setState(() => _activeTag = t),
              ),
            )
          ]
        ],
      ),
    );
  }

  String _prettyTag(String t) => t == 'All' ? 'All' : t[0].toUpperCase() + t.substring(1);

  List<_SubPreset> _filteredPresets() {
    final q = _searchCtrl.text.trim().toLowerCase();
    final list = _kAllPresets.where((p) {
      final matchesQ = q.isEmpty || p.title.toLowerCase().contains(q) || p.id.contains(q);
      final matchesTag = _activeTag == 'All' || p.tags.contains(_activeTag);
      return matchesQ && matchesTag;
    }).toList();

    // keep "most shared" (top chunk) first by preserving their order in _kAllPresets
    return list;
  }

  Widget _presetTile(_SubPreset p, int index) {
    // subtle entry animation
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.92, end: 1),
      duration: Duration(milliseconds: 180 + (index % 6) * 30),
      curve: Curves.easeOutCubic,
      builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
      child: InkWell(
        onTap: () => _pickPreset(p),
        borderRadius: BorderRadius.circular(14),
        child: _glossyCard(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // logo
              CircleAvatar(
                radius: 20,
                backgroundColor: Colors.white,
                backgroundImage: p.logo != null ? NetworkImage(p.logo!) : null,
                child: p.logo == null
                    ? const Icon(Icons.apps, size: 20, color: Colors.black54)
                    : null,
              ),
              const SizedBox(height: 8),
              // title (nowrap to avoid overflow)
              Text(
                p.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text('₹ ${p.defaultAmount}', style: TextStyle(color: Colors.grey.shade700, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _attachmentRow() {
    return Row(
      children: [
        OutlinedButton.icon(
          onPressed: _pickAttachment,
          icon: const Icon(Icons.attachment),
          label: const Text('Add photo'),
        ),
        const SizedBox(width: 10),
        if (_attachmentBytes != null)
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 8, offset: Offset(0, 4))],
              border: Border.all(color: const Color(0xFFE5E7EB)),
              image: DecorationImage(image: MemoryImage(_attachmentBytes!), fit: BoxFit.cover),
            ),
          ),
        if (_attachmentBytes != null)
          IconButton(
            tooltip: 'Remove',
            onPressed: () => setState(() {
              _attachmentBytes = null;
              _uploadedAttachmentUrl = null;
            }),
            icon: const Icon(Icons.close_rounded),
          ),
      ],
    );
  }

  Widget _glossyCard({required Widget child, EdgeInsets? padding}) {
    return Container(
      padding: padding ?? const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
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
      ),
      child: child,
    );
  }

  Widget _sectionTitle(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 8, left: 2),
    child: Text(
      t,
      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Colors.black),
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
        SizedBox(width: 44, child: Text('${value.toStringAsFixed(0)}%', textAlign: TextAlign.right)),
      ],
    );
  }

  String _previewText() {
    final due = DateTime(DateTime.now().year, DateTime.now().month, (_dueDay ?? 1));
    final planned = DateTime(due.year, due.month, due.day, _time.hour, _time.minute)
        .subtract(Duration(days: _daysBefore));
    return '${_fmtDate(planned)} ${_fmtTime(TimeOfDay.fromDateTime(planned))}';
  }
}

class _Summary extends StatelessWidget {
  final String title;
  final double amount;
  final double userSharePct;
  final double friendSharePct;
  final double userShareAmt;
  final double friendShareAmt;
  final int? dueDay;

  const _Summary({
    Key? key,
    required this.title,
    required this.amount,
    required this.userSharePct,
    required this.friendSharePct,
    required this.userShareAmt,
    required this.friendShareAmt,
    required this.dueDay,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _row('Title', title),
        _row('Amount', amount <= 0 ? '—' : '₹ ${amount.toStringAsFixed(amount.truncateToDouble() == amount ? 0 : 2)}'),
        _row('Billing day', dueDay == null ? '—' : 'Day $dueDay'),
        const Divider(height: 18),
        _row('Your share', '${userSharePct.toStringAsFixed(0)}%  •  ₹ ${userShareAmt.toStringAsFixed(0)}'),
        _row('Friend share', '${friendSharePct.toStringAsFixed(0)}%  •  ₹ ${friendShareAmt.toStringAsFixed(0)}'),
      ],
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(k, style: const TextStyle(color: Colors.black54, fontWeight: FontWeight.w700))),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}
