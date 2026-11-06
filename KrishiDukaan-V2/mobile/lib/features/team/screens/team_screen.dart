import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/staff_session.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../data/team_service.dart';

/// Dashboard → Team: the shop owner's helpers — same features as the
/// website's Team page (app/dashboard/team). Loads once on open.
class TeamScreen extends StatefulWidget {
  static const route = '/dashboard/team';
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  final _service = TeamService.instance;
  TeamData? _data;
  String? _error;
  bool _loading = true;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await _service.load();
      if (mounted) setState(() => _data = d);
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _message(Object e) => e.toString().replaceFirst('Exception: ', '');

  Future<void> _run(String key, Future<void> Function() action, String success) async {
    setState(() => _busy = key);
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(success), backgroundColor: AppColors.primary),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_message(e)), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _sendInvite(String name, String phone) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final ten = digits.length > 10 ? digits.substring(digits.length - 10) : digits;
    final shop = _data?.shopName ?? 'the shop';
    final text = 'Hi $name, you\'ve been added as a helper for $shop on KrishiDukan. '
        'Log in with your number +91$ten (OTP) on the KrishiDukan app or at https://krishidukan.com '
        'and open Dashboard to manage the shop.';
    final uri = Uri.parse('https://wa.me/91$ten?text=${Uri.encodeComponent(text)}');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _openEditor({TeamMember? member}) async {
    final result = await showModalBottomSheet<_EditorResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _HelperEditor(member: member),
    );
    if (result == null) return;
    if (member == null) {
      await _run('add', () => _service.add(name: result.name, phone: result.phone, permissions: result.permissions),
          '${result.name} can now log in and manage the shop.');
      if (mounted) {
        final send = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Send login steps?'),
            content: Text('Share how to log in with ${result.name} on WhatsApp.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('WhatsApp')),
            ],
          ),
        );
        if (send == true) await _sendInvite(result.name, result.phone);
      }
    } else {
      await _run('edit-${member.phone}', () => _service.setPermissions(member.phone, result.permissions),
          '${member.name}\'s access was updated.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppTopBar(title: 'Team'),
      floatingActionButton: data == null
          ? null
          : FloatingActionButton.extended(
              onPressed: _busy == null ? () => _openEditor() : null,
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Add helper'),
            ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                'Helpers log in on the KrishiDukan app or website with their own number and OTP, '
                'and manage only what you tick. They never see payments, subscription, bank details '
                'or this team list. Pause or remove them anytime.',
                style: AppTextStyles.bodySmall.copyWith(color: AppColors.onPrimaryContainer),
              ),
            ),
            const SizedBox(height: 16),
            if (_loading && data == null)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && data == null)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Text(_error!, textAlign: TextAlign.center, style: AppTextStyles.body),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: _load, child: const Text('Try again')),
                  ],
                ),
              )
            else if (data != null) ...[
              Text(
                '${data.members.length} helper${data.members.length == 1 ? '' : 's'}',
                style: AppTextStyles.heading3,
              ),
              const SizedBox(height: 12),
              if (data.members.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 32),
                  child: Center(child: Text('No helpers yet.', style: AppTextStyles.body)),
                ),
              for (final m in data.members) _memberCard(m),
            ],
          ],
        ),
      ),
    );
  }

  Widget _memberCard(TeamMember m) {
    final busy = _busy != null;
    final last = m.lastActiveAt;
    final activity = last == null
        ? 'Not logged in yet'
        : DateTime.now().difference(last).inHours < 24
            ? 'Active today'
            : 'Active ${DateTime.now().difference(last).inDays}d ago';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(m.name, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w800)),
                        _chip(m.isActive ? 'Active' : 'Paused', m.isActive ? AppColors.success : AppColors.secondary),
                        if (m.addedByAdmin) _chip('Added by KrishiDukan', AppColors.info),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('${m.phone} · $activity', style: AppTextStyles.caption),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                enabled: !busy,
                onSelected: (v) async {
                  switch (v) {
                    case 'invite':
                      await _sendInvite(m.name, m.phone);
                    case 'edit':
                      await _openEditor(member: m);
                    case 'toggle':
                      await _run('status-${m.phone}', () => _service.setStatus(m.phone, active: !m.isActive),
                          m.isActive ? '${m.name}\'s access is paused.' : '${m.name}\'s access is back on.');
                    case 'remove':
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: Text('Remove ${m.name}?'),
                          content: const Text('They lose access to the shop immediately.'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, true),
                              child: const Text('Remove', style: TextStyle(color: AppColors.error)),
                            ),
                          ],
                        ),
                      );
                      if (ok == true) {
                        await _run('remove-${m.phone}', () => _service.remove(m.phone), '${m.name} was removed.');
                      }
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'invite', child: Text('Send login steps (WhatsApp)')),
                  const PopupMenuItem(value: 'edit', child: Text('Change access')),
                  PopupMenuItem(value: 'toggle', child: Text(m.isActive ? 'Pause access' : 'Resume access')),
                  const PopupMenuItem(value: 'remove', child: Text('Remove', style: TextStyle(color: AppColors.error))),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final p in m.permissions)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceVariant,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(staffPermissionLabels[p] ?? p, style: AppTextStyles.caption),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text,
            style: AppTextStyles.caption.copyWith(color: color, fontWeight: FontWeight.w700, fontSize: 10)),
      );
}

class _EditorResult {
  final String name;
  final String phone;
  final List<String> permissions;
  const _EditorResult(this.name, this.phone, this.permissions);
}

/// Bottom sheet to add a helper (name, number, access) or change one's access.
class _HelperEditor extends StatefulWidget {
  final TeamMember? member;
  const _HelperEditor({this.member});

  @override
  State<_HelperEditor> createState() => _HelperEditorState();
}

class _HelperEditorState extends State<_HelperEditor> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  late Set<String> _perms;
  String? _error;

  @override
  void initState() {
    super.initState();
    _perms = {...(widget.member?.permissions ?? staffPresets.first.$2)};
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _submit() {
    final editing = widget.member != null;
    final name = _name.text.trim();
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    if (!editing && name.isEmpty) return setState(() => _error = "Enter the helper's name.");
    if (!editing && !RegExp(r'^[6-9]\d{9}$').hasMatch(digits)) {
      return setState(() => _error = 'Enter a valid 10-digit mobile number.');
    }
    if (_perms.isEmpty) return setState(() => _error = 'Choose at least one thing they can do.');
    Navigator.pop(
      context,
      _EditorResult(
        editing ? widget.member!.name : name,
        editing ? widget.member!.phone : digits,
        [for (final p in staffPermissionLabels.keys) if (_perms.contains(p)) p],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.member != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(editing ? 'Access for ${widget.member!.name}' : 'New helper', style: AppTextStyles.heading3),
            const SizedBox(height: 12),
            if (!editing) ...[
              TextField(
                controller: _name,
                maxLength: 60,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Name', counterText: ''),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 ', counterText: ''),
              ),
              const SizedBox(height: 12),
            ],
            Text('What can they do?', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final (label, perms) in staffPresets)
                  ChoiceChip(
                    label: Text(label),
                    selected: _perms.length == perms.length && perms.every(_perms.contains),
                    onSelected: (_) => setState(() => _perms = {...perms}),
                  ),
              ],
            ),
            for (final entry in staffPermissionLabels.entries)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _perms.contains(entry.key),
                onChanged: (v) => setState(() {
                  if (v == true) {
                    _perms.add(entry.key);
                  } else {
                    _perms.remove(entry.key);
                  }
                }),
                title: Text(entry.value, style: AppTextStyles.bodyMedium),
                subtitle: Text(staffPermissionHints[entry.key] ?? '', style: AppTextStyles.caption),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(_error!, style: AppTextStyles.bodySmall.copyWith(color: AppColors.error)),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submit,
              style: FilledButton.styleFrom(
                minimumSize: const Size(double.infinity, 48),
                backgroundColor: AppColors.primary,
              ),
              child: Text(editing ? 'Save access' : 'Add helper'),
            ),
          ],
        ),
      ),
    );
  }
}
