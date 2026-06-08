import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/network_retailer_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/phone_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../data/manufacturer_repository.dart';
import '../providers/manufacturer_provider.dart';

class RetailerNetworkScreen extends ConsumerWidget {
  const RetailerNetworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) =>
          const Scaffold(body: ErrorView(message: 'Not logged in.')),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: ErrorView(message: 'Not logged in.'));
        }
        return _NetworkBody(
            manufacturerPhone: user.phone, manufacturerName: user.name);
      },
    );
  }
}

class _NetworkBody extends ConsumerWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  const _NetworkBody(
      {required this.manufacturerPhone, required this.manufacturerName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final networkAsync =
        ref.watch(retailerNetworkProvider(manufacturerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Retailer Network',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add, color: Colors.white),
            onPressed: () => _showAddSheet(context),
          ),
        ],
      ),
      body: networkAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (_, _) =>
            const ErrorView(message: 'Could not load network.'),
        data: (retailers) {
          if (retailers.isEmpty) {
            return EmptyState(
              title: 'No retailers yet',
              subtitle: 'Add retailers to start assigning products',
              icon: Icons.group_outlined,
              actionLabel: 'Add Retailer',
              onAction: () => _showAddSheet(context),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: retailers.length,
            itemBuilder: (_, i) => _RetailerTile(
              retailer: retailers[i],
              manufacturerPhone: manufacturerPhone,
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddSheet(context),
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.person_add, color: Colors.white),
      ),
    );
  }

  void _showAddSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddRetailerSheet(
        manufacturerPhone: manufacturerPhone,
        manufacturerName: manufacturerName,
      ),
    );
  }
}

class _RetailerTile extends StatelessWidget {
  final NetworkRetailerModel retailer;
  final String manufacturerPhone;
  const _RetailerTile(
      {required this.retailer, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (retailer.status) {
      'active' => AppColors.success,
      'invited' => AppColors.secondary,
      _ => AppColors.onSurfaceVariant,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(retailer.shopName,
                          style: AppTextStyles.bodyMedium),
                      Text(retailer.ownerName,
                          style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.onSurfaceVariant)),
                      if (retailer.city != null)
                        Text(
                          [retailer.city, retailer.state]
                              .whereType<String>()
                              .join(', '),
                          style: AppTextStyles.caption,
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: statusColor.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    retailer.status[0].toUpperCase() +
                        retailer.status.substring(1),
                    style: AppTextStyles.caption.copyWith(
                        color: statusColor,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            if (retailer.isInvited && retailer.inviteCode.isNotEmpty) ...[
              const SizedBox(height: 8),
              InkWell(
                onTap: () {
                  Clipboard.setData(
                      ClipboardData(text: retailer.inviteCode));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('Invite code copied'),
                        backgroundColor: AppColors.primary),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.secondaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.key_outlined,
                          size: 14, color: AppColors.secondary),
                      const SizedBox(width: 6),
                      Text('Code: ${retailer.inviteCode}',
                          style: AppTextStyles.bodyMedium.copyWith(
                              fontFamily: 'monospace')),
                      const SizedBox(width: 6),
                      const Icon(Icons.copy,
                          size: 14,
                          color: AppColors.onSurfaceVariant),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (retailer.isActive)
                  TextButton(
                    onPressed: () => _confirm(
                      context,
                      'Deactivate ${retailer.shopName}?',
                      () => ManufacturerRepository()
                          .updateRetailerStatus(
                              retailer.phone, 'revoked'),
                    ),
                    child: const Text('Deactivate',
                        style: TextStyle(color: AppColors.error)),
                  )
                else if (retailer.status == 'revoked')
                  TextButton(
                    onPressed: () => ManufacturerRepository()
                        .updateRetailerStatus(
                            retailer.phone, 'active'),
                    child: const Text('Reactivate'),
                  ),
                TextButton(
                  onPressed: () => _confirm(
                    context,
                    'Remove ${retailer.shopName} from network?',
                    () => ManufacturerRepository()
                        .removeRetailer(retailer.phone),
                  ),
                  child: const Text('Remove',
                      style: TextStyle(color: AppColors.error)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _confirm(
      BuildContext context, String msg, VoidCallback onConfirm) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm'),
        content: Text(msg),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.error),
            onPressed: () {
              Navigator.pop(ctx);
              onConfirm();
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }
}

// ── Add Retailer Sheet ────────────────────────────────────────────────────────

class _AddRetailerSheet extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  const _AddRetailerSheet(
      {required this.manufacturerPhone, required this.manufacturerName});

  @override
  State<_AddRetailerSheet> createState() => _AddRetailerSheetState();
}

class _AddRetailerSheetState extends State<_AddRetailerSheet> {
  final _shopNameCtrl = TextEditingController();
  final _ownerNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  bool _saving = false;
  String? _inviteCode;

  @override
  void dispose() {
    _shopNameCtrl.dispose();
    _ownerNameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: _inviteCode != null
          ? _SuccessView(
              inviteCode: _inviteCode!,
              onDone: () => Navigator.pop(context),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Add Retailer', style: AppTextStyles.heading2),
                const SizedBox(height: 16),
                TextField(
                  controller: _shopNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Shop Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _ownerNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Owner Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Phone Number *',
                    border: OutlineInputBorder(),
                    prefixText: '+91 ',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email (for invite)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _cityCtrl,
                        decoration: const InputDecoration(
                          labelText: 'City',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _stateCtrl,
                        decoration: const InputDecoration(
                          labelText: 'State',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _saving ? null : _save,
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary),
                    child: _saving
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white))
                        : const Text('Add & Send Invite'),
                  ),
                ),
              ],
            ),
    );
  }

  Future<void> _save() async {
    final shop = _shopNameCtrl.text.trim();
    final owner = _ownerNameCtrl.text.trim();
    final rawPhone = _phoneCtrl.text.trim();
    if (shop.isEmpty || owner.isEmpty || rawPhone.isEmpty) return;

    final phone = PhoneUtils.normalize(rawPhone);
    if (!PhoneUtils.isValid(phone)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid phone number')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final code = await ManufacturerRepository().addRetailer(
        manufacturerPhone: widget.manufacturerPhone,
        manufacturerName: widget.manufacturerName,
        shopName: shop,
        ownerName: owner,
        retailerPhone: phone,
        email: _emailCtrl.text.trim().isNotEmpty
            ? _emailCtrl.text.trim()
            : null,
        city: _cityCtrl.text.trim().isNotEmpty
            ? _cityCtrl.text.trim()
            : null,
        state: _stateCtrl.text.trim().isNotEmpty
            ? _stateCtrl.text.trim()
            : null,
      );
      if (mounted) setState(() => _inviteCode = code);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _SuccessView extends StatelessWidget {
  final String inviteCode;
  final VoidCallback onDone;
  const _SuccessView({required this.inviteCode, required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.check_circle, color: AppColors.success, size: 64),
        const SizedBox(height: 12),
        Text('Retailer Added!', style: AppTextStyles.heading2),
        const SizedBox(height: 8),
        const Text('Share this invite code with the retailer:',
            textAlign: TextAlign.center),
        const SizedBox(height: 16),
        GestureDetector(
          onTap: () {
            Clipboard.setData(ClipboardData(text: inviteCode));
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                  content: Text('Copied!'),
                  backgroundColor: AppColors.primary),
            );
          },
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 24, vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.primary),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  inviteCode,
                  style: AppTextStyles.heading2.copyWith(
                    letterSpacing: 4,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 10),
                const Icon(Icons.copy,
                    color: AppColors.primary, size: 20),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: onDone,
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary),
            child: const Text('Done'),
          ),
        ),
      ],
    );
  }
}
