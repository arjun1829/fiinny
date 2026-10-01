import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/enquiry_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../providers/enquiry_provider.dart';

/// Seller Enquiries — customers who started an order for this seller's
/// products but never completed payment.
///
/// Mirrors web's /dashboard/enquiry. The same event already reached admin
/// under Payments; this is it handed to the person who can actually act on
/// it, with the buyer's number one tap from a phone call.
class EnquiryScreen extends ConsumerStatefulWidget {
  /// Enquiry to show first and highlight — set when the seller opened this
  /// screen from that enquiry's notification.
  final String? focusId;
  const EnquiryScreen({super.key, this.focusId});

  @override
  ConsumerState<EnquiryScreen> createState() => _EnquiryScreenState();
}

enum _Tab { open, contacted, closed, all }

class _EnquiryScreenState extends ConsumerState<EnquiryScreen> {
  // Opened from a notification: show every status, so the tapped enquiry is
  // visible even if it was already marked contacted on another device.
  late _Tab _tab = widget.focusId != null ? _Tab.all : _Tab.open;
  String? _busyId;

  bool _matches(EnquiryModel e) {
    if (e.id == widget.focusId) return true;
    switch (_tab) {
      case _Tab.open:
        return e.status == EnquiryStatus.open;
      case _Tab.contacted:
        return e.status == EnquiryStatus.contacted;
      case _Tab.closed:
        return e.status == EnquiryStatus.closed;
      case _Tab.all:
        return true;
    }
  }

  Future<void> _setStatus(EnquiryModel e, EnquiryStatus status) async {
    setState(() => _busyId = e.id);
    try {
      await ref.read(enquiryRepositoryProvider).setStatus(e.id, status);
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not update: $err'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  // launchUrl is tried directly rather than gated on canLaunchUrl: on
  // Android 11+ canLaunchUrl answers false for any scheme the manifest's
  // <queries> doesn't list, which blocked calls on builds before that fix.
  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    bool ok = false;
    try {
      ok = await launchUrl(uri);
    } catch (_) {}
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open the dialler. Number: $phone')),
      );
    }
  }

  Future<void> _whatsapp(EnquiryModel e) async {
    final digits = e.buyerPhone.replaceAll(RegExp(r'\D'), '');
    final number = digits.length == 10 ? '91$digits' : digits;
    final text = Uri.encodeComponent(
      'Namaste ${e.displayName}, you were ordering ${e.itemSummary} from us '
      "but the payment didn't go through. Can I help you complete it?",
    );
    final uri = Uri.parse('https://wa.me/$number?text=$text');
    bool ok = false;
    try {
      ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open WhatsApp')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider).value;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Enquiries',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: user == null
          ? const Center(child: Text('Not logged in.'))
          : _Body(
              phone: user.phone,
              tab: _tab,
              matches: _matches,
              busyId: _busyId,
              focusId: widget.focusId,
              onTabChanged: (t) => setState(() => _tab = t),
              onCall: _call,
              onWhatsapp: _whatsapp,
              onStatus: _setStatus,
            ),
    );
  }
}

class _Body extends ConsumerWidget {
  final String phone;
  final _Tab tab;
  final bool Function(EnquiryModel) matches;
  final String? busyId;
  final String? focusId;
  final ValueChanged<_Tab> onTabChanged;
  final Future<void> Function(String) onCall;
  final Future<void> Function(EnquiryModel) onWhatsapp;
  final Future<void> Function(EnquiryModel, EnquiryStatus) onStatus;

  const _Body({
    required this.phone,
    required this.tab,
    required this.matches,
    required this.busyId,
    this.focusId,
    required this.onTabChanged,
    required this.onCall,
    required this.onWhatsapp,
    required this.onStatus,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(sellerEnquiriesProvider(phone));

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Could not load enquiries.'),
        ),
      ),
      data: (all) {
        if (all.isEmpty) return const _EmptyState();
        final visible = all.where(matches).toList();
        // The enquiry a notification pointed at goes first.
        final fi = visible.indexWhere((e) => e.id == focusId);
        if (fi > 0) visible.insert(0, visible.removeAt(fi));
        int countOf(_Tab t) {
          switch (t) {
            case _Tab.open:
              return all.where((e) => e.status == EnquiryStatus.open).length;
            case _Tab.contacted:
              return all.where((e) => e.status == EnquiryStatus.contacted).length;
            case _Tab.closed:
              return all.where((e) => e.status == EnquiryStatus.closed).length;
            case _Tab.all:
              return all.length;
          }
        }

        return Column(
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  for (final t in _Tab.values) ...[
                    _FilterChip(
                      label: '${_label(t)} (${countOf(t)})',
                      selected: tab == t,
                      onTap: () => onTabChanged(t),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
            ),
            Expanded(
              child: visible.isEmpty
                  ? Center(
                      child: Text(
                        'Nothing in ${_label(tab).toLowerCase()}.',
                        style: AppTextStyles.bodyMedium
                            .copyWith(color: AppColors.onSurfaceVariant),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      itemCount: visible.length,
                      itemBuilder: (_, i) => _EnquiryCard(
                        enquiry: visible[i],
                        busy: busyId == visible[i].id,
                        highlighted: visible[i].id == focusId,
                        onCall: onCall,
                        onWhatsapp: onWhatsapp,
                        onStatus: onStatus,
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }

  static String _label(_Tab t) {
    switch (t) {
      case _Tab.open:
        return 'New';
      case _Tab.contacted:
        return 'Contacted';
      case _Tab.closed:
        return 'Closed';
      case _Tab.all:
        return 'All';
    }
  }
}

/// "2 hours ago" reads better than a timestamp on something meant to be acted
/// on quickly — how fresh the lead is IS the useful part.
String _ago(DateTime? d) {
  if (d == null) return '—';
  final mins = DateTime.now().difference(d).inMinutes;
  if (mins < 60) return '${mins < 1 ? 1 : mins} min ago';
  final hours = (mins / 60).round();
  if (hours < 24) return '$hours hour${hours == 1 ? '' : 's'} ago';
  final days = (hours / 24).round();
  return '$days day${days == 1 ? '' : 's'} ago';
}

class _EnquiryCard extends StatelessWidget {
  final EnquiryModel enquiry;
  final bool busy;
  final bool highlighted;
  final Future<void> Function(String) onCall;
  final Future<void> Function(EnquiryModel) onWhatsapp;
  final Future<void> Function(EnquiryModel, EnquiryStatus) onStatus;

  const _EnquiryCard({
    required this.enquiry,
    required this.busy,
    this.highlighted = false,
    required this.onCall,
    required this.onWhatsapp,
    required this.onStatus,
  });

  @override
  Widget build(BuildContext context) {
    final e = enquiry;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlighted ? AppColors.primary : AppColors.divider,
          width: highlighted ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(e.displayName,
                              style: AppTextStyles.bodyMedium
                                  .copyWith(fontWeight: FontWeight.w800),
                              overflow: TextOverflow.ellipsis),
                        ),
                        const SizedBox(width: 6),
                        _StatusBadge(status: e.status),
                        if (e.paymentFailed) ...[
                          const SizedBox(width: 4),
                          _Pill(
                            label: 'Payment failed',
                            color: AppColors.error,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(e.buyerPhone,
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.onSurfaceVariant)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(CurrencyUtils.format(e.value),
                      style: AppTextStyles.bodyMedium
                          .copyWith(fontWeight: FontWeight.w800)),
                  Text(_ago(e.createdAt),
                      style: AppTextStyles.caption
                          .copyWith(color: AppColors.onSurfaceVariant)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              children: [
                for (final item in e.items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${item.name}  × ${item.qty}',
                            style: AppTextStyles.bodySmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(CurrencyUtils.format(item.effectiveTotal),
                            style: AppTextStyles.caption
                                .copyWith(color: AppColors.onSurfaceVariant)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: () => onCall(e.buyerPhone),
                icon: const Icon(Icons.call, size: 16),
                label: const Text('Call'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  visualDensity: VisualDensity.compact,
                ),
              ),
              OutlinedButton.icon(
                onPressed: () => onWhatsapp(e),
                icon: const Icon(Icons.chat_outlined, size: 16),
                label: const Text('WhatsApp'),
                style: OutlinedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  side: const BorderSide(color: AppColors.divider),
                  foregroundColor: AppColors.onSurface,
                ),
              ),
              if (e.status == EnquiryStatus.open)
                TextButton(
                  onPressed:
                      busy ? null : () => onStatus(e, EnquiryStatus.contacted),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: AppColors.onSurfaceVariant,
                  ),
                  child: const Text('Mark contacted'),
                ),
              if (e.status != EnquiryStatus.closed)
                TextButton(
                  onPressed:
                      busy ? null : () => onStatus(e, EnquiryStatus.closed),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    foregroundColor: AppColors.onSurfaceVariant,
                  ),
                  child: const Text('Close'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final EnquiryStatus status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case EnquiryStatus.open:
        return _Pill(label: 'New', color: Colors.orange.shade800);
      case EnquiryStatus.contacted:
        return _Pill(label: 'Contacted', color: AppColors.info);
      case EnquiryStatus.closed:
        return _Pill(label: 'Closed', color: AppColors.onSurfaceVariant);
    }
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color color;
  const _Pill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: AppTextStyles.caption.copyWith(
          color: color,
          fontWeight: FontWeight.w800,
          fontSize: 9,
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary
              : AppColors.primaryContainer.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: AppTextStyles.bodySmall.copyWith(
            color: selected ? Colors.white : AppColors.onSurfaceVariant,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.shopping_cart_outlined,
                size: 44, color: AppColors.onSurfaceVariant.withValues(alpha: 0.4)),
            const SizedBox(height: 12),
            Text('No enquiries yet', style: AppTextStyles.heading3),
            const SizedBox(height: 6),
            Text(
              "When a customer starts ordering one of your products online and doesn't "
              'finish paying, they will show up here with their number so you can '
              'follow up.',
              textAlign: TextAlign.center,
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
