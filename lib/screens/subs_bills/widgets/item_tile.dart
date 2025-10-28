import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import '../../../services/subscriptions/subscriptions_service.dart';

class ItemTile extends StatelessWidget {
  final SharedItem item;
  final void Function(bool changed) onChanged;

  ItemTile({Key? key, required this.item, required this.onChanged}) : super(key: key);

  final _svc = SubscriptionsService();

  @override
  Widget build(BuildContext context) {
    final isPaused = item.rule.status == 'paused';
    final isEnded = item.rule.status == 'ended';
    final due = item.nextDueAt;
    final dueStr = due == null ? '—' : '${due.day}-${due.month}-${due.year}';
    final isReminder = item.type == 'reminder';

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        title: Text(
          item.title ?? 'Untitled',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontWeight: FontWeight.w700, color: isEnded ? Colors.grey : null),
        ),
        subtitle: Text(
          'Next: $dueStr • ${item.rule.frequency}${item.type == "subscription" ? " (billing)" : ""}',
          maxLines: 2,
          style: TextStyle(color: isEnded ? Colors.grey : Colors.black54),
        ),
        trailing: PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert),
          onSelected: (v) async {
            bool changed = false;
            switch (v) {
              case 'paid':
                changed = await _svc.markPaid(item);
                break;
              case 'pause':
                changed = await _svc.togglePause(item);
                break;
              case 'end':
                changed = await _svc.end(item);
                break;
              case 'edit':
                changed = await _svc.quickEditTitle(context, item);
                break;
              case 'delete':
                changed = await _svc.deleteOrEnd(item);
                break;
              case 'reminder':
                changed = await _svc.addQuickReminder(context, item);
                break;
              case 'schedule_next':
                changed = await _svc.scheduleNextLocal(item);
                break;
              case 'nudge_now':
                changed = await _svc.nudgeNow(item);
                break;
            }
            onChanged(changed);
          },
          itemBuilder: (ctx) => [
            if (!isEnded && !isReminder)
              const PopupMenuItem(
                value: 'paid',
                child: ListTile(
                  dense: true,
                  leading: Icon(Icons.check_circle_outline),
                  title: Text('Mark paid'),
                  visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                ),
              ),
            if (!isEnded)
              PopupMenuItem(
                value: 'pause',
                child: ListTile(
                  dense: true,
                  leading: Icon(isPaused ? Icons.play_arrow_rounded : Icons.pause_circle_outline),
                  title: Text(isPaused ? 'Resume' : 'Pause'),
                  visualDensity: const VisualDensity(horizontal: -2, vertical: -2),
                ),
              ),
            if (!isEnded)
              const PopupMenuItem(
                value: 'end',
                child: ListTile(
                  dense: true,
                  leading: Icon(Icons.cancel_outlined),
                  title: Text('End (close)'),
                  visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                ),
              ),
            const PopupMenuDivider(),
            const PopupMenuItem(
              value: 'edit',
              child: ListTile(
                dense: true,
                leading: Icon(Icons.edit_outlined),
                title: Text('Edit'),
                visualDensity: VisualDensity(horizontal: -2, vertical: -2),
              ),
            ),
            const PopupMenuItem(
              value: 'delete',
              child: ListTile(
                dense: true,
                leading: Icon(Icons.delete_outline),
                title: Text('Delete'),
                visualDensity: VisualDensity(horizontal: -2, vertical: -2),
              ),
            ),
            const PopupMenuDivider(),
            if (!isReminder)
              const PopupMenuItem(
                value: 'reminder',
                child: ListTile(
                  dense: true,
                  leading: Icon(Icons.alarm_add_outlined),
                  title: Text('Add reminder'),
                  visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                ),
              ),
            if (!isEnded)
              const PopupMenuItem(
                value: 'schedule_next',
                child: ListTile(
                  dense: true,
                  leading: Icon(Icons.schedule),
                  title: Text('Schedule next reminder (device)'),
                  visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                ),
              ),
            if (!isEnded)
              const PopupMenuItem(
                value: 'nudge_now',
                child: ListTile(
                  dense: true,
                  leading: Icon(Icons.notifications_active_outlined),
                  title: Text('Send nudge now'),
                  visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
