// lib/group/reminder_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';

class ReminderService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // Compute net per member (phone -> net)
  Map<String, double> computeNetByMember(List<ExpenseItem> expenses) {
    final net = <String, double>{};
    for (final e in expenses) {
      if (e.payerId.isEmpty) {
        continue;
      }
      final participants = <String>{e.payerId, ...e.friendIds};
      final splits = e.customSplits ??
          {for (final id in participants) id: e.amount / participants.length};

      splits.forEach((id, share) {
        if (id == e.payerId) {
          net[id] = (net[id] ?? 0) + (e.amount - share);
        } else {
          net[id] = (net[id] ?? 0) - share;
        }
      });
    }
    return net;
  }

  // Post a system reminder to group chat
  Future<void> sendGroupReminder({
    required String groupId,
    required String currentUserPhone,
    required List<String> participantPhones,
    required List<ExpenseItem> groupExpenses,
    String? customMessage,
    bool alsoSendDMs = false,
  }) async {
    final net = computeNetByMember(groupExpenses);
    final you = net[currentUserPhone] ?? 0.0;

    // Debtors who owe *you*
    final debtors = net.entries
        .where((e) => e.key != currentUserPhone && e.value < -0.01)
        .toList();

    if (debtors.isEmpty && customMessage == null) {
      // nothing to nudge
      return;
    }

    final msg = customMessage ??
        (you > 0.01
            ? "Gentle reminder: some members owe me a total of ₹${you.abs().toStringAsFixed(0)}."
            : "Reminder from me to settle pending balances.");

    // system message to group chat
    final threadRef = _db.collection('group_chats').doc(groupId);
    await threadRef.collection('messages').add({
      'from': currentUserPhone,
      'type': 'reminder',
      'message': msg,
      'targets': debtors.map((e) => e.key).toList(),
      'timestamp': FieldValue.serverTimestamp(),
      'edited': false,
      'system': true,
    });

    await threadRef.set({
      'lastMessage': '[reminder]',
      'lastFrom': currentUserPhone,
      'lastAt': FieldValue.serverTimestamp(),
      'lastType': 'reminder',
    }, SetOptions(merge: true));

    if (!alsoSendDMs || debtors.isEmpty) {
      return;
    }

    // optional DM nudge to each debtor
    for (final d in debtors) {
      final a = currentUserPhone.trim();
      final b = d.key.trim();
      final threadId = (a.compareTo(b) <= 0) ? '${a}_$b' : '${b}_$a';
      final dmRef = _db.collection('chats').doc(threadId);

      await dmRef.collection('messages').add({
        'from': currentUserPhone,
        'to': d.key,
        'type': 'reminder',
        'message':
            "Hey! Could you settle ₹${d.value.abs().toStringAsFixed(2)} when you get a chance? Thanks!",
        'timestamp': FieldValue.serverTimestamp(),
        'edited': false,
      });

      await dmRef.set({
        'participants': [currentUserPhone, d.key],
        'lastMessage': '[reminder]',
        'lastFrom': currentUserPhone,
        'lastAt': FieldValue.serverTimestamp(),
        'lastType': 'reminder',
      }, SetOptions(merge: true));
    }
  }
}
