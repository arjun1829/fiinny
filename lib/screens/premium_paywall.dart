// lib/screens/premium_paywall.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../themes/glass_card.dart';
import '../themes/tokens.dart';

class PremiumPaywallScreen extends StatefulWidget {
  final String userPhone;
  const PremiumPaywallScreen({super.key, required this.userPhone});

  @override
  State<PremiumPaywallScreen> createState() => _PremiumPaywallScreenState();
}

class _PremiumPaywallScreenState extends State<PremiumPaywallScreen> {
  bool _busy = false;

  Future<void> _startTrial7d() async {
    setState(() => _busy = true);
    try {
      final until = DateTime.now().add(const Duration(days: 7));
      await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .collection('meta')
          .doc('flags')
          .set({
        'premiumEnabledAt': FieldValue.serverTimestamp(),
        'premiumUntil': Timestamp.fromDate(until),
      }, SetOptions(merge: true));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Premium trial activated for 7 days')),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to start trial: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const features = <(String, String)>[
      ('Smart Insights+', 'Deeper patterns & multi-source merges'),
      ('Unlimited Analytics', 'Category, merchant & trend deep-dives'),
      ('Rules & Autotags', 'AI rules to auto-categorize and flag'),
      ('Priority Sync', 'Faster email/SMS ingestion & dedupe'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Fiinny Premium'),
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Fx.mintDark,
      ),
      body: Stack(
        children: [
          IgnorePointer(
            ignoring: true,
            child: Container(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  colors: [
                    Fx.mint.withValues(alpha: .10),
                    Fx.mintDark.withValues(alpha: .06),
                    Colors.white.withValues(alpha: .60),
                  ],
                  center: Alignment.topLeft,
                  radius: .9,
                ),
              ),
            ),
          ),
          ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              GlassCard(
                radius: Fx.r24,
                child: Row(
                  children: const [
                    Icon(Icons.auto_awesome_rounded, color: Fx.mintDark),
                    SizedBox(width: Fx.s8),
                    Expanded(
                      child: Text(
                        'Upgrade for deeper insights & faster automations',
                        style: Fx.title,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Fx.s12),
              GlassCard(
                radius: Fx.r24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('What you get', style: Fx.title),
                    const SizedBox(height: Fx.s8),
                    ...features.map(
                      (f) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            const Icon(Icons.check_circle_rounded, color: Fx.mintDark, size: 18),
                            const SizedBox(width: Fx.s8),
                            Expanded(
                              child: Text(
                                '${f.$1} — ${f.$2}',
                                style: Fx.label,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Fx.s16),
              FilledButton.icon(
                onPressed: _busy ? null : _startTrial7d,
                icon: const Icon(Icons.rocket_launch_rounded),
                label: const Text('Start 7-day free trial'),
              ),
              const SizedBox(height: Fx.s8),
              Text(
                'No charge now. Trial uses Firestore flag. You can extend/convert later.',
                style: Fx.label.copyWith(fontSize: 12, color: Colors.black54),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
