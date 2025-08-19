// lib/screens/review_inbox_screen.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/review_queue_service.dart';

class ReviewInboxScreen extends StatelessWidget {
  final String userId;
  const ReviewInboxScreen({Key? key, required this.userId}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final service = ReviewQueueService();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Email Review'),
        centerTitle: false,
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: service.streamPending(userId),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snap.hasData || snap.data!.docs.isEmpty) {
            return const Center(child: Text('No items to review.'));
          }
          final docs = snap.data!.docs;
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemBuilder: (context, i) {
              final d = docs[i].data();
              final parsed = Map<String, dynamic>.from(d['parsed'] ?? {});
              final raw = Map<String, dynamic>.from(d['raw'] ?? {});
              final gmailId = (d['gmailMessageId'] as String?) ?? docs[i].id;

              final direction = (parsed['direction'] as String?) ?? '';
              final category  = (parsed['category']  as String?) ?? 'Other';
              final amount    = (parsed['amount']    as num?)?.toDouble() ?? 0.0;
              final note      = (parsed['note']      as String?) ?? (raw['snippet'] as String? ?? '');
              final merchant  = (parsed['merchant']  as String?) ?? '';
              final conf      = (parsed['confidence'] as num?)?.toDouble() ?? 0.0;

              return Card(
                elevation: 1.5,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                child: Padding(
                  padding: const EdgeInsets.all(14.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _DirPill(direction: direction),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.grey.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(category, style: const TextStyle(fontWeight: FontWeight.w600)),
                          ),
                          const Spacer(),
                          Text('₹ ${amount.toStringAsFixed(2)}',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (merchant.isNotEmpty)
                        Text(merchant, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                      if (note.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6.0),
                          child: Text(note, style: TextStyle(color: Colors.grey.shade700)),
                        ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          _ConfBadge(value: conf),
                          const Spacer(),
                          TextButton(
                            onPressed: () => _showEditSheet(context, userId, gmailId, parsed),
                            child: const Text('Edit'),
                          ),
                          const SizedBox(width: 6),
                          OutlinedButton(
                            onPressed: () async {
                              await service.reject(userId: userId, gmailMessageId: gmailId);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Rejected')),
                                );
                              }
                            },
                            child: const Text('Reject'),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            onPressed: () async {
                              await service.approve(userId: userId, gmailMessageId: gmailId);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Approved')),
                                );
                              }
                            },
                            child: const Text('Approve'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemCount: docs.length,
          );
        },
      ),
    );
  }

  Future<void> _showEditSheet(
      BuildContext context,
      String userId,
      String gmailMessageId,
      Map<String, dynamic> parsed,
      ) async {
    final amountCtrl = TextEditingController(
      text: (parsed['amount'] is num) ? (parsed['amount'] as num).toStringAsFixed(2) : '${parsed['amount'] ?? ''}',
    );
    final noteCtrl   = TextEditingController(text: parsed['note'] as String? ?? '');
    String direction = (parsed['direction'] as String?) ?? 'debit';
    String category  = (parsed['category']  as String?) ?? 'Other';
    final categories = <String>[
      'Credit Card','Card Spend','UPI','UPI Credit','Bank Transfer','Bank Credit',
      'ATM Withdrawal','Refund','Salary','Interest','EMI','Fees/Charges','Bills/Utilities','Other',
    ];

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16, right: 16, top: 16, bottom: 16 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: StatefulBuilder(
            builder: (ctx, setState) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Edit Transaction', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      ChoiceChip(
                        label: const Text('Debit'),
                        selected: direction == 'debit',
                        onSelected: (_) => setState(() => direction = 'debit'),
                      ),
                      const SizedBox(width: 8),
                      ChoiceChip(
                        label: const Text('Credit'),
                        selected: direction == 'credit',
                        onSelected: (_) => setState(() => direction = 'credit'),
                      ),
                      const Spacer(),
                      SizedBox(
                        width: 160,
                        child: DropdownButtonFormField<String>(
                          value: categories.contains(category) ? category : 'Other',
                          decoration: const InputDecoration(labelText: 'Category'),
                          onChanged: (v) => setState(() => category = v ?? 'Other'),
                          items: categories.map((c) =>
                              DropdownMenuItem(value: c, child: Text(c))).toList(),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: amountCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Amount'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: noteCtrl,
                    decoration: const InputDecoration(labelText: 'Note'),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Spacer(),
                      ElevatedButton(
                        onPressed: () async {
                          final amt = double.tryParse(amountCtrl.text.trim());
                          if (amt == null || amt <= 0) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Enter a valid amount')),
                            );
                            return;
                          }
                          await FirebaseFirestore.instance
                              .collection('users').doc(userId)
                              .collection('review_queue').doc(gmailMessageId)
                              .update({
                            'parsed.amount': amt,
                            'parsed.note': noteCtrl.text.trim(),
                            'parsed.direction': direction,
                            'parsed.category': category,
                          });
                          if (context.mounted) Navigator.pop(context);
                        },
                        child: const Text('Save'),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

class _DirPill extends StatelessWidget {
  final String direction;
  const _DirPill({required this.direction});
  @override
  Widget build(BuildContext context) {
    final isCredit = direction == 'credit';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: (isCredit ? Colors.green : Colors.red).withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        isCredit ? 'Credit' : 'Debit',
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: isCredit ? Colors.green.shade800 : Colors.red.shade800,
        ),
      ),
    );
  }
}

class _ConfBadge extends StatelessWidget {
  final double value; // 0..1
  const _ConfBadge({required this.value});
  @override
  Widget build(BuildContext context) {
    final pct = (value * 100).clamp(0, 100).toStringAsFixed(0);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: Colors.blueGrey.withOpacity(0.12),
      ),
      child: Text('Confidence: $pct%', style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }
}
