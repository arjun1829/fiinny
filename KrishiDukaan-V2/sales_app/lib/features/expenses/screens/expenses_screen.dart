import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/utils/date_range.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../data/expense.dart';
import '../providers/expense_providers.dart';
import '../widgets/expense_form_sheet.dart';

class ExpensesScreen extends ConsumerWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(expenseRangeProvider);
    final expensesAsync = ref.watch(expensesProvider);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Expenses'),
            Text(
              range.subtitle,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<RangePreset>(
            initialValue: range,
            icon: const Icon(Icons.tune_rounded, size: 21),
            onSelected: (p) => ref.read(expenseRangeProvider.notifier).set(p),
            itemBuilder: (_) => [
              for (final p in RangePreset.values)
                PopupMenuItem(value: p, child: Text(p.label)),
            ],
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addExpense(context, ref),
        backgroundColor: AppColors.harvest,
        foregroundColor: Colors.black87,
        icon: const Icon(Icons.add_rounded),
        label: const Text(
          'Add Expense',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: expensesAsync.when(
        loading: () => const LoadingView(message: 'Loading your claims…'),
        error: (e, _) => ErrorView(
          message:
              'Could not load your expenses. Check your connection and try again.',
          onRetry: () => ref.invalidate(expensesProvider),
        ),
        data: (expenses) {
          final totals = ExpenseTotals.of(expenses);
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(expensesProvider);
              await ref.read(expensesProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                _TotalsCard(totals: totals),
                const SizedBox(height: 22),
                if (expenses.isEmpty)
                  EmptyView(
                    icon: Icons.receipt_long_outlined,
                    title: 'No claims in this period',
                    message:
                        'Record travel, fuel, food and other field costs here. '
                        'Attach a photo of the bill so approval is quick.',
                    action: FilledButton.icon(
                      onPressed: () => _addExpense(context, ref),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(200, 48),
                      ),
                      icon: const Icon(Icons.add_rounded, size: 18),
                      label: const Text('Add an expense'),
                    ),
                  )
                else ...[
                  SectionLabel(FormatUtils.plural(expenses.length, 'claim')),
                  for (final e in expenses) ...[
                    _ExpenseRow(
                      expense: e,
                      onEdit: () => _editExpense(context, ref, e),
                      onDelete: () => _deleteExpense(context, ref, e),
                    ),
                    const SizedBox(height: 12),
                  ],
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _addExpense(BuildContext context, WidgetRef ref) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    // Grabbed before the first await — the sheet, the write and the bill upload
    // all suspend, and the context may be gone by the time we confirm.
    final messenger = ScaffoldMessenger.of(context);
    final draft = await ExpenseFormSheet.show(context);
    if (draft == null) return;
    try {
      await ref
          .read(expenseRepositoryProvider)
          .create(uid, draft.input, bill: draft.bill);
      ref.invalidate(expensesProvider);
      _toast(
        messenger,
        'Claim for ${FormatUtils.money(draft.input.amount)} submitted',
      );
    } catch (_) {
      _toast(messenger, 'Could not submit the claim. Please try again.');
    }
  }

  Future<void> _editExpense(
    BuildContext context,
    WidgetRef ref,
    Expense expense,
  ) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final draft = await ExpenseFormSheet.show(context, initial: expense);
    if (draft == null) return;
    try {
      final repo = ref.read(expenseRepositoryProvider);
      await repo.update(expense.id, draft.input);
      if (draft.bill != null) {
        await repo.attachBill(
          uid: uid,
          expenseId: expense.id,
          bill: draft.bill!,
        );
      }
      ref.invalidate(expensesProvider);
      _toast(messenger, 'Claim updated');
    } catch (_) {
      _toast(messenger, 'Could not update the claim. Please try again.');
    }
  }

  Future<void> _deleteExpense(
    BuildContext context,
    WidgetRef ref,
    Expense expense,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw claim?'),
        content: Text(
          'The ${FormatUtils.money(expense.amount)} ${expense.category.label.toLowerCase()} '
          'claim and its bill photo will be deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(expenseRepositoryProvider).delete(expense);
      ref.invalidate(expensesProvider);
      _toast(messenger, 'Claim withdrawn');
    } catch (_) {
      _toast(messenger, 'Could not withdraw the claim. Please try again.');
    }
  }

  void _toast(ScaffoldMessengerState messenger, String message) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.totals});
  final ExpenseTotals totals;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Total claimed',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            FormatUtils.money(totals.total),
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 14),
          Row(
            children: [
              _Split(
                label: 'Pending',
                value: totals.pending,
                color: AppColors.warning,
              ),
              _Split(
                label: 'Approved',
                value: totals.approved,
                color: AppColors.success,
              ),
              _Split(
                label: 'Rejected',
                value: totals.rejected,
                color: AppColors.error,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Split extends StatelessWidget {
  const _Split({required this.label, required this.value, required this.color});

  final String label;
  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 7,
                width: 7,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            FormatUtils.money(value),
            style: const TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _ExpenseRow extends StatelessWidget {
  const _ExpenseRow({
    required this.expense,
    required this.onEdit,
    required this.onDelete,
  });

  final Expense expense;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 42,
                width: 42,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  expense.category.icon,
                  size: 20,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      expense.category.label,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      IstDate.longLabel(expense.date),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    FormatUtils.money(expense.amount),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  StatusChip(
                    label: expense.status.label,
                    color: expense.status.color,
                    background: expense.status.background,
                  ),
                ],
              ),
            ],
          ),
          if (expense.description?.trim().isNotEmpty ?? false) ...[
            const SizedBox(height: 11),
            Text(
              expense.description!.trim(),
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.onSurfaceVariant,
                height: 1.4,
              ),
            ),
          ],
          if (expense.status == ExpenseStatus.rejected &&
              (expense.reviewNote?.trim().isNotEmpty ?? false)) ...[
            const SizedBox(height: 11),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: AppColors.errorContainer,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Text(
                'Rejected: ${expense.reviewNote!.trim()}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.error,
                  height: 1.4,
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              if (expense.billUrl != null)
                TextButton.icon(
                  onPressed: () => launchUrl(
                    Uri.parse(expense.billUrl!),
                    mode: LaunchMode.externalApplication,
                  ),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: AppColors.primary,
                  ),
                  icon: const Icon(Icons.receipt_outlined, size: 16),
                  label: const Text(
                    'View bill',
                    style: TextStyle(fontSize: 12.5),
                  ),
                ),
              const Spacer(),
              // Once an admin has decided, the record is an audit trail — the
              // Firestore rules reject the write, so the controls are hidden.
              if (expense.isEditable) ...[
                TextButton.icon(
                  onPressed: onEdit,
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: AppColors.onSurfaceVariant,
                  ),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Edit', style: TextStyle(fontSize: 12.5)),
                ),
                TextButton.icon(
                  onPressed: onDelete,
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: AppColors.error,
                  ),
                  icon: const Icon(Icons.delete_outline_rounded, size: 16),
                  label: const Text(
                    'Withdraw',
                    style: TextStyle(fontSize: 12.5),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
