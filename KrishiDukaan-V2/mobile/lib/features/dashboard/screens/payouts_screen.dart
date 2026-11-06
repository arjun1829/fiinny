import '../../../core/models/order_model.dart';
import '../data/payout_timeline.dart';
import '../widgets/payout_timeline_view.dart';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/payout_account_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/utils/kyc_rules.dart';
import '../data/payout_repository.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../data/seller_earnings.dart';
import '../providers/dashboard_provider.dart';

/// Seller-facing payouts — the app's counterpart to web's
/// `/dashboard/payouts`, which the app had no equivalent for at all: a seller
/// on mobile could take orders but had no way to see what they were owed or
/// tell us where to send it.
///
/// Two things, in this order: what they are owed (the question they actually
/// came here with), then the bank account it goes to.
class PayoutsScreen extends ConsumerWidget {
  const PayoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final earnings = ref.watch(sellerEarningsProvider);
    final accountAsync = ref.watch(payoutAccountProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppTopBar(title: 'Payouts'),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(sellerEarningsStatsProvider);
          ref.invalidate(payoutAccountProvider);
          await ref.read(payoutAccountProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            earnings.when(
              loading: () => const _EarningsSkeleton(),
              // A read failure must not be dressed up as ₹0 — that would read
              // as "you are owed nothing", which is a very different claim.
              error: (_, _) => const _InlineNotice(
                icon: Icons.error_outline,
                color: Colors.red,
                text: 'Could not load your earnings. Pull down to retry.',
              ),
              data: (e) => _EarningsSection(earnings: e),
            ),
            const SizedBox(height: 20),
            const _HowItWorks(),
            const SizedBox(height: 20),
            accountAsync.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (_, _) => const _InlineNotice(
                icon: Icons.error_outline,
                color: Colors.red,
                text: 'Could not load your bank account. Pull down to retry.',
              ),
              data: (account) => _BankSection(account: account),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

// ─── Earnings ───────────────────────────────────────────────────────────────

class _EarningsSection extends StatelessWidget {
  final SellerEarnings earnings;
  const _EarningsSection({required this.earnings});

  @override
  Widget build(BuildContext context) {
    if (earnings.isEmpty) {
      return const _InlineNotice(
        icon: Icons.receipt_long_outlined,
        color: AppColors.onSurfaceVariant,
        text:
            'No earnings yet. Once a customer orders from you and you mark it '
            'delivered, the money will show up here.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.9,
          children: [
            _StatTile(
              label: 'Ready to transfer',
              value: CurrencyUtils.format(earnings.due),
              highlight: earnings.due > 0,
            ),
            _StatTile(
              label: 'On hold',
              value: CurrencyUtils.format(earnings.onHold),
            ),
            _StatTile(
              label: 'Awaiting delivery',
              value: CurrencyUtils.format(earnings.awaitingDelivery),
            ),
            _StatTile(
              label: 'Already paid out',
              value: CurrencyUtils.format(earnings.paidOut),
            ),
          ],
        ),
        if (earnings.paidOut > 0) ...[
          const SizedBox(height: 10),
          _InlineNotice(
            icon: Icons.account_balance_outlined,
            color: Colors.green.shade700,
            text:
                '${CurrencyUtils.format(earnings.settled)} is in your bank. '
                '${CurrencyUtils.format((earnings.paidOut - earnings.settled).clamp(0, double.infinity).toDouble())} '
                'is on the way (Razorpay settles it, usually by the next working day).',
          ),
        ],
        if (earnings.nextReleaseOn != null) ...[
          const SizedBox(height: 10),
          _InlineNotice(
            icon: Icons.schedule,
            color: Colors.blue.shade700,
            text:
                'Next release on '
                '${DateFormat('d MMM yyyy').format(earnings.nextReleaseOn!)}.',
          ),
        ],
        const SizedBox(height: 20),
        Text('Order by order', style: AppTextStyles.heading3),
        const SizedBox(height: 2),
        Text(
          'Tap an order to see each step: paid, held, delivered, released, in your bank.',
          style: AppTextStyles.bodySmall.copyWith(
            color: AppColors.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        ...earnings.rows.take(50).map((r) => _EarningRow(row: r)),
      ],
    );
  }
}

class _EarningRow extends ConsumerWidget {
  final SellerEarningsRow row;
  const _EarningRow({required this.row});

  ({String label, Color color}) get _badge => switch (row.payout?.state) {
    // Razorpay's own word on the transfer, when there is one.
    'settled' => (label: 'In your bank', color: Colors.green.shade700),
    'processing' => (label: 'On the way', color: Colors.blue.shade700),
    'failed' => (label: 'Transfer failed', color: AppColors.error),
    _ => _stateBadge,
  };

  ({String label, Color color}) get _stateBadge => switch (row.state) {
    PayoutState.due => (label: 'Ready', color: AppColors.primary),
    PayoutState.onHold => (label: 'On hold', color: Colors.orange.shade800),
    PayoutState.awaitingDelivery => (
      label: 'Not delivered',
      color: AppColors.onSurfaceVariant,
    ),
    PayoutState.transferred => (label: 'Paid', color: Colors.green.shade700),
    PayoutState.notPayable => (
      label: 'Not payable',
      color: AppColors.onSurfaceVariant,
    ),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = row.order;
    final kycPending = ref.watch(kycPendingProvider);
    // Razorpay's word on the money, the same headline as the timeline.
    final badge = order != null ? _timelineBadge(order, kycPending) : _badge;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: order == null
          ? null
          : () => showPayoutTimelineSheet(context, order),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '#${row.orderId}',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    CurrencyUtils.format(row.net),
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  // Only shown when a real fee is known — never an invented one.
                  if (row.gatewayFee > 0)
                    Text(
                      '${CurrencyUtils.format(row.gross)} less '
                      '${CurrencyUtils.format(row.gatewayFee)} gateway fee',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  if (row.state == PayoutState.onHold && row.releaseOn != null)
                    Text(
                      row.payout?.state == 'scheduled'
                          ? 'Releases ${DateFormat('d MMM, h:mm a').format(row.releaseOn!)}'
                          : 'Releases ${DateFormat('d MMM').format(row.releaseOn!)}',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  if (row.payout?.state == 'settled' &&
                      (row.payout?.settlementAt ?? row.payout?.settledAt) !=
                          null)
                    Text(
                      'Settled ${DateFormat('d MMM yyyy').format((row.payout!.settlementAt ?? row.payout!.settledAt)!.toLocal())}'
                      '${(row.payout!.utr ?? '').isNotEmpty ? ' · UTR ${row.payout!.utr}' : ''}',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: Colors.green.shade800,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  if ((row.payout?.transferId ?? '').isNotEmpty)
                    Text(
                      'Razorpay ${row.payout!.transferId}',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.onSurfaceVariant,
                        fontSize: 10.5,
                      ),
                    ),
                ],
              ),
            ),
            Container(
              constraints: const BoxConstraints(maxWidth: 150),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: badge.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                badge.label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.bodySmall.copyWith(
                  color: badge.color,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (row.order != null)
              const Icon(
                Icons.chevron_right,
                size: 18,
                color: AppColors.onSurfaceVariant,
              ),
          ],
        ),
      ),
    );
  }

  static ({String label, Color color}) _timelineBadge(
    OrderModel order,
    bool kycPending,
  ) {
    final t = payoutTimeline(order, kycPending: kycPending);
    final color = switch (t.tone) {
      TimelineTone.good => Colors.green.shade700,
      TimelineTone.info => Colors.blue.shade700,
      TimelineTone.wait => Colors.orange.shade800,
      TimelineTone.warn => Colors.deepOrange.shade800,
      TimelineTone.bad => AppColors.error,
      TimelineTone.muted => AppColors.onSurfaceVariant,
    };
    return (label: t.headline, color: color);
  }
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.blue.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.info_outline, size: 18, color: Colors.blue.shade700),
              const SizedBox(width: 8),
              Text(
                'How you get paid',
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.w700,
                  color: Colors.blue.shade900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Wording deliberately matches the web page and the /sell promise —
          // a seller must not read two different commission claims.
          ..._points.map(
            (t) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '•  $t',
                style: AppTextStyles.bodySmall.copyWith(
                  color: Colors.blue.shade900,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static const _points = [
    'Money is released after you mark an order Delivered; the date shows '
        'against each order.',
    'Razorpay then settles it to your bank, usually by the next working day. '
        '"In your bank" means it has settled.',
    'The payment gateway\'s charge and any platform fee shown on the order '
        'are deducted.',
  ];
}

// ─── Bank account ───────────────────────────────────────────────────────────

class _BankSection extends ConsumerWidget {
  final PayoutAccountModel? account;
  const _BankSection({required this.account});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = account;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Selling never waits for this; only the transfer to the bank does.
        if (!(a?.isVerified ?? false)) ...[
          _InlineNotice(
            icon: Icons.verified_user_outlined,
            color: Colors.green.shade800,
            text:
                'You can keep selling while you do this. Money from your '
                'online orders is kept safe by KrishiDukan and sent to your '
                'bank automatically once your details are verified.',
          ),
          const SizedBox(height: 16),
        ],
        _KycChecklist(account: a),
        const SizedBox(height: 16),
        Text('Bank account', style: AppTextStyles.heading3),
        const SizedBox(height: 4),
        Text(
          'Where your order money is sent.',
          style: AppTextStyles.bodySmall.copyWith(
            color: AppColors.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 12),
        if (a != null && a.hasBank) ...[
          _SavedAccountCard(account: a),
          const SizedBox(height: 12),
        ],
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () => _openForm(context, ref),
            icon: Icon(
              a?.hasBank ?? false ? Icons.edit_outlined : Icons.add,
              size: 18,
            ),
            label: Text(
              a?.hasBank ?? false ? 'Change details' : 'Add bank details',
            ),
          ),
        ),
        const SizedBox(height: 24),
        _KycSection(account: a),
      ],
    );
  }

  Future<void> _openForm(BuildContext context, WidgetRef ref) async {
    final gstin = ref.read(currentUserProvider).value?.gstin;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BankAccountForm(account: account, profileGstin: gstin),
    );
    if (saved == true) ref.invalidate(payoutAccountProvider);
  }
}

/// Bank, PAN, licence: ticked as each is done, with where the account stands.
class _KycChecklist extends StatelessWidget {
  final PayoutAccountModel? account;
  const _KycChecklist({required this.account});

  @override
  Widget build(BuildContext context) {
    final a = account;
    final missing = a?.missing ?? KycItem.values;
    final line = switch (a?.status) {
      'verified' => 'Verified. Your money goes to your bank automatically.',
      'rejected' => 'Something needs fixing. See below.',
      _ when missing.isEmpty =>
        "All done. We're verifying your details, usually within 1 working day.",
      _ => '${missing.length} of 3 left',
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Get paid to your bank: 3 quick steps',
            style: AppTextStyles.bodyMedium.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          for (final item in KycItem.values)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Icon(
                    missing.contains(item)
                        ? Icons.radio_button_unchecked
                        : Icons.check_circle,
                    size: 18,
                    color: missing.contains(item)
                        ? AppColors.onSurfaceVariant
                        : Colors.green.shade700,
                  ),
                  const SizedBox(width: 8),
                  Text(kycItemLabel[item]!, style: AppTextStyles.bodySmall),
                ],
              ),
            ),
          const SizedBox(height: 2),
          Text(
            line,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _SavedAccountCard extends StatelessWidget {
  final PayoutAccountModel account;
  const _SavedAccountCard({required this.account});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (account.status) {
      'verified' => ('Verified', Colors.green.shade700),
      'rejected' => ('Rejected', Colors.red.shade700),
      _ => ('Pending verification', Colors.orange.shade800),
    };

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  account.accountHolderName,
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  label,
                  style: AppTextStyles.bodySmall.copyWith(
                    color: color,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // Never the full number: a shared or shoulder-surfed screen must not
          // expose a complete bank account.
          Text(
            '••••${account.accountLast4}  ·  ${account.ifsc}',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
          if (account.bankName != null || account.branchName != null)
            Text(
              [
                account.bankName,
                account.branchName,
              ].whereType<String>().join(', '),
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
          if (account.gstin != null || account.pan != null)
            Text(
              [
                if (account.gstin != null) 'GST ${account.gstin}',
                if (account.pan != null)
                  'PAN ••••••${account.pan!.substring(account.pan!.length - 4)}',
              ].join('  ·  '),
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
          if (account.isRejected && account.rejectionReason != null) ...[
            const SizedBox(height: 8),
            Text(
              account.rejectionReason!,
              style: AppTextStyles.bodySmall.copyWith(
                color: Colors.red.shade700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Bank details form: three short steps, same rules as the website
/// (core/utils/kyc_rules.dart mirrors app/lib/kyc.ts).
class _BankAccountForm extends ConsumerStatefulWidget {
  final PayoutAccountModel? account;
  final String? profileGstin;
  const _BankAccountForm({this.account, this.profileGstin});

  @override
  ConsumerState<_BankAccountForm> createState() => _BankAccountFormState();
}

class _BankAccountFormState extends ConsumerState<_BankAccountForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(
    text: widget.account?.accountHolderName,
  );
  final _number = TextEditingController();
  final _confirm = TextEditingController();
  late final _ifsc = TextEditingController(text: widget.account?.ifsc);
  late final _bank = TextEditingController(text: widget.account?.bankName);
  late final _branch = TextEditingController(text: widget.account?.branchName);
  late final _gstin = TextEditingController(
    text: widget.account?.gstin ?? widget.profileGstin,
  );
  late final _pan = TextEditingController(text: widget.account?.pan);

  /// Shows the PAN taken from the GST number (read only).
  final _panShown = TextEditingController();
  bool _saving = false;
  String? _error;

  /// The IFSC last looked up, and what came back.
  String? _ifscLooked;
  String? _ifscFound;
  String? _ifscError;

  @override
  void initState() {
    super.initState();
    _ifsc.addListener(_onIfsc);
    _gstin.addListener(_onGstin);
    _onGstin();
    // Save stays disabled until every required field is valid.
    for (final c in [_name, _number, _confirm, _ifsc, _bank, _pan]) {
      c.addListener(_onAnyChange);
    }
  }

  void _onAnyChange() {
    final complete = _isComplete;
    if (complete != _wasComplete && mounted) {
      setState(() => _wasComplete = complete);
    }
  }

  bool _wasComplete = false;

  /// Everything payouts need: holder name, a known IFSC, bank name, the
  /// account number twice, and a PAN (typed, or read from the GST number).
  bool get _isComplete {
    final ifsc = _ifsc.text.trim().toUpperCase();
    final gst = _gstin.text.trim();
    final pan = panFromGstin(gst) ?? _pan.text.trim();
    return isValidHolderName(_name.text) &&
        ifscRe.hasMatch(ifsc) &&
        _ifscError == null &&
        _bank.text.trim().length >= 2 &&
        accountRe.hasMatch(_number.text.trim()) &&
        _confirm.text.trim() == _number.text.trim() &&
        (gst.isEmpty || isValidGstin(gst)) &&
        isValidPan(pan);
  }

  void _onGstin() {
    final pan = panFromGstin(_gstin.text) ?? '';
    if (_panShown.text != pan) _panShown.text = pan;
    _wasComplete = _isComplete;
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _number,
      _confirm,
      _ifsc,
      _bank,
      _branch,
      _gstin,
      _pan,
      _panShown,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Bank and branch come from the IFSC, so the seller types one code
  /// instead of two names. A failed lookup leaves them to type.
  Future<void> _onIfsc() async {
    final code = _ifsc.text.trim().toUpperCase();
    if (!ifscRe.hasMatch(code)) {
      // A changed code drops the old lookup's error.
      if (_ifscError != null && mounted) {
        setState(() {
          _ifscError = null;
          _ifscLooked = null;
        });
      }
      return;
    }
    if (code == _ifscLooked) return;
    _ifscLooked = code;
    try {
      final info = await ref.read(payoutRepoProvider).lookupIfsc(code);
      if (!mounted || _ifsc.text.trim().toUpperCase() != code) return;
      setState(() {
        _ifscError = null;
        _wasComplete = _isComplete;
        if (info == null) return;
        if (info.bank.isNotEmpty) _bank.text = info.bank;
        if (info.branch.isNotEmpty) _branch.text = info.branch;
        _ifscFound = [
          info.bank,
          info.branch,
        ].where((t) => t.isNotEmpty).join(', ');
      });
    } on IfscNotFound {
      if (mounted) {
        setState(() {
          _ifscFound = null;
          _ifscError = 'No bank branch has this IFSC. Please check it.';
          _wasComplete = false;
        });
      }
    }
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false) || !_isComplete) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(payoutRepoProvider)
          .save(
            accountHolderName: _name.text,
            accountNumber: _number.text,
            ifsc: _ifsc.text,
            bankName: _bank.text,
            branchName: _branch.text,
            gstin: _gstin.text,
            pan: _pan.text,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not save your details. $e';
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final panFromGst = panFromGstin(_gstin.text);
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          // Show what's wrong as soon as a field is left, not only on Save.
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your bank details', style: AppTextStyles.heading3),
                const SizedBox(height: 4),
                Text(
                  'Takes about 2 minutes. Keep your passbook or a cheque handy.',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 16),
                const _StepTitle(1, 'Bank account'),
                _field(
                  _name,
                  'Account holder name *',
                  validator: (v) => isValidHolderName(v ?? '')
                      ? null
                      : 'Enter the name exactly as it appears on the bank account (letters only).',
                ),
                _field(
                  _ifsc,
                  'IFSC code *',
                  upper: true,
                  maxLength: 11,
                  helper: _ifscFound,
                  errorText: _ifscError,
                  validator: (v) =>
                      ifscRe.hasMatch((v ?? '').trim().toUpperCase())
                      ? _ifscError
                      : 'IFSC should look like SBIN0001234. It is on your cheque book.',
                ),
                _field(
                  _bank,
                  'Bank name *',
                  validator: (v) => (v ?? '').trim().length >= 2
                      ? null
                      : 'Enter your bank name (filled in from the IFSC).',
                ),
                _field(_branch, 'Branch name (optional)'),
                _field(
                  _number,
                  'Account number *',
                  keyboard: TextInputType.number,
                  digitsOnly: true,
                  maxLength: 18,
                  validator: (v) => accountRe.hasMatch((v ?? '').trim())
                      ? null
                      : 'Account number must be 9–18 digits, no spaces.',
                ),
                _field(
                  _confirm,
                  'Re-enter account number *',
                  keyboard: TextInputType.number,
                  digitsOnly: true,
                  maxLength: 18,
                  // Retyped rather than prefilled, so a mistyped digit can't
                  // hide behind a copy of itself.
                  validator: (v) => (v ?? '').trim().isEmpty
                      ? 'Enter the account number again.'
                      : (v ?? '').trim() == _number.text.trim()
                      ? null
                      : 'The two account numbers do not match.',
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.warning_amber_rounded,
                      size: 16,
                      color: Colors.orange.shade800,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Please fill carefully and check each digit with your '
                        'passbook. Your money is sent to this account.',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: Colors.orange.shade900,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const _StepTitle(2, 'GST number or PAN'),
                _field(
                  _gstin,
                  'GST number (if you have one)',
                  upper: true,
                  maxLength: 15,
                  helper: 'Your PAN is part of it, so we fill it in for you.',
                  validator: (v) {
                    final t = (v ?? '').trim();
                    if (t.isEmpty || isValidGstin(t)) return null;
                    return "This GST number doesn't look right. Please check it.";
                  },
                ),
                if (panFromGst != null)
                  _field(
                    _panShown,
                    'PAN',
                    readOnly: true,
                    helper: 'Taken from your GST number',
                  )
                else
                  _field(
                    _pan,
                    'PAN *',
                    upper: true,
                    maxLength: 10,
                    validator: (v) => isValidPan(v ?? '')
                        ? null
                        : 'Enter your PAN, like ABCPK1234L. Or enter your GST number.',
                  ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _error!,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: Colors.red.shade700,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _saving || !_wasComplete ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Save details'),
                  ),
                ),
                if (!_wasComplete && !_saving) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Fill in all fields marked * to save.',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  'Only you and our verification team can see these details. '
                  'They are used only to send your order money through '
                  'Razorpay, an RBI-regulated payment company.',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController c,
    String label, {
    String? Function(String?)? validator,
    TextInputType? keyboard,
    bool digitsOnly = false,
    bool upper = false,
    bool readOnly = false,
    int? maxLength,
    String? helper,
    String? errorText,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: c,
        validator: validator,
        keyboardType: keyboard,
        maxLength: maxLength,
        readOnly: readOnly,
        textCapitalization: upper
            ? TextCapitalization.characters
            : TextCapitalization.words,
        inputFormatters: [
          if (digitsOnly) FilteringTextInputFormatter.digitsOnly,
          if (upper) UpperCaseTextFormatter(),
        ],
        decoration: InputDecoration(
          labelText: label,
          helperText: helper,
          helperMaxLines: 2,
          errorText: errorText,
          counterText: '',
          filled: true,
          fillColor: readOnly ? AppColors.surfaceVariant : Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}

class _StepTitle extends StatelessWidget {
  final int n;
  final String title;
  const _StepTitle(this.n, this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          CircleAvatar(
            radius: 10,
            backgroundColor: AppColors.primary,
            child: Text(
              '$n',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            title,
            style: AppTextStyles.bodyMedium.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Upper-cases IFSC and PAN as they are typed, so what the seller sees is
/// exactly what gets validated and saved.
class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}

// ─── Shared bits ────────────────────────────────────────────────────────────

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;
  const _StatTile({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: AppTextStyles.heading2.copyWith(
                color: highlight ? AppColors.primary : AppColors.onSurface,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineNotice extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  const _InlineNotice({
    required this.icon,
    required this.color,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTextStyles.bodySmall.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}

class _EarningsSkeleton extends StatelessWidget {
  const _EarningsSkeleton();

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.9,
      children: List.generate(
        4,
        (_) => Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.divider),
          ),
        ),
      ),
    );
  }
}

// ─── KYC documents ──────────────────────────────────────────────────────────

/// One document the seller has to provide.
///
/// The required set matches what Razorpay asks for on an individual or
/// proprietor linked account. GST is optional because a small seller may not
/// be registered.
class _DocSpec {
  final String type;
  final String label;
  final String hint;
  final bool required;

  /// A face photo rather than a document: defaults the camera to
  /// front-facing, since a seller photographing their own face with the rear
  /// camera is an awkward ask.
  final bool selfie;

  /// Shown immediately vs. tucked behind "More documents" — six upload rows
  /// at once tends to stall a seller out; leading with the two that
  /// establish who they are keeps the first screen short. The rest are
  /// still required, just not part of the opening ask.
  final bool front;

  const _DocSpec(
    this.type,
    this.label,
    this.hint, {
    this.required = true,
    this.selfie = false,
    this.front = false,
  });
}

/// One required upload: the licence to sell agri inputs. Bank, PAN and GST
/// are typed in the form and checked by Razorpay, so the other documents are
/// optional now; they stay listed so anything already sent is still visible,
/// and a seller can add one if our team asks. Same list as the website's
/// app/dashboard/_components/kyc-documents.tsx.
const _kDocSpecs = [
  _DocSpec(
    'trade_license',
    'Licence to sell',
    'Photo of your fertiliser, seed or pesticide licence, or shop licence',
    front: true,
  ),
  _DocSpec(
    'gst_certificate',
    'GST certificate',
    'If you have GST',
    required: false,
  ),
  _DocSpec(
    'pan_card',
    'PAN card',
    'Only if our team asks for it',
    required: false,
  ),
  _DocSpec(
    'cancelled_cheque',
    'Cancelled cheque or passbook',
    'Only if our team asks for it',
    required: false,
  ),
  _DocSpec(
    'address_proof',
    'Address proof',
    'Only if our team asks for it',
    required: false,
  ),
  _DocSpec(
    'owner_photo',
    'Owner photo',
    'Only if our team asks for it',
    required: false,
    selfie: true,
  ),
];

class _KycSection extends ConsumerStatefulWidget {
  final PayoutAccountModel? account;
  const _KycSection({required this.account});

  @override
  ConsumerState<_KycSection> createState() => _KycSectionState();
}

class _KycSectionState extends ConsumerState<_KycSection> {
  String? _busyType;
  String? _error;

  Map<String, Map<String, dynamic>> get _docs =>
      widget.account?.documents ?? const {};

  /// Locked once an admin has verified the account — swapping the evidence
  /// behind an approved payout account should go through support, not a
  /// silent re-upload.
  bool get _locked => widget.account?.isVerified ?? false;

  Future<void> _upload(_DocSpec spec) async {
    // Camera first: on a phone, photographing the document in front of you is
    // the natural path, and it is the reason this is better on mobile than on
    // the web form.
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    setState(() {
      _busyType = spec.type;
      _error = null;
    });
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        // Documents only need to be legible, not full resolution — this keeps
        // uploads under the 5 MB cap on a slow rural connection.
        imageQuality: 80,
        maxWidth: 2000,
        preferredCameraDevice: spec.selfie
            ? CameraDevice.front
            : CameraDevice.rear,
      );
      if (picked == null) {
        if (mounted) setState(() => _busyType = null);
        return;
      }
      await ref
          .read(payoutRepoProvider)
          .uploadDocument(docType: spec.type, file: File(picked.path));
      ref.invalidate(payoutAccountProvider);
      if (mounted) setState(() => _busyType = null);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not upload ${spec.label}. $e';
          _busyType = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final missing = _kDocSpecs
        .where((s) => s.required && !_docs.containsKey(s.type))
        .length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepTitle(3, 'Licence'),
        Text(
          'A clear photo is enough. Only you and our verification team can '
          'see it.',
          style: AppTextStyles.bodySmall.copyWith(
            color: AppColors.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 12),
        if (missing > 0 && !_locked)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _InlineNotice(
              icon: Icons.description_outlined,
              color: Colors.orange.shade800,
              text: 'Please upload your licence.',
            ),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _InlineNotice(
              icon: Icons.error_outline,
              color: Colors.red.shade700,
              text: _error!,
            ),
          ),
        ..._kDocSpecs
            .where((s) => s.front)
            .map(
              (spec) => _DocTile(
                spec: spec,
                uploaded: _docs[spec.type],
                busy: _busyType == spec.type,
                locked: _locked,
                onUpload: () => _upload(spec),
              ),
            ),
        _MoreDocuments(
          // Expanded by default once verified — nothing left to fill in, and
          // a seller checking their own file wants to see all of it at once.
          initiallyOpen: _locked,
          children: _kDocSpecs
              .where((s) => !s.front)
              .map(
                (spec) => _DocTile(
                  spec: spec,
                  uploaded: _docs[spec.type],
                  busy: _busyType == spec.type,
                  locked: _locked,
                  onUpload: () => _upload(spec),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

/// Collapsed by default so the opening ask is two uploads, not six.
class _MoreDocuments extends StatefulWidget {
  final bool initiallyOpen;
  final List<Widget> children;
  const _MoreDocuments({required this.initiallyOpen, required this.children});

  @override
  State<_MoreDocuments> createState() => _MoreDocumentsState();
}

class _MoreDocumentsState extends State<_MoreDocuments> {
  late bool _open = widget.initiallyOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Other documents (optional)',
                      style: AppTextStyles.bodyMedium.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Icon(
                    _open ? Icons.expand_less : Icons.expand_more,
                    color: AppColors.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
          if (_open)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(children: widget.children),
            ),
        ],
      ),
    );
  }
}

class _DocTile extends StatelessWidget {
  final _DocSpec spec;
  final Map<String, dynamic>? uploaded;
  final bool busy;
  final bool locked;
  final VoidCallback onUpload;

  const _DocTile({
    required this.spec,
    required this.uploaded,
    required this.busy,
    required this.locked,
    required this.onUpload,
  });

  @override
  Widget build(BuildContext context) {
    final done = uploaded != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Icon(
            done ? Icons.check_circle : Icons.upload_file_outlined,
            size: 22,
            color: done ? Colors.green.shade700 : AppColors.onSurfaceVariant,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        spec.label,
                        style: AppTextStyles.bodyMedium.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (!spec.required)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Text(
                          'Optional',
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  done
                      ? (uploaded!['fileName'] as String? ?? 'Uploaded')
                      : spec.hint,
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (busy)
            const SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else if (!locked)
            TextButton(
              onPressed: onUpload,
              child: Text(done ? 'Replace' : 'Upload'),
            ),
        ],
      ),
    );
  }
}
