// lib/screens/notification_prefs_screen.dart
import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/notif_prefs_service.dart';
import '../services/push/push_service.dart';

// 👇 Ads (your existing infra)
import 'package:lifemap/core/ads/adaptive_banner.dart';
import 'package:lifemap/core/ads/ad_ids.dart';

class NotificationPrefsScreen extends StatefulWidget {
  const NotificationPrefsScreen({super.key});

  @override
  State<NotificationPrefsScreen> createState() => _NotificationPrefsScreenState();
}

class _NotificationPrefsScreenState extends State<NotificationPrefsScreen> {
  static const Color _accent = Color(0xFF159E8A);

  Future<TimeOfDay?> _pickTime(BuildContext context, String hhmm) async {
    final parts = hhmm.split(':');
    final now = TimeOfDay.now();
    final initial = (parts.length == 2)
        ? TimeOfDay(hour: int.tryParse(parts[0]) ?? now.hour, minute: int.tryParse(parts[1]) ?? 0)
        : now;
    return showTimePicker(context: context, initialTime: initial, helpText: 'Select time');
  }

  String _fmt(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const Scaffold(
        body: Center(child: Text('Sign in to manage notifications')),
      );
    }

    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: _accent,
        elevation: 0,
        title: const Text(
          'Notifications',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        actionsIconTheme: const IconThemeData(color: Colors.white),
        foregroundColor: Colors.white,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        actions: [
          IconButton(
            tooltip: 'Test nudge',
            icon: const Icon(Icons.notification_important_outlined, color: Colors.white),
            onPressed: () => PushService.debugLocalTest(),
          ),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [
              _accent.withOpacity(0.06),
              Colors.white,
            ],
          ),
        ),
        child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: NotifPrefsService.stream(),
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            final data = (snap.data?.data() ?? NotifPrefsService.defaults());
            final pushEnabled = (data['push_enabled'] as bool?) ?? true;
            final channels = Map<String, dynamic>.from(data['channels'] ?? {});
            final qh = Map<String, dynamic>.from(data['quiet_hours'] ?? {});
            final start = (qh['start'] as String?) ?? '22:00';
            final end = (qh['end'] as String?) ?? '08:00';
            final tz = (qh['tz'] as String?) ?? 'Asia/Kolkata';

            final sections = [
              _ChannelSection('Review rhythm', const [
                _ChannelConfig(
                  key: 'daily_reminder',
                  icon: Icons.wb_sunny,
                  color: Colors.orange,
                  title: 'Daily reminder',
                  subtitle: 'Quick nudge to review today’s expenses',
                ),
                _ChannelConfig(
                  key: 'weekly_digest',
                  icon: Icons.calendar_view_week,
                  color: Colors.indigo,
                  title: 'Weekly digest',
                  subtitle: 'Your week in ₹ + quick review CTA',
                ),
                _ChannelConfig(
                  key: 'monthly_reflection',
                  icon: Icons.date_range,
                  color: Colors.teal,
                  title: 'Monthly reflection',
                  subtitle: 'Trends & insights you can act on',
                ),
              ]),
              _ChannelSection('Fiinny brain alerts', const [
                _ChannelConfig(
                  key: 'brain_insights',
                  icon: Icons.lightbulb_outline,
                  color: AppColors.mint,
                  title: 'Smart insights',
                  subtitle: 'High-signal nudges from Fiinny Brain',
                ),
                _ChannelConfig(
                  key: 'overspend_alerts',
                  icon: Icons.warning_amber,
                  color: Colors.redAccent,
                  title: 'Overspend alerts',
                  subtitle: 'Pings when limits are breached',
                ),
                _ChannelConfig(
                  key: 'loan_watch',
                  icon: Icons.account_balance,
                  color: Colors.blueGrey,
                  title: 'Loan & EMI watch',
                  subtitle: 'Remind you of EMIs, high interest, dues',
                ),
                _ChannelConfig(
                  key: 'goal_milestones',
                  icon: Icons.flag_outlined,
                  color: Colors.deepPurple,
                  title: 'Goal milestones',
                  subtitle: 'Celebrate wins & warn if a goal slips',
                ),
                _ChannelConfig(
                  key: 'networth_updates',
                  icon: Icons.trending_up_rounded,
                  color: Colors.green,
                  title: 'Net-worth updates',
                  subtitle: 'Track asset vs liability changes',
                ),
              ]),
              _ChannelSection('Collaboration', const [
                _ChannelConfig(
                  key: 'partner_checkins',
                  icon: Icons.group,
                  color: Colors.purple,
                  title: 'Partner check-ins',
                  subtitle: 'Weekly review with your partner',
                ),
                _ChannelConfig(
                  key: 'settleup_nudges',
                  icon: Icons.payments,
                  color: Colors.blueGrey,
                  title: 'Settle up nudges',
                  subtitle: 'Remind friends to pay',
                ),
              ]),
            ];

            Widget sectionTitle(String text) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
              child: Text(
                text,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: Colors.black87,
                ),
              ),
            );

            return ListView(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 24),
              children: [
                _GlassCard(
                  child: Row(
                    children: [
                      Container(
                        width: 44, height: 44,
                        decoration: BoxDecoration(
                          color: _accent.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Center(child: Text('🔔', style: TextStyle(fontSize: 22))),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Control how Fiinny nudges you — keep it helpful, not spammy.',
                          style: theme.textTheme.bodyMedium?.copyWith(height: 1.3, color: Colors.black87),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                _GlassCard(
                  child: SwitchListTile.adaptive(
                    activeColor: _accent,
                    title: const Text('Enable push notifications', style: TextStyle(color: Colors.black87)),
                    subtitle: const Text('You can still see the in-app bell feed anytime.', style: TextStyle(color: Colors.black54)),
                    value: pushEnabled,
                    onChanged: (v) => NotifPrefsService.setPushEnabled(v),
                  ),
                ),

                const SizedBox(height: 12),

                // 👇 Banner Ad placed BEFORE "Channels"
                SafeArea(
                  top: false,
                  child: AdaptiveBanner(
                    adUnitId: AdIds.banner,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  ),
                ),

                for (var i = 0; i < sections.length; i++) ...[
                  sectionTitle(sections[i].title),
                  ...sections[i].configs.map((cfg) => _ChannelTile(
                        icon: cfg.icon,
                        color: cfg.color,
                        title: cfg.title,
                        subtitle: cfg.subtitle,
                        value: (channels[cfg.key] as bool?) ?? true,
                        enabled: pushEnabled,
                        onChanged: (v) => NotifPrefsService.toggleChannel(cfg.key, v),
                      )),
                  if (i != sections.length - 1) const SizedBox(height: 6),
                ],

                sectionTitle('Quiet hours'),

                _GlassCard(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.nights_stay, color: _accent),
                        title: const Text('No notifications during', style: TextStyle(color: Colors.black87)),
                        subtitle: Text('$start – $end  ($tz)', style: const TextStyle(color: Colors.black54)),
                        trailing: Switch.adaptive(
                          activeColor: _accent,
                          value: !(start == '00:00' && end == '00:00'),
                          onChanged: pushEnabled ? (v) async {
                            if (v) {
                              await NotifPrefsService.setQuietHours(start: start, end: end);
                            } else {
                              await NotifPrefsService.setQuietHours(start: '00:00', end: '00:00');
                            }
                          } : null,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 10,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _TimeChip(
                            label: 'Start',
                            time: start,
                            enabled: pushEnabled,
                            onTap: () async {
                              final picked = await _pickTime(context, start);
                              if (picked != null) {
                                await NotifPrefsService.setQuietHours(start: _fmt(picked), end: end);
                              }
                            },
                          ),
                          _TimeChip(
                            label: 'End',
                            time: end,
                            enabled: pushEnabled,
                            onTap: () async {
                              final picked = await _pickTime(context, end);
                              if (picked != null) {
                                await NotifPrefsService.setQuietHours(start: start, end: _fmt(picked));
                              }
                            },
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: _accent.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              tz,
                              style: theme.textTheme.labelMedium?.copyWith(
                                  color: _accent, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Critical alerts may bypass quiet hours.',
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/* ---------- pretty widgets ---------- */

class _GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  const _GlassCard({required this.child, this.padding});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.85),
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 14, offset: Offset(0, 6)),
        ],
        border: Border.all(color: Colors.black12.withOpacity(0.05)),
      ),
      child: Padding(
        padding: padding ?? const EdgeInsets.symmetric(horizontal: 10),
        child: child,
      ),
    );
  }
}

class _ChannelTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String? subtitle;
  final bool value;
  final bool enabled;
  final ValueChanged<bool>? onChanged;

  const _ChannelTile({
    required this.icon,
    required this.color,
    required this.title,
    this.subtitle,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final disabled = !enabled;
    return _GlassCard(
      child: ListTile(
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color),
        ),
        title: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w600,
            color: disabled ? Colors.black54 : Colors.black87,
          ),
        ),
        subtitle: subtitle != null
            ? Text(
          subtitle!,
          style: TextStyle(
            color: disabled ? Colors.black45 : Colors.black54,
          ),
        )
            : null,
        trailing: Switch.adaptive(
          value: value,
          onChanged: enabled ? onChanged : null,
        ),
      ),
    );
  }
}

class _ChannelSection {
  final String title;
  final List<_ChannelConfig> configs;
  const _ChannelSection(this.title, this.configs);
}

class _ChannelConfig {
  final String key;
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  const _ChannelConfig({
    required this.key,
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
  });
}

class _TimeChip extends StatelessWidget {
  final String label;
  final String time;
  final bool enabled;
  final VoidCallback onTap;
  const _TimeChip({
    required this.label,
    required this.time,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFF159E8A);
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: enabled ? accent.withOpacity(0.06) : Colors.grey.withOpacity(0.10),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: enabled ? accent.withOpacity(0.18) : Colors.grey.withOpacity(0.18)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: TextStyle(
              fontWeight: FontWeight.w700,
              color: enabled ? accent : Colors.grey,
            )),
            const SizedBox(width: 6),
            Text(time, style: const TextStyle(
              fontFeatures: [FontFeature.tabularFigures()],
              color: Colors.black87,
              fontWeight: FontWeight.w600,
            )),
            const SizedBox(width: 4),
            Icon(Icons.schedule, size: 18, color: enabled ? accent : Colors.grey),
          ],
        ),
      ),
    );
  }
}
