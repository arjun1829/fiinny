import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:lifemap/services/subscription_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
// import 'dart:js_interop';
// import 'dart:js_interop_unsafe';

// @JS('openRazorpayWeb')
// external void _openRazorpayWeb(JSString options, JSFunction successCallback, JSFunction failureCallback);

class UpgradeScreen extends StatefulWidget {
  const UpgradeScreen({super.key});

  @override
  State<UpgradeScreen> createState() => _UpgradeScreenState();
}

class _UpgradeScreenState extends State<UpgradeScreen> {
  late Razorpay _razorpay;
  String _selectedPlan = 'premium'; // 'premium' or 'pro'
  String _selectedCycle = 'yearly'; // 'yearly' or 'monthly'
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _handlePaymentError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  void _handlePaymentSuccess(PaymentSuccessResponse response) async {
    setState(() => _isLoading = true);
    try {
      final service = Provider.of<SubscriptionService>(context, listen: false);
      await service.verifyPayment(
        paymentId: response.paymentId!,
        orderId: response.orderId!,
        signature: response.signature!,
        plan: _selectedPlan,
        cycle: _selectedCycle,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text("Welcome to Premium! payment successful.")),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Payment verification failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _handlePaymentError(PaymentFailureResponse response) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Payment Failed: ${response.message}")),
    );
    setState(() => _isLoading = false);
  }

  void _handleExternalWallet(ExternalWalletResponse response) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text("External Wallet Selected: ${response.walletName}")),
    );
  }

  Future<void> _startPayment() async {
    setState(() => _isLoading = true);
    try {
      final service = Provider.of<SubscriptionService>(context, listen: false);
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      // 1. Create Order on Backend
      final orderData =
          await service.createOrder(_selectedPlan, _selectedCycle);

      // 2. Open Razorpay Checkout
      final options = {
        'key': orderData['key_id'],
        'amount': orderData['amount'],
        'name': 'Fiinny',
        'description': '${_selectedPlan.toUpperCase()} Plan ($_selectedCycle)',
        'order_id': orderData['order_id'],
        'prefill': {
          'contact': user.phoneNumber ?? '',
          'email': user.email ?? ''
        },
        'external': {
          'wallets': ['paytm']
        }
      };

      if (kIsWeb) {
        // --- WEB IMPLEMENTATION (JS Interop) ---
        debugPrint("Web payment disabled for mobile build");
        /*
        final jsonOptions = jsonEncode(options);
        
        // Success Handler
        final successCallback = (JSString paymentId, JSString orderId, JSString signature) {
           _handlePaymentSuccess(PaymentSuccessResponse(
             paymentId.toDart,
             orderId.toDart,
             signature.toDart,
             null // extra 'data' argument
           ));
        }.toJS;

        // Failure Handler
        final failureCallback = (JSString code, JSString message) {
           _handlePaymentError(PaymentFailureResponse(
             0, // Razerpay web returns string codes, plugin expects int. Using 0 (unknown).
             "[${code.toDart}] ${message.toDart}",
             null // extra 'error' argument
           ));
        }.toJS;

        _openRazorpayWeb(jsonOptions.toJS, successCallback, failureCallback);
        */
        // ---------------------------------------
      } else {
        // --- MOBILE IMPLEMENTATION (Plugin) ---
        _razorpay.open(options);
        // --------------------------------------
      }
    } catch (e, stack) {
      debugPrint("Payment Start Error: $e\n$stack");
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to initiate payment: $e")),
      );
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black, // Premium feel
      appBar: AppBar(
        title:
            const Text("Upgrade Plan", style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Plan Selector Toggle could go here (Monthly / Yearly)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildCycleToggle("Monthly", "monthly"),
                const SizedBox(width: 12),
                _buildCycleToggle("Yearly (Best Value)", "yearly"),
              ],
            ),
            const SizedBox(height: 12),
            const Center(
              child: Text(
                "Upgrading? Unused time on your current plan will be deducted from the total.",
                style: TextStyle(color: Colors.white54, fontSize: 11),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 24),

            // Premium Card
            _buildPlanCard(
              title: "Premium ⭐",
              price: _selectedCycle == 'yearly' ? "₹1,499 / yr" : "₹199 / mo",
              features: [
                "Everything in Free",
                "Ad-free Experience",
                "AI Insights (Fiinny Brain)",
                "Monthly Spending Analysis",
                "Budget Alerts",
                "CSV / PDF Export",
              ],
              isBestValue: _selectedCycle == 'yearly',
              planId: 'premium',
            ),

            const SizedBox(height: 16),

            // Pro Card
            _buildPlanCard(
              title: "Pro 🚀",
              price: _selectedCycle == 'yearly' ? "₹2,999 / yr" : "₹299 / mo",
              features: [
                "Everything in Premium",
                "Unlimited Cards & Loans",
                "Advanced AI Forecasts",
                "Priority Features",
              ],
              isBestValue: false,
              planId: 'pro',
            ),

            const SizedBox(height: 32),

            if (_isLoading)
              const Center(child: CircularProgressIndicator())
            else
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.amberAccent,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _startPayment,
                  child: Text(
                    "Upgrade to ${_selectedPlan.toUpperCase()}",
                    style: const TextStyle(
                        color: Colors.black,
                        fontSize: 18,
                        fontWeight: FontWeight.bold),
                  ),
                ),
              ),

            const SizedBox(height: 16),
            const Center(
              child: Text(
                "Secure payment via Razorpay",
                style: TextStyle(color: Colors.white54, fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCycleToggle(String label, String value) {
    final isSelected = _selectedCycle == value;
    return GestureDetector(
      onTap: () => setState(() => _selectedCycle = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.white10,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.black : Colors.white60,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildPlanCard({
    required String title,
    required String price,
    required List<String> features,
    required bool isBestValue,
    required String planId,
  }) {
    final isSelected = _selectedPlan == planId;
    return GestureDetector(
      onTap: () => setState(() => _selectedPlan = planId),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF1E1E1E) : Colors.black,
          border: Border.all(
            color: isSelected ? Colors.amberAccent : Colors.white24,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold)),
                if (isBestValue)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                        color: Colors.amber,
                        borderRadius: BorderRadius.circular(8)),
                    child: const Text("SAVE 37%",
                        style: TextStyle(
                            color: Colors.black,
                            fontSize: 10,
                            fontWeight: FontWeight.bold)),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(price,
                style: const TextStyle(color: Colors.white70, fontSize: 18)),
            const Divider(color: Colors.white24, height: 32),
            ...features.map((f) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      const Icon(Icons.check,
                          color: Colors.greenAccent, size: 18),
                      const SizedBox(width: 8),
                      Text(f, style: const TextStyle(color: Colors.white70)),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
