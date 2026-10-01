import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/payout_account_model.dart';
import '../../../core/utils/currency_utils.dart';
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
        if (earnings.nextReleaseOn != null) ...[
          const SizedBox(height: 10),
          _InlineNotice(
            icon: Icons.schedule,
            color: Colors.blue.shade700,
            text: 'Next release on '
                '${DateFormat('d MMM yyyy').format(earnings.nextReleaseOn!)}.',
          ),
        ],
        const SizedBox(height: 20),
        Text('Order by order', style: AppTextStyles.heading3),
        const SizedBox(height: 8),
        ...earnings.rows.take(50).map((r) => _EarningRow(row: r)),
      ],
    );
  }
}

class _EarningRow extends StatelessWidget {
  final SellerEarningsRow row;
  const _EarningRow({required this.row});

  ({String label, Color color}) get _badge => switch (row.state) {
        PayoutState.due => (label: 'Ready', color: AppColors.primary),
        PayoutState.onHold => (label: 'On hold', color: Colors.orange.shade800),
        PayoutState.awaitingDelivery =>
          (label: 'Not delivered', color: AppColors.onSurfaceVariant),
        PayoutState.transferred => (label: 'Paid', color: Colors.green.shade700),
        PayoutState.notPayable =>
          (label: 'Not payable', color: AppColors.onSurfaceVariant),
      };

  @override
  Widget build(BuildContext context) {
    final badge = _badge;
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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('#${row.orderId}',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.onSurfaceVariant),
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(
                  CurrencyUtils.format(row.net),
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.w600),
                ),
                // Only shown when a real fee is known — never an invented one.
                if (row.gatewayFee > 0)
                  Text(
                    '${CurrencyUtils.format(row.gross)} less '
                    '${CurrencyUtils.format(row.gatewayFee)} gateway fee',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.onSurfaceVariant),
                  ),
                if (row.state == PayoutState.onHold && row.releaseOn != null)
                  Text(
                    'Releases ${DateFormat('d MMM').format(row.releaseOn!)}',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.onSurfaceVariant),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: badge.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              badge.label,
              style: AppTextStyles.bodySmall.copyWith(
                color: badge.color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
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
          Row(children: [
            Icon(Icons.info_outline, size: 18, color: Colors.blue.shade700),
            const SizedBox(width: 8),
            Text('How you get paid',
                style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w700, color: Colors.blue.shade900)),
          ]),
          const SizedBox(height: 8),
          // Wording deliberately matches the web page and the /sell promise —
          // a seller must not read two different commission claims.
          ..._points.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('•  $t',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: Colors.blue.shade900)),
              )),
        ],
      ),
    );
  }

  static const _points = [
    'Money is released $kPayoutHoldDays days after you mark an order Delivered '
        '— that covers the customer\'s refund window.',
    'KrishiDukan commission is ₹0. We take no cut.',
    'Only the payment gateway\'s own charge is deducted.',
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
        Text('Bank account', style: AppTextStyles.heading3),
        const SizedBox(height: 4),
        Text(
          'Where your order money is sent.',
          style: AppTextStyles.bodySmall
              .copyWith(color: AppColors.onSurfaceVariant),
        ),
        const SizedBox(height: 12),
        if (a == null)
          _InlineNotice(
            icon: Icons.account_balance_outlined,
            color: Colors.orange.shade800,
            text: 'No bank account added yet. We cannot send you money until '
                'you add one.',
          )
        else
          _SavedAccountCard(account: a),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () => _openForm(context, ref),
            icon: Icon(a == null ? Icons.add : Icons.edit_outlined, size: 18),
            label: Text(a == null ? 'Add bank account' : 'Change bank account'),
          ),
        ),
        const SizedBox(height: 24),
        _KycSection(account: a),
      ],
    );
  }

  Future<void> _openForm(BuildContext context, WidgetRef ref) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _BankAccountForm(),
    );
    if (saved == true) ref.invalidate(payoutAccountProvider);
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
                child: Text(account.accountHolderName,
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w600)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(label,
                    style: AppTextStyles.bodySmall.copyWith(
                        color: color, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // Never the full number: a shared or shoulder-surfed screen must not
          // expose a complete bank account.
          Text('••••${account.accountLast4}  ·  ${account.ifsc}',
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant)),
          if (account.bankName != null)
            Text(account.bankName!,
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurfaceVariant)),
          if (account.isRejected && account.rejectionReason != null) ...[
            const SizedBox(height: 8),
            Text(account.rejectionReason!,
                style: AppTextStyles.bodySmall
                    .copyWith(color: Colors.red.shade700)),
          ],
        ],
      ),
    );
  }
}

/// Bank details form. Validation rules are copied exactly from the web page so
/// the same input is accepted or rejected identically on both platforms.
class _BankAccountForm extends ConsumerStatefulWidget {
  const _BankAccountForm();

  @override
  ConsumerState<_BankAccountForm> createState() => _BankAccountFormState();
}

class _BankAccountFormState extends ConsumerState<_BankAccountForm> {
  /// RBI IFSC format: 4 letters, a literal 0, then 6 alphanumerics.
  static final _ifscRe = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');

  /// Indian account numbers run 9–18 digits depending on the bank.
  static final _accountRe = RegExp(r'^\d{9,18}$');
  static final _panRe = RegExp(r'^[A-Z]{5}\d{4}[A-Z]$');
  static final _upiRe = RegExp(r'^[\w.\-]{2,}@[a-zA-Z]{2,}$');

  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _number = TextEditingController();
  final _confirm = TextEditingController();
  final _ifsc = TextEditingController();
  final _bank = TextEditingController();
  final _upi = TextEditingController();
  final _pan = TextEditingController();
  String _type = 'savings';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _number, _confirm, _ifsc, _bank, _upi, _pan]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(payoutRepoProvider).save(
            accountHolderName: _name.text,
            accountNumber: _number.text,
            ifsc: _ifsc.text,
            accountType: _type,
            bankName: _bank.text,
            upiId: _upi.text,
            pan: _pan.text,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not save your bank account. $e';
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Bank account', style: AppTextStyles.heading3),
                const SizedBox(height: 4),
                Text(
                  'Enter the details exactly as they appear on your bank '
                  'account. Anything you change here has to be verified again '
                  'before your next payout.',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.onSurfaceVariant),
                ),
                const SizedBox(height: 16),
                _field(
                  _name,
                  'Account holder name',
                  validator: (v) => (v ?? '').trim().isEmpty
                      ? 'Enter the name exactly as it appears on the bank account.'
                      : null,
                ),
                _field(
                  _number,
                  'Account number',
                  keyboard: TextInputType.number,
                  digitsOnly: true,
                  maxLength: 18,
                  validator: (v) => _accountRe.hasMatch((v ?? '').trim())
                      ? null
                      : 'Account number must be 9–18 digits, no spaces.',
                ),
                _field(
                  _confirm,
                  'Confirm account number',
                  keyboard: TextInputType.number,
                  digitsOnly: true,
                  maxLength: 18,
                  // Retyped rather than prefilled, so a mistyped digit can't
                  // hide behind a copy of itself.
                  validator: (v) => (v ?? '').trim() == _number.text.trim()
                      ? null
                      : 'The two account numbers do not match.',
                ),
                _field(
                  _ifsc,
                  'IFSC code',
                  upper: true,
                  maxLength: 11,
                  validator: (v) =>
                      _ifscRe.hasMatch((v ?? '').trim().toUpperCase())
                          ? null
                          : 'IFSC looks wrong — it should be like SBIN0001234.',
                ),
                _field(_bank, 'Bank name (optional)'),
                const SizedBox(height: 4),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'savings', label: Text('Savings')),
                    ButtonSegment(value: 'current', label: Text('Current')),
                  ],
                  selected: {_type},
                  onSelectionChanged: (s) => setState(() => _type = s.first),
                ),
                const SizedBox(height: 12),
                _field(
                  _upi,
                  'UPI ID (optional)',
                  validator: (v) {
                    final t = (v ?? '').trim();
                    if (t.isEmpty) return null;
                    return _upiRe.hasMatch(t)
                        ? null
                        : 'UPI ID should look like name@bank.';
                  },
                ),
                _field(
                  _pan,
                  'PAN (optional)',
                  upper: true,
                  maxLength: 10,
                  validator: (v) {
                    final t = (v ?? '').trim().toUpperCase();
                    if (t.isEmpty) return null;
                    return _panRe.hasMatch(t)
                        ? null
                        : 'PAN should look like ABCDE1234F.';
                  },
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!,
                      style: AppTextStyles.bodySmall
                          .copyWith(color: Colors.red.shade700)),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Save bank account'),
                  ),
                ),
                const SizedBox(height: 8),
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
    int? maxLength,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: c,
        validator: validator,
        keyboardType: keyboard,
        maxLength: maxLength,
        textCapitalization:
            upper ? TextCapitalization.characters : TextCapitalization.words,
        inputFormatters: [
          if (digitsOnly) FilteringTextInputFormatter.digitsOnly,
          if (upper) UpperCaseTextFormatter(),
        ],
        decoration: InputDecoration(
          labelText: label,
          counterText: '',
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}

/// Upper-cases IFSC and PAN as they are typed, so what the seller sees is
/// exactly what gets validated and saved.
class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
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
                  color: highlight ? AppColors.primary : AppColors.onSurface),
            ),
          ),
          const SizedBox(height: 2),
          Text(label,
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant)),
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
            child: Text(text,
                style: AppTextStyles.bodySmall.copyWith(color: color)),
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

  const _DocSpec(this.type, this.label, this.hint,
      {this.required = true, this.selfie = false, this.front = false});
}

const _kDocSpecs = [
  _DocSpec(
      'pan_card', 'PAN card', 'Photo of the PAN card matching the account holder name',
      front: true),
  _DocSpec('trade_license', 'Trade / product license',
      'Shop establishment, FSSAI, mandi, or other license permitting you to '
      'sell agri produce or inputs',
      front: true),
  _DocSpec('cancelled_cheque', 'Cancelled cheque or passbook',
      'Must clearly show account number, IFSC and holder name'),
  _DocSpec('address_proof', 'Address proof',
      'Aadhaar, electricity bill or shop licence'),
  _DocSpec('owner_photo', 'Owner photo',
      "A clear photo of the account holder's face, for identity verification",
      selfie: true),
  _DocSpec('gst_certificate', 'GST certificate',
      'Only if your business is GST registered', required: false),
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
      await ref.read(payoutRepoProvider).uploadDocument(
            docType: spec.type,
            file: File(picked.path),
          );
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
    final missing =
        _kDocSpecs.where((s) => s.required && !_docs.containsKey(s.type)).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Verification documents', style: AppTextStyles.heading3),
        const SizedBox(height: 4),
        Text(
          'We need these on file before money can be sent to your account. '
          'Only you and our verification team can see them.',
          style: AppTextStyles.bodySmall
              .copyWith(color: AppColors.onSurfaceVariant),
        ),
        const SizedBox(height: 12),
        if (missing > 0 && !_locked)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _InlineNotice(
              icon: Icons.description_outlined,
              color: Colors.orange.shade800,
              text: '$missing required '
                  '${missing == 1 ? 'document' : 'documents'} still needed.',
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
        ..._kDocSpecs.where((s) => s.front).map((spec) => _DocTile(
              spec: spec,
              uploaded: _docs[spec.type],
              busy: _busyType == spec.type,
              locked: _locked,
              onUpload: () => _upload(spec),
            )),
        _MoreDocuments(
          // Expanded by default once verified — nothing left to fill in, and
          // a seller checking their own file wants to see all of it at once.
          initiallyOpen: _locked,
          children: _kDocSpecs
              .where((s) => !s.front)
              .map((spec) => _DocTile(
                    spec: spec,
                    uploaded: _docs[spec.type],
                    busy: _busyType == spec.type,
                    locked: _locked,
                    onUpload: () => _upload(spec),
                  ))
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
                    child: Text('More documents',
                        style: AppTextStyles.bodyMedium
                            .copyWith(fontWeight: FontWeight.w600)),
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
                        style: AppTextStyles.bodyMedium
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    if (!spec.required)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Text('Optional',
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.onSurfaceVariant)),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  done
                      ? (uploaded!['fileName'] as String? ?? 'Uploaded')
                      : spec.hint,
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.onSurfaceVariant),
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
