import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../app_state.dart';
import '../core/models.dart';
import '../core/status_engine.dart';

const kRed = Color(0xFFD32F2F);
const kOrange = Color(0xFFEF6C00);
const kGreen = Color(0xFF2E7D32);
const kGrey = Color(0xFF757575);
const kBlue = Color(0xFF1565C0);

Color statusColor(CallStatus s) => switch (s) {
      CallStatus.pending => kRed,
      CallStatus.attempted => kOrange,
      CallStatus.calledBack => kGreen,
      CallStatus.dismissed => kGrey,
      CallStatus.normal => kBlue,
    };

String statusLabel(CallStatus s) => switch (s) {
      CallStatus.pending => 'Not called back',
      CallStatus.attempted => 'Tried, no answer',
      CallStatus.calledBack => 'Called back',
      CallStatus.dismissed => 'Not needed',
      CallStatus.normal => 'No missed calls',
    };

IconData kindIcon(CallKind k) => switch (k) {
      CallKind.incoming => Icons.call_received,
      CallKind.outgoing => Icons.call_made,
      CallKind.missed => Icons.call_missed,
      CallKind.rejected => Icons.call_end,
      CallKind.blocked => Icons.block,
    };

Color kindColor(CallKind k) => switch (k) {
      CallKind.incoming => kGreen,
      CallKind.outgoing => kBlue,
      CallKind.missed || CallKind.rejected => kRed,
      CallKind.blocked => kGrey,
    };

final _time = DateFormat('h:mm a');
final _dayTime = DateFormat('d MMM, h:mm a');
final _fullDate = DateFormat('d MMM yyyy');

/// "10:42 AM" today, "Yesterday 6:10 PM", else "3 Nov, 6:10 PM".
String whenText(int ms) {
  final t = DateTime.fromMillisecondsSinceEpoch(ms);
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(t.year, t.month, t.day);
  if (day == today) return _time.format(t);
  if (day == today.subtract(const Duration(days: 1))) return 'Yesterday ${_time.format(t)}';
  return _dayTime.format(t);
}

String dateText(DateTime d) => _fullDate.format(d);

/// "just now", "12 min ago", "3 h ago", "2 days ago".
String agoText(int ms) {
  final d = DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(ms));
  if (d.inMinutes < 1) return 'just now';
  if (d.inMinutes < 60) return '${d.inMinutes} min ago';
  if (d.inHours < 24) return '${d.inHours} h ago';
  return '${d.inDays} ${d.inDays == 1 ? 'day' : 'days'} ago';
}

String durationText(int seconds) {
  if (seconds <= 0) return '';
  final m = seconds ~/ 60, s = seconds % 60;
  return m == 0 ? '${s}s' : '${m}m ${s.toString().padLeft(2, '0')}s';
}

String delayText(Duration d) {
  if (d.inMinutes < 60) return '${d.inMinutes} min';
  if (d.inHours < 24) return '${d.inHours} h ${d.inMinutes % 60} min';
  return '${d.inDays} d ${d.inHours % 24} h';
}

DateTime startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);

class StatusDot extends StatelessWidget {
  const StatusDot(this.status, {super.key, this.size = 12});
  final CallStatus status;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: statusColor(status), shape: BoxShape.circle),
      );
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final CallStatus status;

  @override
  Widget build(BuildContext context) {
    final c = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: c.withValues(alpha: 0.5)),
      ),
      child: Text(statusLabel(status),
          style: TextStyle(color: c, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}

/// Green round call button used on every list.
class CallButton extends StatelessWidget {
  const CallButton({super.key, required this.state, required this.number});
  final AppState state;
  final String number;

  @override
  Widget build(BuildContext context) => IconButton.filled(
        tooltip: 'Call back',
        style: IconButton.styleFrom(backgroundColor: kGreen, foregroundColor: Colors.white),
        icon: const Icon(Icons.call),
        onPressed: number.isEmpty ? null : () => state.callBack(number),
      );
}

/// "Synced 3 min ago · 12 waiting to upload", shown under the app bar.
class SyncBar extends StatelessWidget {
  const SyncBar({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final p = state.prefs;
    final String text;
    final Color color;
    if (state.syncing) {
      text = 'Syncing…';
      color = kBlue;
    } else if (!state.cloudEnabled) {
      text = 'Saved on this phone only · cloud not connected yet';
      color = kOrange;
    } else if (p.lastError != null) {
      text = 'Last sync had a problem · ${state.unsynced} waiting to upload';
      color = kRed;
    } else if (state.unsynced > 0) {
      text = '${state.unsynced} waiting to upload';
      color = kOrange;
    } else {
      text = p.lastCloudSyncAt == 0 ? 'Not synced yet' : 'All synced · ${agoText(p.lastCloudSyncAt)}';
      color = kGreen;
    }
    return Material(
      color: color.withValues(alpha: 0.1),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(children: [
          if (state.syncing)
            const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
          else
            Icon(Icons.cloud_sync, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
              child: Text(text,
                  style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500))),
        ]),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 56, color: kGrey),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: kGrey)),
          ]),
        ),
      );
}
