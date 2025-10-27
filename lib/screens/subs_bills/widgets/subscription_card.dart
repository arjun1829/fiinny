import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';
import 'package:lifemap/screens/subs_bills/widgets/brand_avatar_registry.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart'; // lighter than GlassCard

// Sheets
import 'package:lifemap/screens/subs_bills/sheets/edit_subscription_sheet.dart';
import 'package:lifemap/screens/subs_bills/sheets/manage_subscription_sheet.dart';
import 'package:lifemap/screens/subs_bills/sheets/reminder_sheet.dart';

class SubscriptionCard extends StatelessWidget {
  final List<SharedItem> top;         // top 2–3 by next due
  final double monthlyTotal;          // total monthly spend

  // Optional hooks — used AFTER the sheet finishes to let the parent persist.
  final void Function(SharedItem item)? onOpen;       // tap row
  final void Function(SharedItem item)? onEdit;       // after "Save" in Edit
  final void Function(SharedItem item)? onManage;     // after an action in Manage
  final void Function(SharedItem item)? onReminder;   // after scheduling reminder
  final void Function(SharedItem item)? onMarkPaid;   // after Mark paid
  final void Function()? onAdd;                       // header Add New
  final bool showHeader;

  const SubscriptionCard({
    super.key,
    required this.top,
    required this.monthlyTotal,
    this.onOpen,
    this.onEdit,
    this.onManage,
    this.onReminder,
    this.onMarkPaid,
    this.onAdd,
    this.showHeader = true,
  });

  @override
  Widget build(BuildContext context) {
    final darkText = Colors.black.withOpacity(.92);
    final subText  = Colors.black.withOpacity(.70); // better contrast
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return TonalCard(
      padding: const EdgeInsets.all(AppSpacing.l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showHeader) ...[
            Row(
              children: [
                const Icon(Icons.subscriptions_rounded, color: AppColors.mint),
                const SizedBox(width: 8),
                const Text(
                  'Subscriptions',
                  style: TextStyle(
                    color: AppColors.mint,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
                const Spacer(),
                _Pill('₹ ${_fmtAmount(monthlyTotal)} / mo'),
                const SizedBox(width: 12),
                if (onAdd != null)
                  TextButton(
                    onPressed: onAdd,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.mint,
                      textStyle: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    child: const Text('+ Add New'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
          ] else if (onAdd != null) ...[
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onAdd,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.mint,
                  textStyle: const TextStyle(fontWeight: FontWeight.w800),
                ),
                child: const Text('+ Add New'),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Empty mini-state
          if (top.isEmpty)
            OutlinedButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add),
              label: const Text('Add your first subscription'),
            )
          else
            ..._rows(context, darkText, subText, today),
        ],
      ),
    );
  }

  List<Widget> _rows(
      BuildContext context, Color darkText, Color subText, DateTime today) {
    return top.map((e) {
      final amt = (e.rule.amount ?? 0).toDouble();
      final due = e.nextDueAt;
      final asset = BrandAvatarRegistry.assetFor(e.title ?? 'Subscription');

      final bool isOverdue = (due == null)
          ? false
          : DateTime(due.year, due.month, due.day).isBefore(today);

      final merchant = _merchantName(e);
      final plan = _planName(e, merchant);
      final statusBadge = _buildStatusBadge(e, isOverdue);
      final dueLabel = _dueLabelRich(due, isOverdue);

      return _InkRow(
        onTap: () => _open(context, e),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BrandAvatar(assetPath: asset, label: merchant, size: 44, radius: 12),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Text(
                            merchant,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: darkText,
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        if (statusBadge != null) statusBadge,
                      ],
                    ),
                    if (plan != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        plan,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12.5,
                          color: subText,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Text(
                            dueLabel,
                            style: TextStyle(
                              fontSize: 12,
                              color: subText,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        _Pill('₹ ${_fmtAmount(amt)}'),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _RowActions(
                onManage: () => _manage(context, e),
                onMarkPaid: () => _markPaid(context, e),
                onEdit: () => _edit(context, e),
                onReminder: () => _reminder(context, e),
              ),
            ],
          ),
        ),
      );
    }).toList();
  }

  String _merchantName(SharedItem e) {
    final provider = (e.provider ?? '').trim();
    final title = (e.title ?? '').trim();
    if (provider.isNotEmpty) return provider;
    if (title.isNotEmpty) return title;
    return 'Subscription';
  }

  String? _planName(SharedItem e, String merchant) {
    final note = (e.note ?? '').trim();
    final title = (e.title ?? '').trim();
    final provider = (e.provider ?? '').trim();

    if (provider.isNotEmpty && title.isNotEmpty &&
        title.toLowerCase() != provider.toLowerCase()) {
      return title;
    }
    if (note.isNotEmpty && note.toLowerCase() != merchant.toLowerCase()) {
      return note;
    }
    if (provider.isEmpty && title.isNotEmpty &&
        title.toLowerCase() != merchant.toLowerCase()) {
      return title;
    }
    return null;
  }

  Widget? _buildStatusBadge(SharedItem e, bool isOverdue) {
    if (isOverdue) {
      return const _StatusChip('Overdue', AppColors.bad);
    }
    final status = (e.rule.status).toLowerCase();
    switch (status) {
      case 'active':
        return const _StatusChip('Active', AppColors.mint);
      case 'paused':
        return const _StatusChip('Paused', AppColors.warn);
      case 'trial':
        return const _StatusChip('Trial', AppColors.electricPurple);
      case 'ended':
        return const _StatusChip('Ended', AppColors.ink500);
      default:
        return null;
    }
  }

  String _dueLabelRich(DateTime? due, bool isOverdue) {
    if (due == null) return 'Due --';
    final label = _fmtDate(due);
    return isOverdue ? 'Was due $label' : 'Due $label';
  }

  // ---- action plumbing (open sheets; let parent persist after) ----

  void _open(BuildContext context, SharedItem e) {
    if (onOpen != null) {
      onOpen!(e);
      return;
    }
    _showSummarySheet(context, e);
  }

  void _edit(BuildContext context, SharedItem e) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => EditSubscriptionSheet(
        item: e,
        // IMPORTANT: accept named args to match the sheet's signature
        onSave: (String newTitle, {double? amount, String? note}) async {
          try {
            // await svc.updateSubscription(e, ...); // integrate your service here
            Navigator.of(context).pop();
            onEdit?.call(e);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Saved')),
            );
          } catch (err) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Save failed: $err')),
            );
          }
        },
      ),
    );
  }

  void _manage(BuildContext context, SharedItem e) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => ManageSubscriptionSheet(
        item: e,
        onPauseResume: () async {
          try {
            // await svc.pauseResume(e);
            Navigator.of(context).pop();
            onManage?.call(e);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Toggled pause/resume')),
            );
          } catch (err) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Action failed: $err')),
            );
          }
        },
        onCancel: () async {
          try {
            // await svc.cancel(e);
            Navigator.of(context).pop();
            onManage?.call(e);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Cancelled')),
            );
          } catch (err) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Cancel failed: $err')),
            );
          }
        },
        onMarkPaid: () async {
          try {
            // await svc.markPaid(e);
            Navigator.of(context).pop();
            onMarkPaid?.call(e);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Marked paid')),
            );
          } catch (err) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed: $err')),
            );
          }
        },
        onHistory: () async {
          Navigator.of(context).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Opening billing history…')),
          );
        },
        onNudge: () async {
          try {
            // await svc.nudge(e);
            Navigator.of(context).pop();
            onManage?.call(e);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Nudged')),
            );
          } catch (err) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Nudge failed: $err')),
            );
          }
        },
        onQuickReminder: (int daysBefore) async {
          try {
            // await svc.scheduleReminder(e, daysBefore);
            Navigator.of(context).pop();
            onReminder?.call(e);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Reminder scheduled')),
            );
          } catch (err) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Reminder failed: $err')),
            );
          }
        },
      ),
    );
  }

  void _reminder(BuildContext context, SharedItem e) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => ReminderSheet(
        item: e,
        onSchedule: (int daysBefore, TimeOfDay timeOfDay) async {
          try {
            // await svc.scheduleReminder(e, daysBefore, timeOfDay);
            Navigator.of(context).pop();
            onReminder?.call(e);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Reminder scheduled')),
            );
          } catch (err) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Reminder failed: $err')),
            );
          }
        },
      ),
    );
  }

  void _markPaid(BuildContext context, SharedItem e) async {
    try {
      onMarkPaid?.call(e); // parent can optimistically hide
      if (onMarkPaid == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Marked paid: ${e.title ?? 'subscription'}')),
        );
      }
    } catch (err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to mark as paid: $err')),
      );
    }
  }

  // ---- sheets used by row tap (quick summary) ----

  void _showSummarySheet(BuildContext context, SharedItem e) {
    final amt = (e.rule.amount ?? 0).toDouble();
    final darkText = Colors.black.withOpacity(.92);
    final subText  = Colors.black.withOpacity(.70);
    final due = e.nextDueAt;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final isOverdue = (due == null)
        ? false
        : DateTime(due.year, due.month, due.day).isBefore(today);

    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(e.title ?? 'Subscription',
                style: TextStyle(color: darkText, fontWeight: FontWeight.w900, fontSize: 18)),
            const SizedBox(height: 6),
            if (due != null)
              Row(
                children: [
                  Text(
                    isOverdue ? 'Was due: ${_fmtDate(due)}' : 'Next due: ${_fmtDate(due)}',
                    style: TextStyle(color: subText),
                  ),
                  if (isOverdue)
                    _chipPill(
                      color: Colors.red.withOpacity(.08),
                      borderColor: Colors.red.withOpacity(.25),
                      child: const Text(
                        'Overdue',
                        style: TextStyle(color: Colors.red, fontWeight: FontWeight.w800, fontSize: 11.5),
                      ),
                    ),
                ],
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                _chipPill(
                  child: Text.rich(TextSpan(children: [
                    TextSpan(
                      text: 'Amount: ',
                      style: TextStyle(color: Colors.black.withOpacity(.55), fontWeight: FontWeight.w600),
                    ),
                    TextSpan(
                      text: '₹ ${_fmtAmount(amt)}',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ])),
                ),
                const SizedBox(width: 8),
                if ((e.rule.frequency ?? '').isNotEmpty)
                  _chipPill(
                    child: Text.rich(TextSpan(children: [
                      TextSpan(
                        text: 'Every: ',
                        style: TextStyle(color: Colors.black.withOpacity(.55), fontWeight: FontWeight.w600),
                      ),
                      TextSpan(
                        text: e.rule.frequency!,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ])),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed: () => _manage(context, e),
                  icon: const Icon(Icons.tune_rounded, size: 18),
                  label: const Text('Manage'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.mint,
                    foregroundColor: Colors.white,
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: () => _edit(context, e),
                  icon: const Icon(Icons.edit_rounded, size: 18),
                  label: const Text('Edit'),
                ),
                OutlinedButton.icon(
                  onPressed: () => _reminder(context, e),
                  icon: const Icon(Icons.alarm_add_rounded, size: 18),
                  label: const Text('Set reminder'),
                ),
                if (isOverdue)
                  OutlinedButton.icon(
                    onPressed: () => _markPaid(context, e),
                    icon: const Icon(Icons.check_circle_outline_rounded, size: 18),
                    label: const Text('Mark paid'),
                  ),
              ],
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  // ---- helpers ----

  static Widget _chipPill({
    required Widget child,
    Color? color,
    Color? borderColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor ?? Colors.black.withOpacity(.18)),
      ),
      child: child,
    );
  }

  static String _fmtAmount(double v) {
    final neg = v < 0; final n = v.abs();
    String s;
    if (n >= 10000000) return '${(n / 10000000).toStringAsFixed(1)}Cr';
    if (n >= 100000)   return '${(n / 100000).toStringAsFixed(1)}L';
    if (n >= 1000)     return '${(n / 1000).toStringAsFixed(1)}k';
    s = n % 1 == 0 ? n.toStringAsFixed(0) : n.toStringAsFixed(2);
    return neg ? '-$s' : s;
  }

  static String _fmtDate(DateTime d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${months[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }

}

/// Small helper to get ripple on each row while keeping a stronger border.
class _InkRow extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  const _InkRow({required this.child, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white, // pure white inside rows
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.black.withOpacity(.18)), // more visible border
          ),
          child: child,
        ),
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MenuRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.black87),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String text;
  final Color base;

  const _StatusChip(this.text, this.base, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: base.withOpacity(.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withOpacity(.22)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: base,
          fontWeight: FontWeight.w800,
          fontSize: 11.5,
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final TextStyle? textStyle;
  final Color? backgroundColor;
  final Color? borderColor;

  const _Pill(
    this.text, {
    this.textStyle,
    this.backgroundColor,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    final style = textStyle ??
        const TextStyle(
          fontWeight: FontWeight.w800,
          letterSpacing: .2,
        );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: backgroundColor ?? Colors.white.withOpacity(.70),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor ?? Colors.black.withOpacity(.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(text, style: style),
    );
  }
}

class _RowActions extends StatelessWidget {
  final VoidCallback onManage;
  final VoidCallback onMarkPaid;
  final VoidCallback onEdit;
  final VoidCallback onReminder;

  const _RowActions({
    required this.onManage,
    required this.onMarkPaid,
    required this.onEdit,
    required this.onReminder,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        TextButton(
          onPressed: onMarkPaid,
          style: TextButton.styleFrom(
            foregroundColor: AppColors.mint,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            textStyle: const TextStyle(fontWeight: FontWeight.w800),
            minimumSize: const Size(0, 0),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text('Paid?'),
        ),
        PopupMenuButton<_SubsAction>(
          tooltip: 'More actions',
          onSelected: (value) {
            switch (value) {
              case _SubsAction.edit:
                onEdit();
                break;
              case _SubsAction.manage:
                onManage();
                break;
              case _SubsAction.reminder:
                onReminder();
                break;
              case _SubsAction.paid:
                onMarkPaid();
                break;
            }
          },
          itemBuilder: (context) => const [
            PopupMenuItem(
              value: _SubsAction.edit,
              child: _MenuRow(icon: Icons.edit_rounded, label: 'Edit'),
            ),
            PopupMenuItem(
              value: _SubsAction.manage,
              child: _MenuRow(icon: Icons.tune_rounded, label: 'Manage'),
            ),
            PopupMenuItem(
              value: _SubsAction.reminder,
              child: _MenuRow(icon: Icons.alarm_add_rounded, label: 'Set reminder'),
            ),
            PopupMenuItem(
              value: _SubsAction.paid,
              child:
                  _MenuRow(icon: Icons.check_circle_outline_rounded, label: 'Mark paid'),
            ),
          ],
          icon: Icon(Icons.more_vert_rounded, color: Colors.black.withOpacity(.70)),
        ),
      ],
    );
  }
}

enum _SubsAction { edit, manage, reminder, paid }
