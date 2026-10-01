import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/widgets/state_views.dart';
import '../data/plan_ladder.dart';
import '../data/referral_repository.dart';
import '../providers/referral_providers.dart';
import 'referrals_screen.dart' show copyToClipboard, shareOnWhatsApp;

final _inr = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

/// Build a link with the plan already chosen, for a customer who shouldn't
/// have to work out plans and product counts themselves.
///
/// The rep can ONLY choose from what admin currently sells (settings/pricing)
/// — Standard packs, or Custom periods × product counts in the 10-block rule.
/// There is no free-form price or quantity. Checkout re-checks the plan
/// against the live ladder, and the server prices every order itself.
class OfferLinkScreen extends ConsumerStatefulWidget {
  const OfferLinkScreen({super.key, required this.code});
  final String code;

  @override
  ConsumerState<OfferLinkScreen> createState() => _OfferLinkScreenState();
}

class _OfferLinkScreenState extends ConsumerState<OfferLinkScreen> {
  PlanTier _tier = PlanTier.standard;
  SubscriptionPlan? _plan;
  int _seats = seatStep;
  final _nameCtrl = TextEditingController();

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  List<SubscriptionPlan> _tierPlans(List<SubscriptionPlan> all) =>
      all.where((p) => p.tier == _tier).toList()..sort(
        (a, b) => _tier == PlanTier.standard
            ? b.months.compareTo(a.months)
            : a.months.compareTo(b.months),
      );

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(offerPlansProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Offer link')),
      body: async.when(
        loading: () => const LoadingView(message: 'Loading current plans…'),
        error: (e, _) => ErrorView(
          message: 'Could not load plans.',
          onRetry: () => ref.invalidate(offerPlansProvider),
        ),
        data: (all) {
          final hasStd = all.any((p) => p.isStandard);
          final hasCustom = all.any((p) => !p.isStandard);
          if (!all.any((p) => p.tier == _tier)) {
            _tier = hasStd ? PlanTier.standard : PlanTier.custom;
          }
          final plans = _tierPlans(all);
          // Keep the choice valid if the ladder changed under us.
          if (_plan == null ||
              !all.any((p) => p.key == _plan!.key) ||
              _plan!.tier != _tier) {
            _plan = plans.isEmpty ? null : plans.first;
          }
          final plan = _plan;
          final perListing = plan != null && !plan.isStandard && !plan.isFlat;
          final granted = plan?.billableSeats(_seats) ?? 0;
          final price = plan?.totalPrice(_seats) ?? 0;
          final link = referralLink(widget.code, plan: plan, seats: _seats);
          final name = _nameCtrl.text.trim();
          final message = plan == null
              ? ''
              : 'Namaskar${name.isNotEmpty ? ' $name' : ''}! Your KrishiDukan plan is ready: '
                    '${plan.planName} · ${plan.label} · $granted products for ${_inr.format(price)}. '
                    'Open this link and complete the payment: $link';

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              Text(
                'Code ${widget.code}',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 12),
              if (hasStd && hasCustom)
                SegmentedButton<PlanTier>(
                  segments: const [
                    ButtonSegment(
                      value: PlanTier.standard,
                      label: Text('Standard'),
                    ),
                    ButtonSegment(
                      value: PlanTier.custom,
                      label: Text('Custom'),
                    ),
                  ],
                  selected: {_tier},
                  showSelectedIcon: false,
                  onSelectionChanged: (s) => setState(() {
                    _tier = s.first;
                    _plan = null;
                  }),
                ),
              const SizedBox(height: 12),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SectionLabel(
                      _tier == PlanTier.standard ? 'Standard plan' : 'Duration',
                    ),
                    RadioGroup<String>(
                      groupValue: plan?.key,
                      onChanged: (key) => setState(() {
                        _plan = plans.firstWhere(
                          (p) => p.key == key,
                          orElse: () => plans.first,
                        );
                      }),
                      child: Column(
                        children: [
                          for (final p in plans)
                            RadioListTile<String>(
                              contentPadding: EdgeInsets.zero,
                              value: p.key,
                              title: Text(
                                p.isStandard
                                    ? '${p.label} · ${p.includedListings} products'
                                    : p.label,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              subtitle: Text(
                                p.isStandard || p.isFlat
                                    ? '${_inr.format(p.flatPrice)}'
                                          '${p.compareAtPrice != null && p.compareAtPrice! > (p.flatPrice ?? 0) ? '  (was ${_inr.format(p.compareAtPrice)})' : ''}'
                                    : '₹${p.pricePerSeat} per product',
                              ),
                              secondary: p.badge != null
                                  ? StatusChip(
                                      label: p.badge!,
                                      color: AppColors.harvest,
                                      background: AppColors.harvestContainer,
                                    )
                                  : null,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (perListing) ...[
                const SizedBox(height: 12),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SectionLabel('Number of products'),
                      Row(
                        children: [
                          IconButton(
                            onPressed: _seats > seatStep
                                ? () => setState(
                                    () => _seats = normalizeSeatCount(
                                      _seats - seatStep,
                                    ),
                                  )
                                : null,
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                          Text(
                            '$_seats',
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          IconButton(
                            onPressed: () => setState(
                              () => _seats = normalizeSeatCount(
                                _seats + seatStep,
                              ),
                            ),
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                          const Spacer(),
                          Text(
                            'blocks of $seatStep',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final n in seatPresets)
                            ChoiceChip(
                              label: Text('$n'),
                              selected: _seats == n,
                              onSelected: (_) => setState(() => _seats = n),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _nameCtrl,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Customer name (optional, for the message)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              if (plan != null)
                AppCard(
                  color: AppColors.primaryContainer.withValues(alpha: 0.35),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${plan.planName} · ${plan.label} · $granted products',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _inr.format(price),
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Customer pays this at checkout (less any promo code they apply). '
                        'If admin changes this plan before they pay, they will be asked to choose again.',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FilledButton.icon(
                            onPressed: () => shareOnWhatsApp(context, message),
                            icon: const Icon(Icons.chat_rounded, size: 18),
                            label: const Text('Send on WhatsApp'),
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF25D366),
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: () =>
                                copyToClipboard(context, link, 'Offer link'),
                            icon: const Icon(Icons.copy_rounded, size: 18),
                            label: const Text('Copy link'),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => SharePlus.instance.share(
                              ShareParams(text: message),
                            ),
                            icon: const Icon(Icons.share_rounded, size: 18),
                            label: const Text('Share'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
