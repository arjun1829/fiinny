import 'package:flutter/material.dart';
import '../../services/analytics/subscription_detector.dart'; // Import detector
import '../../models/expense_item.dart'; // Mocking usage for now

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({Key? key}) : super(key: key);

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  
  // Mock Data for Demo (Real app would fetch from Firestore/Provider)
  final List<SubscriptionModel> subscriptions = [
    SubscriptionModel(name: 'Netflix', amount: 649, nextDueDate: DateTime.now().add(const Duration(days: 5)), iconPath: ''),
    SubscriptionModel(name: 'Spotify', amount: 119, nextDueDate: DateTime.now().add(const Duration(days: 12)), iconPath: ''),
    SubscriptionModel(name: 'Google One', amount: 130, nextDueDate: DateTime.now().add(const Duration(days: 2)), iconPath: ''),
  ];

  final List<HiddenChargeModel> hiddenCharges = [
    HiddenChargeModel(description: 'Forex Markup Fee', amount: 45.0, date: DateTime.now().subtract(const Duration(days: 3))),
    HiddenChargeModel(description: 'ATM Surcharge', amount: 20.0, date: DateTime.now().subtract(const Duration(days: 10))),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Background "Aurora"
          Positioned(
            top: -100, right: -100,
            child: Container(
              width: 400, height: 400,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [Colors.indigo.shade900, Colors.black], radius: 0.6),
              ),
            ),
          ),
          
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 10),
                  // Header
                  Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white70),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const Text(
                        "Smart Tracking",
                        style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // 1. Hidden Charges Alert
                  if (hiddenCharges.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.red.withOpacity(0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.warning_amber_rounded, color: Colors.redAccent),
                              const SizedBox(width: 8),
                              Text(
                                "Hidden Charges Detected!",
                                style: TextStyle(color: Colors.red.shade200, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ...hiddenCharges.map((c) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(c.description, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                                Text("- ₹${c.amount}", style: const TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          )),
                        ],
                      ),
                    ),
                  
                  const SizedBox(height: 30),

                  // 2. Active Subscriptions
                  const Text(
                    "Active Subscriptions",
                    style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w300),
                  ),
                  const SizedBox(height: 15),

                  Expanded(
                    child: ListView.builder(
                      itemCount: subscriptions.length,
                      itemBuilder: (context, index) {
                        final sub = subscriptions[index];
                        final isSoon = sub.daysRemaining <= 3;
                        
                        return Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white.withOpacity(0.1)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 48, height: 48,
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade900,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.subscriptions, color: Colors.white54), // Placeholder for logo
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(sub.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                                    const SizedBox(height: 4),
                                    Text(
                                      "Due in ${sub.daysRemaining} days",
                                      style: TextStyle(
                                        color: isSoon ? Colors.orangeAccent : Colors.white38, 
                                        fontSize: 12
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text("₹${sub.amount.toInt()}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                                  const SizedBox(height: 4),
                                  const Icon(Icons.notifications_active, color: Colors.tealAccent, size: 16),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
