import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lifemap/services/subscription_service.dart';

class ManageSubscriptionScreen extends StatefulWidget {
  const ManageSubscriptionScreen({super.key});

  @override
  State<ManageSubscriptionScreen> createState() =>
      _ManageSubscriptionScreenState();
}

class _ManageSubscriptionScreenState extends State<ManageSubscriptionScreen> {
  bool _isLoading = false;

  void _confirmCancel() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Cancel Membership?"),
        content: const Text(
          "Your benefits will continue until the end of your current billing period. After that, you will be downgraded to the Free plan.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text("Keep Plan"),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              _handleCancel();
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text("Confirm Cancel"),
          ),
        ],
      ),
    );
  }

  Future<void> _handleCancel() async {
    setState(() => _isLoading = true);
    try {
      await Provider.of<SubscriptionService>(context, listen: false)
          .cancelSubscription();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content:
                  Text("Subscription has been cancelled. Auto-renew is off.")),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed to cancel: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final subService = Provider.of<SubscriptionService>(context);
    final sub = subService.currentSubscription;

    if (sub == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final isPremium = subService.isPremium;
    final isPro = subService.isPro;
    final planName =
        isPro ? "Pro Plan" : (isPremium ? "Premium Plan" : "Free Plan");
    final status = sub.status.toUpperCase();
    final expiry = subService.formattedExpiry;
    final isCanceled =
        status == 'CANCELED_PENDING_EXPIRY' || sub.autoRenew == false;

    return Scaffold(
      appBar: AppBar(title: const Text("Manage Subscription")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Current Plan Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: isPremium
                      ? [Colors.black, Colors.grey.shade900]
                      : [Colors.blue.shade50, Colors.white],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: const [
                  BoxShadow(
                      color: Colors.black12,
                      blurRadius: 10,
                      offset: Offset(0, 4))
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        planName,
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: isPremium ? Colors.white : Colors.black87,
                        ),
                      ),
                      if (isPremium)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                              color: Colors.amber,
                              borderRadius: BorderRadius.circular(8)),
                          child: Text(status,
                              style: const TextStyle(
                                  fontSize: 10, fontWeight: FontWeight.bold)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (isPremium) ...[
                    Text("Renews/Expires on: $expiry",
                        style: const TextStyle(color: Colors.white70)),
                    const SizedBox(height: 8),
                    if (isCanceled)
                      const Text(
                        "Auto-renew is OFF. You will not be charged again.",
                        style:
                            TextStyle(color: Colors.amberAccent, fontSize: 13),
                      )
                    else
                      const Text(
                        "Membership is active and will auto-renew.",
                        style:
                            TextStyle(color: Colors.greenAccent, fontSize: 13),
                      ),
                  ] else
                    const Text(
                        "You are on the free plan with limited features."),
                ],
              ),
            ),

            const SizedBox(height: 32),

            // Actions
            if (isPremium && !isCanceled) ...[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _isLoading ? null : _confirmCancel,
                  icon: const Icon(Icons.cancel_outlined),
                  label: const Text("Cancel Membership"),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    side: const BorderSide(color: Colors.red),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                "Canceling will keep your benefits active until the expiry date, but you won't be charged for the next cycle.",
                style: TextStyle(color: Colors.grey, fontSize: 12),
                textAlign: TextAlign.center,
              ),
            ],

            if (isPremium && !isPro) ...[
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.pushNamed(context, '/premium'),
                  icon: const Icon(Icons.arrow_upward),
                  label: const Text("Upgrade to Pro"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.purple,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                "Upgrade now and get credit for your unused Premium days!",
                style: TextStyle(
                    color: Colors.purple,
                    fontSize: 12,
                    fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
            ],

            if (!isPremium) ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pushNamed(context, '/premium'),
                  style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black,
                      foregroundColor: Colors.amber,
                      padding: const EdgeInsets.symmetric(vertical: 16)),
                  child: const Text("Upgrade Now"),
                ),
              ),
            ]
          ],
        ),
      ),
    );
  }
}
