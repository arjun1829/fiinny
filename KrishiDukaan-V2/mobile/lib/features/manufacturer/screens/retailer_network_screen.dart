import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:go_router/go_router.dart';
import '../../../core/utils/web_links.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/network_retailer_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/services/places_service.dart';
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
      backgroundColor: Colors.transparent,
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
    final uid = ref.read(currentUserProvider).value?.uid ?? '';
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
    final inviteLink = WebLinks.invite(retailer.inviteCode);
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
    final inviteLink = WebLinks.invite(retailer.inviteCode);
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
    final inviteLink = WebLinks.invite(retailer.inviteCode);
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
            decoration: InputDecoration(
              labelText: 'Shop Name *',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _ownerNameCtrl,
            decoration: InputDecoration(
              labelText: 'Owner Name *',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'Phone Number *',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              prefixText: '+91 ',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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

// ─── Add Retailer Sheet ──────────────────────────────────────────────────────

class _AddRetailerSheet extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  final VoidCallback onAdded;
  const _AddRetailerSheet({
    required this.manufacturerPhone,
    required this.manufacturerName,
    required this.onAdded,
  });

  @override
  State<_AddRetailerSheet> createState() => _AddRetailerSheetState();
}

class _AddRetailerSheetState extends State<_AddRetailerSheet> {
  int _tab = 0; // 0 = New Retailer, 1 = Link Existing
  String? _inviteCode; // set after successful add

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.of(context).size.height;
    return Container(
      height: screenH * 0.92,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: _inviteCode != null
          ? _SuccessView(
              inviteCode: _inviteCode!,
              onDone: () => Navigator.pop(context),
            )
          : Column(
              children: [
                // Drag handle
                const SizedBox(height: 10),
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.divider,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                // Title + subtitle
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Add Retailer', style: AppTextStyles.heading2),
                      const SizedBox(height: 2),
                      Text(
                        'Creates a retailer profile and generates a signup invite link.',
                        style: AppTextStyles.bodySmall
                            .copyWith(color: AppColors.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                // Tab bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    children: [
                      _TabButton(
                        label: 'New Retailer',
                        selected: _tab == 0,
                        onTap: () => setState(() => _tab = 0),
                      ),
                      const SizedBox(width: 8),
                      _TabButton(
                        label: 'Link Existing',
                        selected: _tab == 1,
                        onTap: () => setState(() => _tab = 1),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                const Divider(height: 1),
                // Content
                Expanded(
                  child: _tab == 0
                      ? _NewRetailerForm(
                          manufacturerPhone: widget.manufacturerPhone,
                          manufacturerName: widget.manufacturerName,
                          onAdded: (code) {
                            widget.onAdded();
                            setState(() => _inviteCode = code);
                          },
                        )
                      : _LinkExistingForm(
                          manufacturerPhone: widget.manufacturerPhone,
                          manufacturerName: widget.manufacturerName,
                          onLinked: () {
                            widget.onAdded();
                            Navigator.pop(context);
                          },
                        ),
                ),
              ],
            ),
    );
  }
}

class _TabButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _TabButton(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary
              : AppColors.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: AppTextStyles.bodyMedium.copyWith(
            color: selected ? Colors.white : AppColors.primary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

// ─── New Retailer Form ────────────────────────────────────────────────────────

class _NewRetailerForm extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  final void Function(String inviteCode) onAdded;
  const _NewRetailerForm({
    required this.manufacturerPhone,
    required this.manufacturerName,
    required this.onAdded,
  });

  @override
  State<_NewRetailerForm> createState() => _NewRetailerFormState();
}

class _NewRetailerFormState extends State<_NewRetailerForm> {
  final _shopNameCtrl = TextEditingController();
  final _ownerNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _mapsSearchCtrl = TextEditingController();
  final _mapsLinkCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();

  bool _saving = false;
  bool _loadingSuggestions = false;
  bool _locating = false;
  bool _parsingLink = false;
  bool _showMapsLinkField = false;
  List<PlaceSuggestion> _suggestions = [];
  Timer? _debounce;

  @override
  void dispose() {
    _shopNameCtrl.dispose();
    _ownerNameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _mapsSearchCtrl.dispose();
    _mapsLinkCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _pincodeCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onMapsSearchChanged(String v) {
    _debounce?.cancel();
    if (v.trim().isEmpty) {
      setState(() => _suggestions = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      if (!mounted) return;
      setState(() => _loadingSuggestions = true);
      final results = await PlacesService.autocomplete(
          v, AppConfig.googleMapsApiKey);
      if (mounted) setState(() { _suggestions = results; _loadingSuggestions = false; });
    });
  }

  Future<void> _selectSuggestion(PlaceSuggestion s) async {
    setState(() {
      _mapsSearchCtrl.text = s.description;
      _suggestions = [];
      _loadingSuggestions = true;
    });
    final details = await PlacesService.getDetails(
        s.placeId, AppConfig.googleMapsApiKey);
    if (!mounted) return;
    if (details != null) {
      setState(() {
        if (_shopNameCtrl.text.isEmpty && details.name.isNotEmpty) {
          _shopNameCtrl.text = details.name;
        }
        if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
        if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
        if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
      });
    }
    setState(() => _loadingSuggestions = false);
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Location permission denied')),
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      final details = await PlacesService.reverseGeocode(
          pos.latitude, pos.longitude, AppConfig.googleMapsApiKey);
      if (mounted && details != null) {
        setState(() {
          if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
          if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
          if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
          _mapsSearchCtrl.text = details.formattedAddress ?? '';
          _suggestions = [];
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Location error: $e')));
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _parseMapsLink() async {
    final url = _mapsLinkCtrl.text.trim();
    if (url.isEmpty) return;
    setState(() => _parsingLink = true);
    try {
      ({double lat, double lng})? coords;
      if (url.contains('goo.gl') || url.contains('maps.app')) {
        coords = await PlacesService.resolveShortUrl(url);
      } else {
        coords = PlacesService.parseMapsUrl(url);
      }
      if (coords == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Could not parse location from that link')),
          );
        }
        return;
      }
      final details = await PlacesService.reverseGeocode(
          coords.lat, coords.lng, AppConfig.googleMapsApiKey);
      if (mounted && details != null) {
        setState(() {
          if (details.city?.isNotEmpty == true) _cityCtrl.text = details.city!;
          if (details.state?.isNotEmpty == true) _stateCtrl.text = details.state!;
          if (details.pincode?.isNotEmpty == true) _pincodeCtrl.text = details.pincode!;
          if (_shopNameCtrl.text.isEmpty && details.name.isNotEmpty) {
            _shopNameCtrl.text = details.name;
          }
          _mapsSearchCtrl.text = details.formattedAddress ?? '';
          _mapsLinkCtrl.clear();
          _showMapsLinkField = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _parsingLink = false);
    }
  }

  Future<void> _save() async {
    final shop = _shopNameCtrl.text.trim();
    final owner = _ownerNameCtrl.text.trim();
    final rawPhone = _phoneCtrl.text.trim();
    if (shop.isEmpty || owner.isEmpty || rawPhone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Shop name, owner name and phone are required')),
      );
      return;
    }
    final phone = PhoneUtils.normalize(rawPhone);
    if (!PhoneUtils.isValid(phone)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid 10-digit phone number')),
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
        email: _emailCtrl.text.trim().isNotEmpty ? _emailCtrl.text.trim() : null,
        city: _cityCtrl.text.trim().isNotEmpty ? _cityCtrl.text.trim() : null,
        state: _stateCtrl.text.trim().isNotEmpty ? _stateCtrl.text.trim() : null,
        pincode: _pincodeCtrl.text.trim().isNotEmpty ? _pincodeCtrl.text.trim() : null,
      );
      widget.onAdded(code);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, kb + 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Shop name
          TextField(
            controller: _shopNameCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Shop name *',
              hintText: 'Retailer shop name',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          // Owner name
          TextField(
            controller: _ownerNameCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Owner name *',
              hintText: 'Owner or contact person',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          // Phone
          TextField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'Phone *',
              hintText: '+91…',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              prefixText: '+91 ',
            ),
          ),
          const SizedBox(height: 16),
          // Email
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: 'Email (optional)',
              hintText: 'retailer@example.com',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 20),

          // ── Google Maps search section ──────────────────────────────────
          Row(
            children: [
              const Icon(Icons.location_on, size: 16, color: AppColors.primary),
              const SizedBox(width: 6),
              Text(
                'Search shop on Google Maps — auto-fills name & address',
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _mapsSearchCtrl,
            decoration: InputDecoration(
              hintText: 'Type shop name or address (e.g. Ramesh Agro Store Pune)',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _loadingSuggestions
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : _mapsSearchCtrl.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () => setState(() {
                            _mapsSearchCtrl.clear();
                            _suggestions = [];
                          }),
                        )
                      : null,
            ),
            onChanged: _onMapsSearchChanged,
          ),
          // Suggestions dropdown
          if (_suggestions.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.divider),
                borderRadius: BorderRadius.circular(8),
                boxShadow: const [
                  BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, 2))
                ],
              ),
              child: Column(
                children: _suggestions.take(5).map((s) {
                  return InkWell(
                    onTap: () => _selectSuggestion(s),
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      child: Row(
                        children: [
                          const Icon(Icons.place_outlined,
                              size: 16,
                              color: AppColors.onSurfaceVariant),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(s.description,
                                style: AppTextStyles.bodySmall),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          const SizedBox(height: 10),

          // Location action row
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _locating ? null : _useCurrentLocation,
                  icon: _locating
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location, size: 16),
                  label: const Text('Use current location',
                      style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    side: const BorderSide(color: AppColors.primary),
                    foregroundColor: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      setState(() => _showMapsLinkField = !_showMapsLinkField),
                  icon: const Icon(Icons.link, size: 16),
                  label: const Text('Paste Maps link',
                      style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    side: BorderSide(
                        color: _showMapsLinkField
                            ? AppColors.primary
                            : AppColors.divider),
                    foregroundColor: _showMapsLinkField
                        ? AppColors.primary
                        : AppColors.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
          // Paste Maps link field
          if (_showMapsLinkField) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _mapsLinkCtrl,
                    keyboardType: TextInputType.url,
                    decoration: InputDecoration(
                      hintText:
                          'https://maps.google.com/maps?q=18.52,73.85 or share link…',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      isDense: true,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _parsingLink ? null : _parseMapsLink,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                  ),
                  child: _parsingLink
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Go'),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),

          // ── City / State / Pincode row ──────────────────────────────────
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextField(
                  controller: _cityCtrl,
                  decoration: InputDecoration(
                    labelText: 'City',
                    hintText: 'City',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: TextField(
                  controller: _stateCtrl,
                  decoration: InputDecoration(
                    labelText: 'State',
                    hintText: 'State',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextField(
                  controller: _pincodeCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'PIN',
                    hintText: 'PIN',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // ── Action buttons ──────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: AppColors.divider),
                    foregroundColor: AppColors.onSurfaceVariant,
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _saving
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Add Retailer'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Link Existing Form ───────────────────────────────────────────────────────

class _LinkExistingForm extends StatefulWidget {
  final String manufacturerPhone;
  final String manufacturerName;
  final VoidCallback onLinked;
  const _LinkExistingForm({
    required this.manufacturerPhone,
    required this.manufacturerName,
    required this.onLinked,
  });

  @override
  State<_LinkExistingForm> createState() => _LinkExistingFormState();
}

class _LinkExistingFormState extends State<_LinkExistingForm> {
  final _searchCtrl = TextEditingController();
  List<Map<String, dynamic>> _results = [];
  Map<String, dynamic>? _selected;
  bool _searching = false;
  bool _linking = false;
  Timer? _debounce;

  @override
  void dispose() {
    _searchCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() { _results = []; _selected = null; });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 500), () async {
      if (!mounted) return;
      setState(() { _searching = true; _selected = null; });
      try {
        final res = await ManufacturerRepository()
            .searchRegisteredRetailers(v.trim());
        if (mounted) setState(() { _results = res; _searching = false; });
      } catch (_) {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  Future<void> _link() async {
    final u = _selected;
    if (u == null) return;
    setState(() => _linking = true);
    try {
      await ManufacturerRepository().linkExistingRetailer(
        manufacturerPhone: widget.manufacturerPhone,
        manufacturerName: widget.manufacturerName,
        retailerPhone: u['phone'] as String? ?? u['id'] as String,
        shopName: u['shopName'] as String? ?? u['name'] as String? ?? '',
        ownerName: u['name'] as String? ?? '',
        email: u['email'] as String?,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                '${u['shopName'] ?? u['name'] ?? 'Retailer'} linked to your network'),
            backgroundColor: AppColors.success,
          ),
        );
        widget.onLinked();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _linking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, kb + 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Search for a retailer who already has a KrishiDukan account and link them to your network.',
            style: AppTextStyles.body
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search by name, shop, or phone…',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : _searchCtrl.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () => setState(() {
                            _searchCtrl.clear();
                            _results = [];
                            _selected = null;
                          }),
                        )
                      : null,
            ),
            onChanged: _onSearchChanged,
          ),
          const SizedBox(height: 4),

          // Results dropdown
          if (_results.isNotEmpty && _selected == null)
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.divider),
                borderRadius: BorderRadius.circular(8),
                boxShadow: const [
                  BoxShadow(
                      color: Colors.black12,
                      blurRadius: 4,
                      offset: Offset(0, 2))
                ],
              ),
              child: Column(
                children: _results.map((u) {
                  final shop = u['shopName'] as String? ?? '';
                  final name = u['name'] as String? ?? '';
                  final phone = u['phone'] as String? ?? u['id'] as String;
                  return InkWell(
                    onTap: () => setState(() {
                      _selected = u;
                      _results = [];
                      _searchCtrl.text = shop.isNotEmpty ? shop : name;
                    }),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      child: Row(
                        children: [
                          const Icon(Icons.store_outlined,
                              size: 18,
                              color: AppColors.onSurfaceVariant),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  shop.isNotEmpty ? shop : name,
                                  style: AppTextStyles.bodyMedium,
                                ),
                                if (name.isNotEmpty && shop.isNotEmpty)
                                  Text(name, style: AppTextStyles.caption),
                                Text(phone, style: AppTextStyles.caption),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

          // No results
          if (!_searching &&
              _searchCtrl.text.trim().length >= 2 &&
              _results.isEmpty &&
              _selected == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Row(
                children: [
                  const Icon(Icons.info_outline,
                      size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No registered retailers found for "${_searchCtrl.text.trim()}".',
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),

          // Selected retailer card
          if (_selected != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle,
                      color: AppColors.primary, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (_selected!['shopName'] as String?)?.isNotEmpty ==
                                  true
                              ? _selected!['shopName'] as String
                              : _selected!['name'] as String? ?? '',
                          style: AppTextStyles.bodyMedium
                              .copyWith(fontWeight: FontWeight.w600),
                        ),
                        if ((_selected!['name'] as String?)?.isNotEmpty == true)
                          Text(_selected!['name'] as String,
                              style: AppTextStyles.caption),
                        Text(
                          _selected!['phone'] as String? ??
                              _selected!['id'] as String,
                          style: AppTextStyles.caption,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () => setState(() {
                      _selected = null;
                      _searchCtrl.clear();
                    }),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: AppColors.divider),
                    foregroundColor: AppColors.onSurfaceVariant,
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton(
                  onPressed: (_selected != null && !_linking) ? _link : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    disabledBackgroundColor:
                        AppColors.primary.withValues(alpha: 0.4),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _linking
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Link to Network'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Success view (shown after New Retailer is added) ─────────────────────────

class _SuccessView extends StatelessWidget {
  final String inviteCode;
  final VoidCallback onDone;
  const _SuccessView({required this.inviteCode, required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, color: AppColors.success, size: 64),
          const SizedBox(height: 16),
          Text('Retailer Added!', style: AppTextStyles.heading2),
          const SizedBox(height: 8),
          Text(
            'Share this invite code with the retailer:',
            style: AppTextStyles.body
                .copyWith(color: AppColors.onSurfaceVariant),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
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
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
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
                  const Icon(Icons.copy, color: AppColors.primary, size: 20),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onDone,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              child: const Text('Done'),
            ),
          ),
        ],
      ),
    );
  }
}
