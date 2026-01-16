import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors, AppSpacing, AppRadii;
import 'package:lifemap/widgets/glass_card.dart';

import 'confirm_mark_received_dialog.dart';
import 'settle_success_dialog.dart';
import 'settle_up_controller_v2.dart';
import 'widgets/amount_quick_chips.dart';
import 'widgets/settle_group_row.dart';

class SettleGroupDisplay {
  const SettleGroupDisplay({
    required this.id,
    required this.title,
    required this.amount,
    this.subtitle,
    this.avatarUrl,
  });

  final String id;
  final String title;
  final double amount;
  final String? subtitle;
  final String? avatarUrl;
}

class SettleUpResult {
  const SettleUpResult({
    required this.amount,
    required this.allocations,
  });

  final double amount;
  final Map<String, double> allocations;
}

class SettleUpSheetV2 extends StatefulWidget {
  const SettleUpSheetV2({
    super.key,
    required this.friendName,
    required this.friendId,
    required this.outstandingByGroup,
    required this.groupDisplays,
    required this.isReceiveFlow,
    required this.onMarkReceived,
    this.friendAvatarUrl,
    this.friendSubtitle,
    this.onPay,
  });

  final String friendName;
  final String friendId;
  final Map<String, double> outstandingByGroup;
  final List<SettleGroupDisplay> groupDisplays;
  final bool isReceiveFlow;
  final String? friendAvatarUrl;
  final String? friendSubtitle;
  final Future<void> Function(SettleUpResult result) onMarkReceived;
  final Future<void> Function(SettleUpResult result)? onPay;

  @override
  State<SettleUpSheetV2> createState() => _SettleUpSheetV2State();
}

class _SettleUpSheetV2State extends State<SettleUpSheetV2> {
  late final SettleUpControllerV2 _controller;
  late final TextEditingController _amountCtrl;
  int? _selectedChipIndex;
  bool _isSubmitting = false;

  Set<String> get _eligibleSelectableIds => widget.outstandingByGroup.entries
      .where((entry) => entry.value != 0 && (entry.value > 0) == _controller.isReceiveFlow)
      .map((entry) => entry.key)
      .toSet();

  @override
  void initState() {
    super.initState();
    _controller = SettleUpControllerV2(
      friendId: widget.friendId,
      outstandingByGroup: widget.outstandingByGroup,
      isReceiveFlow: widget.isReceiveFlow,
      currency: 'INR',
    )..addListener(_syncFromController);
    _amountCtrl = TextEditingController(
      text: _controller.proposedAmount > 0
          ? _formatAmount(_controller.proposedAmount)
          : '',
    );
  }

  @override
  void dispose() {
    _controller.removeListener(_syncFromController);
    _controller.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  void _syncFromController() {
    final controllerAmount = _controller.proposedAmount;
    final parsed = double.tryParse(_amountCtrl.text.replaceAll(',', '')) ?? 0;
    if ((parsed - controllerAmount).abs() > 0.01) {
      _amountCtrl.text = controllerAmount > 0 ? _formatAmount(controllerAmount) : '';
      _amountCtrl.selection = TextSelection.fromPosition(
        TextPosition(offset: _amountCtrl.text.length),
      );
    }
    final options = _buildQuickOptions();
    final match = options.indexWhere((opt) => (opt.amount - controllerAmount).abs() < 0.01);
    setState(() {
      _selectedChipIndex = match >= 0 ? match : null;
    });
  }

  void _toggleSelectAll() {
    final eligible = _eligibleSelectableIds;
    if (eligible.isEmpty) return;
    final allSelected = eligible.every(_controller.selectedGroupIds.contains);
    for (final id in eligible) {
      final isSelected = _controller.selectedGroupIds.contains(id);
      if (allSelected && isSelected) {
        _controller.toggleGroup(id);
      } else if (!allSelected && !isSelected) {
        _controller.toggleGroup(id);
      }
    }
  }

  void _showHelpSheet() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('How Settle Up works'),
        content: const Text(
          'Settling up in Fiinny only updates the balance shared with your friend or group. '
          'No actual money movement happens in the app — continue using your preferred payment method.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('GOT IT'),
          ),
        ],
      ),
    );
  }

  List<AmountQuickChipOption> _buildQuickOptions() {
    final total = _controller.totalSelectedOutstanding.abs();
    if (total <= 0) return const [];

    final options = <AmountQuickChipOption>[];

    void addOption(String label, double rawValue) {
      final value = rawValue.clamp(0, total);
      if (value <= 0) return;
      final rounded = double.parse(value.toStringAsFixed(2));
      if (options.any((opt) => (opt.amount - rounded).abs() < 0.01)) return;
      options.add(AmountQuickChipOption(label: label, amount: rounded));
    }

    addOption('Full', total);
    addOption('75%', total * 0.75);
    addOption('50%', total * 0.50);
    addOption('25%', total * 0.25);
    addOption('₹500', min(500, total));
    addOption('₹200', min(200, total));
    addOption('₹100', min(100, total));
    return options;
  }

  String _formatAmount(double value) => value.toStringAsFixed(2);

  Future<void> _handleSubmit() async {
    if (!_controller.canSubmit) return;
    final amount = _controller.proposedAmount;
    final allocations = _allocateAmount(amount);
    if (allocations.isEmpty) return;
    setState(() => _isSubmitting = true);

    try {
      if (_controller.isReceiveFlow) {
        final confirmed = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (_) => ConfirmMarkReceivedDialog(
            friendName: widget.friendName,
            amountText: '₹${_formatAmount(amount)}',
          ),
        );
        if (confirmed != true) return;

        await widget.onMarkReceived(SettleUpResult(amount: amount, allocations: allocations));
        if (!mounted) return;
        await showDialog(
          context: context,
          barrierDismissible: true,
          builder: (_) => const SettleSuccessDialog(),
        );
        if (!mounted) return;
        Navigator.of(context).pop(true);
      } else {
        final handler = widget.onPay;
        if (handler == null) return;
        await handler(SettleUpResult(amount: amount, allocations: allocations));
        if (!mounted) return;
        Navigator.of(context).pop(true);
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Map<String, double> _allocateAmount(double amount) {
    final selected = _controller.selectedGroupIds.toList();
    if (selected.isEmpty) return const {};

    final outstanding = selected
        .map((id) => max(_controller.outstandingByGroup[id]?.abs() ?? 0.0, 0.0))
        .toList();
    final total = outstanding.fold<double>(0.0, (sum, value) => sum + value);
    if (total <= 0) return const {};

    final allocations = <String, double>{};
    double remaining = amount;
    for (var i = 0; i < selected.length; i++) {
      final id = selected[i];
      final share = outstanding[i];
      if (share <= 0) continue;
      double slice;
      if (i == selected.length - 1) {
        slice = remaining;
      } else {
        slice = double.parse((amount * (share / total)).toStringAsFixed(2));
        slice = slice.clamp(0, remaining);
      }
      slice = min(slice, share);
      remaining -= slice;
      allocations[id] = double.parse(slice.toStringAsFixed(2));
    }
    if (remaining > 0.01 && allocations.isNotEmpty) {
      final lastKey = allocations.keys.last;
      allocations[lastKey] = double.parse((allocations[lastKey]! + remaining).toStringAsFixed(2));
    }
    return allocations;
  }

  Widget _buildHeader() {
    final outstanding = widget.outstandingByGroup.values;
    final getBack = outstanding.where((value) => value > 0).fold<double>(0.0, (sum, value) => sum + value);
    final youOwe = outstanding.where((value) => value < 0).fold<double>(0.0, (sum, value) => sum + value.abs());
    final eligible = _eligibleSelectableIds;
    final allSelected = eligible.isNotEmpty && eligible.every(_controller.selectedGroupIds.contains);
    final someSelected = _controller.selectedGroupIds.isNotEmpty && !allSelected;

    return _FriendHeader(
      name: widget.friendName,
      subtitle: widget.friendSubtitle,
      avatarUrl: widget.friendAvatarUrl,
      getBackAmount: getBack,
      oweAmount: youOwe,
      allSelected: allSelected,
      someSelected: someSelected,
      onToggleAll: _toggleSelectAll,
      onHelp: _showHelpSheet,
    );
  }

  Widget _buildGroups() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Outstanding balances',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: AppSpacing.m),
        ...widget.groupDisplays.map((group) {
          final selected = _controller.selectedGroupIds.contains(group.id);
          final enabled = (group.amount >= 0) == _controller.isReceiveFlow && group.amount.abs() > 0.0;
          return SettleGroupRow(
            title: group.title,
            subtitle: group.subtitle,
            amount: group.amount,
            selected: selected,
            onToggle: () => setState(() => _controller.toggleGroup(group.id)),
            leading: group.avatarUrl != null && group.avatarUrl!.startsWith('http')
                ? CircleAvatar(radius: 22, backgroundImage: NetworkImage(group.avatarUrl!))
                : null,
            enabled: enabled,
          );
        }),
      ],
    );
  }

  Widget _buildAmountSection() {
    final summaryAmount = _controller.totalSelectedOutstanding.abs();
    final summaryLabel = _controller.isReceiveFlow ? 'You get back' : 'You owe';
    final summaryColor = _controller.isReceiveFlow ? Theme.of(context).colorScheme.primary : Theme.of(context).textTheme.bodyLarge?.color?.withValues(alpha: .72) ?? Theme.of(context).textTheme.bodyMedium?.color;
    final quickOptions = _buildQuickOptions();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  summaryLabel,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: Theme.of(context).textTheme.labelLarge?.color?.withValues(alpha: .72),
                      ),
                ),
                const SizedBox(height: 6),
                TweenAnimationBuilder<double>(
                  duration: const Duration(milliseconds: 200),
                  tween: Tween<double>(begin: 0, end: summaryAmount),
                  builder: (_, value, __) {
                    return Text(
                      '₹${_formatAmount(value)}',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            color: summaryColor,
                            fontWeight: FontWeight.w800,
                          ),
                    );
                  },
                ),
              ],
            ),
            Expanded(
              child: TextField(
                controller: _amountCtrl,
                onChanged: (value) {
                  final parsed = double.tryParse(value.replaceAll(',', '')) ?? 0;
                  _controller.setAmount(parsed);
                  setState(() {
                    _selectedChipIndex = null;
                  });
                },
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).textTheme.bodySmall?.color?.withValues(alpha: .6),
                      ),
                  prefixText: '₹ ',
                  prefixStyle: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    borderSide: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: .2)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    borderSide: BorderSide(color: Theme.of(context).colorScheme.primary, width: 1.6),
                  ),
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: .4),
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^[0-9]*[.]?[0-9]{0,2}')),
                ],
              ),
            ),
          ],
        ),
        if (_controller.errorText != null) ...[
          const SizedBox(height: 6),
          Text(
            _controller.errorText!,
            style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
          ),
        ],
        const SizedBox(height: AppSpacing.l),
        AmountQuickChips(
          options: quickOptions,
          selectedAmount: (_selectedChipIndex != null &&
                  _selectedChipIndex! >= 0 &&
                  _selectedChipIndex! < quickOptions.length)
              ? quickOptions[_selectedChipIndex!].amount
              : null,
          onSelected: (value) {
            _controller.applyChip(value);
            setState(() {
              final quickOpts = _buildQuickOptions();
              _selectedChipIndex = quickOpts.indexWhere((opt) => (opt.amount - value).abs() < 0.01);
            });
          },
          onClear: () {
            _controller.setAmount(0);
            _amountCtrl.clear();
            setState(() => _selectedChipIndex = null);
          },
          clearLabel: 'Clear',
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final surface = theme.colorScheme.surface;

    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.xl,
                AppSpacing.xl,
                AppSpacing.xxl + AppSpacing.l,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.max,
                children: [
                  Container(
                    width: 46,
                    height: 4,
                    decoration: BoxDecoration(
                      color: theme.dividerColor.withValues(alpha: .28),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.l),
                  GlassCard(
                    padding: const EdgeInsets.all(AppSpacing.l),
                    borderRadius: 24,
                    color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: .4),
                    child: _buildHeader(),
                  ),
                  const SizedBox(height: AppSpacing.l),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GlassCard(
                            padding: const EdgeInsets.all(AppSpacing.l),
                            borderRadius: 24,
                            color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: .3),
                            child: _buildGroups(),
                          ),
                          const SizedBox(height: AppSpacing.l),
                          GlassCard(
                            padding: const EdgeInsets.all(AppSpacing.l),
                            borderRadius: 24,
                            color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: .3),
                            child: _buildAmountSection(),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.l),
                ],
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: _SummaryBar(
                amount: _controller.proposedAmount,
                isReceiveFlow: _controller.isReceiveFlow,
                canSubmit: _controller.canSubmit,
                isLoading: _isSubmitting,
                onSubmit: _handleSubmit,
              ),
            ),
            // Testing checklist (keep as comments)
            // [ ] With 1 group selected, CTA shows correct polarity text + amount.
            // [ ] Multiple groups aggregate correctly.
            // [ ] Quick chips clamp to outstanding and update input.
            // [ ] Confirm dialog shows exact amount and name.
            // [ ] Success dialog appears, auto-dismisses, state updates in parent list.
            // [ ] Feature flag OFF: old flow works unchanged.
            // [ ] No console errors; no changed public APIs.
          ],
        ),
      ),
    );
  }
}

class _FriendHeader extends StatelessWidget {
  const _FriendHeader({
    required this.name,
    required this.avatarUrl,
    required this.getBackAmount,
    required this.oweAmount,
    required this.allSelected,
    required this.someSelected,
    required this.onToggleAll,
    required this.onHelp,
    this.subtitle,
  });

  final String name;
  final String? subtitle;
  final String? avatarUrl;
  final double getBackAmount;
  final double oweAmount;
  final bool allSelected;
  final bool someSelected;
  final VoidCallback onToggleAll;
  final VoidCallback onHelp;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final neutralColor = textTheme.bodySmall?.color?.withValues(alpha: .72) ?? textTheme.bodyMedium?.color;

    Widget buildChip(String label, double amount, Color color) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color),
            ),
            const SizedBox(width: 8),
            Text(
              '₹${amount.toStringAsFixed(2)}',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color),
            ),
          ],
        ),
      );
    }

    final avatar = avatarUrl != null && avatarUrl!.startsWith('http')
        ? CircleAvatar(radius: 28, backgroundImage: NetworkImage(avatarUrl!))
        : CircleAvatar(
            radius: 28,
            backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: .16),
            child: Text(
              name.characters.isNotEmpty ? name.characters.first.toUpperCase() : '👤',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            // UX: Tri-state checkbox communicates partial selection without extra copy.
            AnimatedScale(
              duration: const Duration(milliseconds: 120),
              scale: allSelected || someSelected ? 1 : .94,
              child: Checkbox(
                value: allSelected ? true : (someSelected ? null : false),
                tristate: true,
                onChanged: (_) => onToggleAll(),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                side: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: .5)),
                fillColor: WidgetStateProperty.resolveWith((states) {
                  if (states.contains(WidgetState.selected)) {
                    return Theme.of(context).colorScheme.primary;
                  }
                  return Theme.of(context).colorScheme.surfaceContainerHighest;
                }),
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            Text('Select all', style: textTheme.labelLarge),
            const Spacer(),
            IconButton(
              onPressed: onHelp,
              icon: const Icon(Icons.help_outline_rounded),
              tooltip: 'How Settle Up works',
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.s),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            avatar,
            const SizedBox(width: AppSpacing.l),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        subtitle!,
                        style: textTheme.bodySmall?.copyWith(color: neutralColor),
                      ),
                    ),
                  const SizedBox(height: AppSpacing.m),
                  Wrap(
                    spacing: AppSpacing.s,
                    runSpacing: AppSpacing.s,
                    children: [
                      buildChip('You get back', getBackAmount, Theme.of(context).colorScheme.primary),
                      buildChip('You owe', oweAmount, neutralColor ?? Colors.black),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SummaryBar extends StatelessWidget {
  const _SummaryBar({
    required this.amount,
    required this.isReceiveFlow,
    required this.canSubmit,
    required this.isLoading,
    required this.onSubmit,
  });

  final double amount;
  final bool isReceiveFlow;
  final bool canSubmit;
  final bool isLoading;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = isReceiveFlow ? 'You get back' : 'You owe';
    final ctaText = isReceiveFlow
        ? 'MARK ₹${amount.toStringAsFixed(2)} AS RECEIVED'
        : 'MARK ₹${amount.toStringAsFixed(2)} AS PAID';
    final valueColor = isReceiveFlow
        ? theme.colorScheme.primary
        : theme.textTheme.bodyLarge?.color?.withValues(alpha: .72) ?? theme.textTheme.bodyMedium?.color;

    return Material(
      color: Colors.transparent,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: EdgeInsets.only(
          left: AppSpacing.xl,
          right: AppSpacing.xl,
          top: AppSpacing.l,
          bottom: MediaQuery.of(context).padding.bottom + AppSpacing.l,
        ),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: .08),
              blurRadius: 24,
              offset: const Offset(0, -8),
            ),
          ],
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label, style: theme.textTheme.labelLarge),
                    const SizedBox(height: 4),
                    TweenAnimationBuilder<double>(
                      duration: const Duration(milliseconds: 200),
                      tween: Tween<double>(begin: 0, end: amount.abs()),
                      builder: (_, value, __) {
                        return Text(
                          '₹${value.toStringAsFixed(2)}',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: valueColor,
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.m),
              FilledButton(
                onPressed: canSubmit && !isLoading ? onSubmit : null,
                style: FilledButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  foregroundColor: theme.colorScheme.onPrimary,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                  textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
                child: isLoading
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(theme.colorScheme.onPrimary),
                            ),
                          ),
                          SizedBox(width: 12),
                          Text('Processing...'),
                        ],
                      )
                    : Text(ctaText),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
