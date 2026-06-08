import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:go_router/go_router.dart';
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
            onPressed: () => _showAddSheet(context, ref),
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
              onAction: () => _showAddSheet(context, ref),
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
        onPressed: () => _showAddSheet(context, ref),
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.person_add, color: Colors.white),
      ),
    );
  }

  void _showAddSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddRetailerSheet(
        manufacturerPhone: manufacturerPhone,
        manufacturerName: manufacturerName,
        onAdded: () => ref.invalidate(retailerNetworkProvider(manufacturerPhone)),
      ),
    );
  }
}

class _RetailerTile extends ConsumerWidget {
  final NetworkRetailerModel retailer;
  final String manufacturerPhone;
  const _RetailerTile(
      {required this.retailer, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusColor = switch (retailer.status) {
      'active' => AppColors.success,
      'invited' => AppColors.secondary,
      _ => AppColors.onSurfaceVariant,
    };

    final addedDateStr = retailer.createdAt != null
        ? DateFormat('MMM d, y, h:mm a').format(retailer.createdAt!)
        : '—';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
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
                          style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(height: 2),
                      Text('Owner: ${retailer.ownerName}',
                          style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.onSurfaceVariant)),
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
            const Divider(height: 20),
            Row(
              children: [
                const Icon(Icons.phone_outlined, size: 16, color: AppColors.onSurfaceVariant),
                const SizedBox(width: 8),
                Text(retailer.phone, style: AppTextStyles.bodyMedium),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.phone, size: 18, color: AppColors.primary),
                  onPressed: () => launchUrl(Uri.parse('tel:${retailer.phone}')),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            if (retailer.email != null && retailer.email!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.email_outlined, size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Text(retailer.email!, style: AppTextStyles.bodyMedium),
                ],
              ),
            ],
            if (retailer.city != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Text(
                    [retailer.city, retailer.state]
                        .whereType<String>()
                        .join(', '),
                    style: AppTextStyles.bodyMedium,
                  ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.calendar_month_outlined, size: 16, color: AppColors.onSurfaceVariant),
                const SizedBox(width: 8),
                Text('Added: $addedDateStr', style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
              ],
            ),
            if (retailer.isInvited && retailer.inviteCode.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.secondaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.secondary.withValues(alpha: 0.2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.key_outlined, size: 16, color: AppColors.secondary),
                        const SizedBox(width: 6),
                        Text('Invite Code: ${retailer.inviteCode}',
                            style: AppTextStyles.bodyMedium.copyWith(
                                fontFamily: 'monospace', fontWeight: FontWeight.bold)),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.copy, size: 16),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: retailer.inviteCode));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Invite code copied')),
                            );
                          },
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text('Invite Actions:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        ElevatedButton.icon(
                          onPressed: () => _copyInviteLink(context),
                          icon: const Icon(Icons.link, size: 14),
                          label: const Text('Copy link', style: TextStyle(fontSize: 11)),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () => _shareOnWhatsApp(context),
                          icon: const Icon(Icons.share, size: 14),
                          label: const Text('WhatsApp', style: TextStyle(fontSize: 11)),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () => _shareViaEmail(context),
                          icon: const Icon(Icons.email, size: 14),
                          label: const Text('Email', style: TextStyle(fontSize: 11)),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (retailer.status == 'active' && retailer.onboardingStatus == 'active')
                  FilledButton.icon(
                    onPressed: () => context.push(
                      '/dashboard/manufacturer/assign?retailerPhone=${retailer.phone}',
                    ),
                    icon: const Icon(Icons.assignment_outlined, size: 16),
                    label: const Text('Assign Product'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    ),
                  ),
                const SizedBox(width: 8),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert),
                  onSelected: (val) => _handleMenuAction(context, val, ref),
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: 'details',
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, size: 18),
                          SizedBox(width: 8),
                          Text('Details'),
                        ],
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'edit',
                      child: Row(
                        children: [
                          Icon(Icons.edit_outlined, size: 18),
                          SizedBox(width: 8),
                          Text('Edit'),
                        ],
                      ),
                    ),
                    if (retailer.status == 'active' && retailer.onboardingStatus == 'active')
                      const PopupMenuItem(
                        value: 'deactivate',
                        child: Row(
                          children: [
                            Icon(Icons.block, size: 18, color: AppColors.error),
                            SizedBox(width: 8),
                            Text('Deactivate', style: TextStyle(color: AppColors.error)),
                          ],
                        ),
                      )
                    else if (retailer.status == 'active' && retailer.onboardingStatus == 'inactive')
                      const PopupMenuItem(
                        value: 'reactivate',
                        child: Row(
                          children: [
                            Icon(Icons.check_circle_outline, size: 18, color: AppColors.success),
                            SizedBox(width: 8),
                            Text('Reactivate', style: TextStyle(color: AppColors.success)),
                          ],
                        ),
                      ),
                    const PopupMenuItem(
                      value: 'remove',
                      child: Row(
                        children: [
                          Icon(Icons.delete_outline, size: 18, color: AppColors.error),
                          SizedBox(width: 8),
                          Text('Remove', style: TextStyle(color: AppColors.error)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _handleMenuAction(BuildContext context, String action, WidgetRef ref) {
    final uid = ref.read(currentUserProvider).valueOrNull?.uid ?? '';
    switch (action) {
      case 'details':
        _showDetailsDialog(context);
        break;
      case 'edit':
        _showEditSheet(context, ref);
        break;
      case 'deactivate':
        _confirm(
          context,
          'Deactivate ${retailer.shopName}?',
          () async {
            await ManufacturerRepository().deactivateNetworkRetailer(
              inviteDocId: retailer.id,
              retailerDocId: retailer.phone,
              manufacturerId: uid,
              manufacturerPhone: manufacturerPhone,
            );
            ref.invalidate(retailerNetworkProvider(manufacturerPhone));
          },
        );
        break;
      case 'reactivate':
        _confirm(
          context,
          'Reactivate ${retailer.shopName}?',
          () async {
            await ManufacturerRepository().reactivateNetworkRetailer(
              inviteDocId: retailer.id,
              retailerDocId: retailer.phone,
              manufacturerPhone: manufacturerPhone,
            );
            ref.invalidate(retailerNetworkProvider(manufacturerPhone));
          },
        );
        break;
      case 'remove':
        _confirm(
          context,
          'Remove ${retailer.shopName} from network?',
          () async {
            await ManufacturerRepository().removeNetworkRetailer(
              inviteDocId: retailer.id,
              retailerDocId: retailer.phone,
              manufacturerId: uid,
              manufacturerPhone: manufacturerPhone,
            );
            ref.invalidate(retailerNetworkProvider(manufacturerPhone));
          },
        );
        break;
    }
  }

  void _showDetailsDialog(BuildContext context) {
    final addedDateStr = retailer.createdAt != null
        ? DateFormat('MMM d, y, h:mm a').format(retailer.createdAt!)
        : '—';
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(retailer.shopName, style: const TextStyle(fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _infoRow(Icons.person_outline, 'Owner Name', retailer.ownerName),
              _infoRow(Icons.phone_outlined, 'Phone', retailer.phone),
              if (retailer.email != null && retailer.email!.isNotEmpty)
                _infoRow(Icons.mail_outline, 'Email', retailer.email!),
              _infoRow(Icons.info_outline, 'Status', retailer.status.toUpperCase()),
              _infoRow(Icons.hourglass_empty, 'Onboarding Status', retailer.onboardingStatus.toUpperCase()),
              if (retailer.inviteCode.isNotEmpty)
                _infoRow(Icons.key_outlined, 'Invite Code', retailer.inviteCode),
              _infoRow(Icons.calendar_today_outlined, 'Added', addedDateStr),
              if (retailer.city != null)
                _infoRow(Icons.location_city_outlined, 'Address', '${retailer.city}, ${retailer.state ?? ""}'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12)),
                Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showEditSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _EditRetailerSheet(
        manufacturerPhone: manufacturerPhone,
        retailer: retailer,
        onUpdated: () => ref.invalidate(retailerNetworkProvider(manufacturerPhone)),
      ),
    );
  }

  Future<void> _shareOnWhatsApp(BuildContext context) async {
    final inviteLink = 'https://krishidukan.com/signup?inviteCode=${retailer.inviteCode}';
    final msg = 'Hey! I invite you to join my retailer network on Krishi Dukaan. '
        'Use my invite code: ${retailer.inviteCode} or sign up using this link: $inviteLink';
    final url = Uri.parse("https://wa.me/?text=${Uri.encodeComponent(msg)}");
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not launch WhatsApp')),
        );
      }
    }
  }

  Future<void> _shareViaEmail(BuildContext context) async {
    final inviteLink = 'https://krishidukan.com/signup?inviteCode=${retailer.inviteCode}';
    final subject = 'Invitation to join Krishi Dukaan Retailer Network';
    final body = 'Hey!\n\nI invite you to join my retailer network on Krishi Dukaan.\n\n'
        'Use my invite code: ${retailer.inviteCode} or sign up using this link:\n$inviteLink';
    final url = Uri.parse("mailto:?subject=${Uri.encodeComponent(subject)}&body=${Uri.encodeComponent(body)}");
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not launch Email client')),
        );
      }
    }
  }

  void _copyInviteLink(BuildContext context) {
    final inviteLink = 'https://krishidukan.com/signup?inviteCode=${retailer.inviteCode}';
    Clipboard.setData(ClipboardData(text: inviteLink));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Invite link copied!'),
        backgroundColor: AppColors.primary,
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

class _EditRetailerSheet extends StatefulWidget {
  final String manufacturerPhone;
  final NetworkRetailerModel retailer;
  final VoidCallback onUpdated;
  const _EditRetailerSheet({
    required this.manufacturerPhone,
    required this.retailer,
    required this.onUpdated,
  });

  @override
  State<_EditRetailerSheet> createState() => _EditRetailerSheetState();
}

class _EditRetailerSheetState extends State<_EditRetailerSheet> {
  late final _shopNameCtrl = TextEditingController(text: widget.retailer.shopName);
  late final _ownerNameCtrl = TextEditingController(text: widget.retailer.ownerName);
  late final _phoneCtrl = TextEditingController(text: PhoneUtils.toDisplay(widget.retailer.phone));
  late final _emailCtrl = TextEditingController(text: widget.retailer.email ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _shopNameCtrl.dispose();
    _ownerNameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Edit Retailer', style: AppTextStyles.heading2),
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
              labelText: 'Email',
              border: OutlineInputBorder(),
            ),
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
                  : const Text('Save Changes'),
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
      await ManufacturerRepository().updateNetworkRetailer(
        inviteDocId: widget.retailer.id,
        retailerDocId: widget.retailer.phone,
        shopName: shop,
        ownerName: owner,
        phone: phone,
        email: _emailCtrl.text.trim(),
        manufacturerPhone: widget.manufacturerPhone,
      );
      widget.onUpdated();
      if (mounted) Navigator.pop(context);
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

class _AddRetailerSheet extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  final VoidCallback onAdded;
  const _AddRetailerSheet(
      {required this.manufacturerPhone, required this.manufacturerName, required this.onAdded});

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
      widget.onAdded();
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
