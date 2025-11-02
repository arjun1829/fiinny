import 'dart:math';

import 'package:characters/characters.dart';
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

  List<AmountQuickChipOption> _buildQuickOptions() {
    final quickValues = _controller.quickChipValues;
    if (quickValues.isEmpty) return const [];

    final total = _controller.selectedGroupIds
        .map((id) => _controller.outstandingByGroup[id]?.abs() ?? 0)
        .fold<double>(0.0, (sum, value) => sum + value);

    String labelFor(double value) {
      if (total <= 0) return '₹${_formatAmount(value)}';
      final ratio = (value / total).clamp(0.0, 1.0);
      if ((ratio - 1.0).abs() < 0.02) return 'Full';
      if ((ratio - 0.75).abs() < 0.02) return '75%';
      if ((ratio - 0.50).abs() < 0.02) return '50%';
      if ((ratio - 0.25).abs() < 0.02) return '25%';
      return '₹${_formatAmount(value)}';
    }

    return [
      for (final value in quickValues)
        AmountQuickChipOption(label: labelFor(value), amount: value),
    ];
  }

  String _formatAmount(double value) => value.toStringAsFixed(2);

  Future<void> _handleSubmit() async {
    if (!_controller.canSubmit) return;
    final amount = _controller.proposedAmount;
    final allocations = _allocateAmount(amount);
    if (allocations.isEmpty) return;

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
    Widget avatar;
    final url = widget.friendAvatarUrl;
    if (url != null && url.startsWith('http')) {
      avatar = CircleAvatar(radius: 28, backgroundImage: NetworkImage(url));
    } else {
      avatar = CircleAvatar(
        radius: 28,
        backgroundColor: AppColors.ink700,
        child: Text(
          widget.friendName.isNotEmpty ? widget.friendName.characters.first.toUpperCase() : '👤',
          style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
        ),
      );
    }

    final pillColor = _controller.isReceiveFlow ? AppColors.good : AppColors.bad;
    final pillText = _controller.isReceiveFlow ? 'owes you' : 'you owe';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        avatar,
        const SizedBox(width: AppSpacing.l),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.friendName,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
              ),
              if (widget.friendSubtitle != null && widget.friendSubtitle!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    widget.friendSubtitle!,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.white.withOpacity(.64),
                        ),
                  ),
                ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: pillColor.withOpacity(.18),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: pillColor.withOpacity(.4)),
          ),
          child: Text(
            pillText.toUpperCase(),
            style: TextStyle(color: pillColor, fontWeight: FontWeight.w700, fontSize: 12),
          ),
        ),
      ],
    );
  }

  Widget _buildGroups() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Select groups to settle',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: AppSpacing.m),
        ...widget.groupDisplays.map((group) {
          final selected = _controller.selectedGroupIds.contains(group.id);
          return SettleGroupRow(
            title: group.title,
            subtitle: group.subtitle,
            amount: group.amount,
            selected: selected,
            onToggle: () => setState(() => _controller.toggleGroup(group.id)),
            leading: group.avatarUrl != null && group.avatarUrl!.startsWith('http')
                ? CircleAvatar(radius: 22, backgroundImage: NetworkImage(group.avatarUrl!))
                : null,
            enabled: (group.amount >= 0) == _controller.isReceiveFlow,
          );
        }),
      ],
    );
  }

  Widget _buildAmountSection() {
    final summaryAmount = _controller.totalSelectedOutstanding.abs();
    final summaryLabel = _controller.isReceiveFlow ? 'You get back' : 'You owe';
    final summaryColor = _controller.isReceiveFlow ? AppColors.good : AppColors.bad;
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
                        color: Colors.white.withOpacity(.7),
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  '₹${_formatAmount(summaryAmount)}',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: summaryColor,
                        fontWeight: FontWeight.w800,
                      ),
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
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18),
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: Colors.white.withOpacity(.6)),
                  prefixText: '₹ ',
                  prefixStyle: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    borderSide: BorderSide(color: Colors.white.withOpacity(.18)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    borderSide: const BorderSide(color: AppColors.mint, width: 1.6),
                  ),
                  filled: true,
                  fillColor: Colors.white.withOpacity(.05),
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
            style: const TextStyle(color: AppColors.bad, fontSize: 12),
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
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.ink900,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.xl, AppSpacing.xl, AppSpacing.xl + 8),
          child: Column(
            mainAxisSize: MainAxisSize.max,
            children: [
              Container(
                width: 46,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(.18),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              _buildHeader(),
              const SizedBox(height: AppSpacing.xl),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GlassCard(
                        color: Colors.white.withOpacity(.06),
                        borderRadius: 24,
                        padding: const EdgeInsets.all(AppSpacing.l),
                        child: _buildGroups(),
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      GlassCard(
                        color: Colors.white.withOpacity(.06),
                        borderRadius: 24,
                        padding: const EdgeInsets.all(AppSpacing.l),
                        child: _buildAmountSection(),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _controller.canSubmit ? _handleSubmit : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.mint,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                  child: Text(
                    _controller.isReceiveFlow
                        ? 'MARK ₹${_formatAmount(_controller.proposedAmount)} AS RECEIVED'
                        : 'PAY ₹${_formatAmount(_controller.proposedAmount)}',
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s),
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
      ),
    );
  }
}
