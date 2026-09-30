import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/app_router.dart';
import '../../../core/widgets/state_views.dart';
import '../data/referral_repository.dart';
import '../providers/referral_providers.dart';

final _inr = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

/// The rep's referral codes (assigned by admin in Admin → Referrals): their
/// share link, how people from it are converting, and who to follow up with.
class ReferralsScreen extends ConsumerWidget {
  const ReferralsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myReferralCodesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Referrals')),
      body: async.when(
        loading: () => const LoadingView(message: 'Loading your referrals…'),
        error: (e, _) => ErrorView(
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () => ref.invalidate(myReferralCodesProvider),
        ),
        data: (codes) {
          if (codes.isEmpty) {
            return const EmptyView(
              icon: Icons.link_off_rounded,
              title: 'No referral code yet',
              message:
                  'Ask your admin to create a referral code for you in Admin → Referrals. '
                  'It will appear here with your share link and results.',
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(myReferralCodesProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                for (final c in codes) ...[
                  _CodeCard(code: c),
                  const SizedBox(height: 16),
                  _StatsCard(stats: c.stats),
                  const SizedBox(height: 16),
                  _ChartCard(days: c.stats.daily),
                  const SizedBox(height: 16),
                  _LeadsCard(leads: c.stats.leads),
                  const SizedBox(height: 28),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

Future<void> shareOnWhatsApp(
  BuildContext context,
  String text, {
  String? phone,
}) async {
  final digits = (phone ?? '').replaceAll(RegExp(r'\D'), '');
  final to = digits.length == 10 ? '91$digits' : digits;
  final uri = Uri.parse('https://wa.me/$to?text=${Uri.encodeComponent(text)}');
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {}
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Could not open WhatsApp')));
  }
}

Future<void> copyToClipboard(
  BuildContext context,
  String text,
  String what,
) async {
  await Clipboard.setData(ClipboardData(text: text));
  if (context.mounted) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$what copied')));
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.code});
  final MyReferralCode code;

  @override
  Widget build(BuildContext context) {
    final link = referralLink(code.code);
    final message =
        'Namaskar! Take your agri shop online on KrishiDukan — '
        'farmers near you can find your products. Subscribe here: $link';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'YOUR CODE',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: AppColors.onSurfaceVariant,
                  letterSpacing: 1.2,
                ),
              ),
              const Spacer(),
              StatusChip(
                label: code.active ? 'Active' : 'Paused by admin',
                color: code.active
                    ? AppColors.success
                    : AppColors.onSurfaceVariant,
                background: code.active
                    ? AppColors.successContainer
                    : AppColors.surfaceContainer,
              ),
            ],
          ),
          const SizedBox(height: 4),
          SelectableText(
            code.code,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLow,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.divider),
            ),
            child: SelectableText(link, style: const TextStyle(fontSize: 12)),
          ),
          if (!code.active) ...[
            const SizedBox(height: 8),
            const Text(
              'This code is paused, so purchases through it are not credited to you right now.',
              style: TextStyle(fontSize: 12, color: AppColors.error),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: () => shareOnWhatsApp(context, message),
                icon: const Icon(Icons.chat_rounded, size: 18),
                label: const Text('WhatsApp'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF25D366),
                ),
              ),
              OutlinedButton.icon(
                onPressed: () => copyToClipboard(context, link, 'Link'),
                icon: const Icon(Icons.copy_rounded, size: 18),
                label: const Text('Copy link'),
              ),
              OutlinedButton.icon(
                onPressed: () =>
                    SharePlus.instance.share(ShareParams(text: message)),
                icon: const Icon(Icons.share_rounded, size: 18),
                label: const Text('Share'),
              ),
            ],
          ),
          const Divider(height: 28),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: code.active
                  ? () => context.go(
                      '${Routes.home}/referrals/offer?code=${code.code}',
                    )
                  : null,
              icon: const Icon(Icons.add_link_rounded),
              label: const Text('Create offer link with a plan'),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Pick the plan for your customer — they open the link and only need to pay.',
            style: TextStyle(fontSize: 12, color: AppColors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.stats});
  final ReferralStats stats;

  @override
  Widget build(BuildContext context) {
    final steps = [
      ('Link opened', stats.opens, AppColors.outline),
      ('Saw plans', stats.reachedCheckout, AppColors.info),
      ('Started payment', stats.startedBuyers, AppColors.harvest),
      ('Paid', stats.paidBuyers, AppColors.success),
    ];
    final top = steps.map((s) => s.$2).fold<int>(1, (a, b) => b > a ? b : a);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Your results'),
          const SizedBox(height: 8),
          Row(
            children: [
              _Big(
                label: 'Customers paid',
                value: '${stats.paidBuyers}',
                color: AppColors.success,
              ),
              _Big(
                label: 'Revenue',
                value: _inr.format(stats.revenue),
                color: AppColors.primary,
              ),
              _Big(
                label: 'Conversion',
                value: '${stats.conversionPct}%',
                color: AppColors.info,
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (final s in steps) ...[
            Row(
              children: [
                Expanded(
                  child: Text(s.$1, style: const TextStyle(fontSize: 13)),
                ),
                Text(
                  '${s.$2}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: s.$2 / top,
                minHeight: 8,
                color: s.$3,
                backgroundColor: AppColors.surfaceContainer,
              ),
            ),
            const SizedBox(height: 10),
          ],
          Row(
            children: [
              _Small(
                label: 'Payment failed',
                value: stats.failedOrders,
                color: AppColors.error,
              ),
              const SizedBox(width: 8),
              _Small(
                label: 'Started, didn\'t pay',
                value: stats.abandonedOrders,
                color: AppColors.warning,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Big extends StatelessWidget {
  const _Big({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppColors.onSurfaceVariant,
          ),
        ),
      ],
    ),
  );
}

class _Small extends StatelessWidget {
  const _Small({required this.label, required this.value, required this.color});
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(
            '$value',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11),
          ),
        ],
      ),
    ),
  );
}

/// Last 30 days: started (amber) with paid (green) inside, one bar per day.
class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.days});
  final List<ReferralDay> days;

  @override
  Widget build(BuildContext context) {
    final maxV = days.fold<int>(1, (m, d) {
      final v = d.started > d.opens ? d.started : d.opens;
      return v > m ? v : m;
    });
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Last 30 days'),
          const SizedBox(height: 12),
          SizedBox(
            height: 110,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final d in days)
                  Expanded(
                    child: Tooltip(
                      message:
                          '${d.date}: ${d.opens} opened · ${d.started} started · ${d.paid} paid',
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1),
                        child: Stack(
                          alignment: Alignment.bottomCenter,
                          children: [
                            Container(
                              height: 110 * d.opens / maxV,
                              color: AppColors.divider,
                            ),
                            Container(
                              height: 110 * d.started / maxV,
                              color: AppColors.harvest,
                            ),
                            Container(
                              height: 110 * d.paid / maxV,
                              color: AppColors.success,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Wrap(
            spacing: 12,
            children: [
              _Legend(color: AppColors.divider, label: 'Opened'),
              _Legend(color: AppColors.harvest, label: 'Started'),
              _Legend(color: AppColors.success, label: 'Paid'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color color;
  final String label;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(width: 10, height: 10, color: color),
      const SizedBox(width: 4),
      Text(label, style: const TextStyle(fontSize: 11)),
    ],
  );
}

class _LeadsCard extends StatelessWidget {
  const _LeadsCard({required this.leads});
  final List<ReferralLead> leads;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel('Follow up (${leads.length})'),
          const SizedBox(height: 4),
          const Text(
            'People from your link who have not paid yet.',
            style: TextStyle(fontSize: 12, color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          if (leads.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Nobody to follow up — everyone who started has paid.',
              ),
            ),
          for (final l in leads) ...[
            const Divider(height: 16),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l.name ?? l.phone ?? 'Customer',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        [
                          l.statusLabel,
                          if (l.amount != null && l.amount! > 0)
                            _inr.format(l.amount),
                          if (l.seatCount != null) '${l.seatCount} products',
                          if (l.lastAt != null)
                            DateFormat('d MMM, h:mm a').format(l.lastAt!),
                        ].join(' · '),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                if (l.phone != null && l.phone!.isNotEmpty) ...[
                  IconButton(
                    tooltip: 'Call',
                    icon: const Icon(
                      Icons.call_rounded,
                      color: AppColors.primary,
                    ),
                    onPressed: () =>
                        launchUrl(Uri(scheme: 'tel', path: l.phone)),
                  ),
                  IconButton(
                    tooltip: 'WhatsApp',
                    icon: const Icon(
                      Icons.chat_rounded,
                      color: Color(0xFF25D366),
                    ),
                    onPressed: () => shareOnWhatsApp(
                      context,
                      'Namaskar${l.name != null ? ' ${l.name}' : ''}! I saw you were '
                      'subscribing to KrishiDukan. Can I help you complete it?',
                      phone: l.phone,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}
