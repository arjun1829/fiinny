import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../services/notification_service.dart';

class LoanSuggestion {
  final String key;          // stable: merchant|last4
  final String lender;       // display name
  final double emi;          // approx monthly EMI
  final DateTime firstSeen;
  final DateTime lastSeen;
  final int occurrences;     // how many debits seen
  final bool autopay;        // SI/ECS present?
  final int paymentDay;      // day-of-month (from lastSeen)
  final double confidence;   // 0..1

  LoanSuggestion({
    required this.key,
    required this.lender,
    required this.emi,
    required this.firstSeen,
    required this.lastSeen,
    required this.occurrences,
    required this.autopay,
    required this.paymentDay,
    required this.confidence,
  });

  Map<String,dynamic> toJson() => {
    'key': key,
    'lender': lender,
    'emi': emi,
    'firstSeen': Timestamp.fromDate(firstSeen),
    'lastSeen': Timestamp.fromDate(lastSeen),
    'occurrences': occurrences,
    'autopay': autopay,
    'paymentDay': paymentDay,
    'confidence': confidence,
    'status': 'new', // 'new' | 'accepted' | 'dismissed'
    'createdAt': FieldValue.serverTimestamp(),
  };
}

class LoanDetectionService {
  final _fs = FirebaseFirestore.instance;

  // Detect loan-like recurring debits and write suggestions (idempotent).
  Future<int> scanAndWrite(String userId, {int daysWindow = 360}) async {
    final from = DateTime.now().subtract(Duration(days: daysWindow));
    // fetch expenses
    final exps = <ExpenseItem>[];
    DocumentSnapshot? cursor;
    const page = 250;
    while (true) {
      Query q = _fs.collection('users').doc(userId).collection('expenses')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date').limit(page);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;
      exps.addAll(snap.docs.map((d) => ExpenseItem.fromFirestore(d)));
      cursor = snap.docs.last;
    }

    // group EMI-like
    final groups = <String, List<ExpenseItem>>{};
    final loanKw = RegExp(r'\b(emi|loan|repayment|installment|instalment)\b', caseSensitive: false);
    final autopayKw = RegExp(r'\b(standing instruction|si|ecs|mandate|autopay|auto[- ]?debit|upi[- ]?auto)\b', caseSensitive: false);

    for (final e in exps) {
      final n = e.note.toLowerCase();
      final tags = (e.toJson()['tags'] as List?)?.cast<String>() ?? const [];
      final looksLoan = tags.contains('loan_emi') || loanKw.hasMatch(n);
      if (!looksLoan) continue;
      final merchant = _merchantOf(e);
      final key = '${merchant.toLowerCase()}|${(e.cardLast4 ?? '').trim()}';
      groups.putIfAbsent(key, () => []).add(e);
    }

    int written = 0;
    for (final entry in groups.entries) {
      final list = entry.value..sort((a,b)=>a.date.compareTo(b.date));
      if (list.length < 2) continue;

      // monthly cadence?
      final diffs = <int>[];
      for (int i=1;i<list.length;i++) {
        diffs.add(list[i].date.difference(list[i-1].date).inDays.abs());
      }
      diffs.sort();
      final median = diffs.isEmpty ? 30 : (diffs.length.isOdd
          ? diffs[diffs.length ~/ 2]
          : ((diffs[diffs.length ~/ 2 - 1] + diffs[diffs.length ~/ 2]) / 2).round());
      final isMonthly = median >= 27 && median <= 34;
      if (!isMonthly) continue;

      // EMI approx = avg of last 3
      final tail = list.sublist(max(0, list.length - 3));
      final emi = tail.fold<double>(0.0, (a,b)=>a+b.amount) / tail.length;

      final autopay = list.any((e) {
        final n = e.note.toLowerCase();
        final t = (e.toJson()['tags'] as List?)?.cast<String>() ?? const [];
        return t.contains('autopay') || autopayKw.hasMatch(n);
      });

      final lender = _merchantOf(list.last);
      final firstSeen = list.first.date;
      final lastSeen = list.last.date;
      final paymentDay = lastSeen.day;

      final conf = 0.7
          + (autopay ? 0.1 : 0.0)
          + (list.length >= 4 ? 0.1 : 0.0);
      final sug = LoanSuggestion(
        key: entry.key,
        lender: lender,
        emi: emi,
        firstSeen: firstSeen,
        lastSeen: lastSeen,
        occurrences: list.length,
        autopay: autopay,
        paymentDay: paymentDay,
        confidence: conf.clamp(0.0, 0.99),
      );

      final ref = _fs.collection('users').doc(userId)
          .collection('loan_suggestions').doc(sug.key);
      final existing = await ref.get();
      if (!existing.exists || (existing.data()?['status'] ?? 'new') == 'new') {
        await ref.set(sug.toJson(), SetOptions(merge: true));
        written++;
      }
    }
    return written;
  }

  Future<int> pendingCount(String userId) async {
    final snap = await _fs.collection('users').doc(userId)
        .collection('loan_suggestions').where('status', isEqualTo: 'new').get();
    return snap.docs.length;
  }

  Future<List<Map<String,dynamic>>> listPending(String userId) async {
    final snap = await _fs.collection('users').doc(userId)
        .collection('loan_suggestions').where('status', isEqualTo: 'new')
        .orderBy('createdAt', descending: true).get();
    return snap.docs.map((d)=>({...d.data(), 'id': d.id})).toList();
  }

  Future<void> dismiss(String userId, String id) async {
    await _fs.collection('users').doc(userId)
        .collection('loan_suggestions').doc(id).update({'status':'dismissed'});
  }

  // ---------------------------------------------------------------------------
  // NEW: Immediate Link/Suggest from Gmail/SMS Parser
  // ---------------------------------------------------------------------------

  Future<void> checkLoanTransaction(String userId, Map<String, dynamic> txn) async {
    // 1. Validate inputs
    final amount = (txn['amount'] as num?)?.toDouble() ?? 0.0;
    if (amount <= 0) return;
    
    final merchant = (txn['merchant'] ?? txn['description'] ?? '').toString();
    final category = (txn['category'] ?? '').toString();
    final subCategory = (txn['subcategory'] ?? '').toString();
    final note = (txn['note'] ?? '').toString();
    final date = (txn['date'] as Timestamp?)?.toDate() ?? DateTime.now();

    // 2. Must be a loan-related transaction to proceed
    final isLoan = category == 'Payments' &&
        (subCategory.contains('Loan') || subCategory.contains('EMI') || subCategory.contains('Repayment'));
    // Or stricter keyword check if category isn't set yet (though parser usually sets it)
    final strictKw = RegExp(r'\b(loan|repayment|emi)\b', caseSensitive: false);
    if (!isLoan && !strictKw.hasMatch(merchant) && !strictKw.hasMatch(note)) {
      return; 
    }

    // 3. Try Auto-Link to Existing Loan
    // We fetch ACTIVE loans only
    final loansSnap = await _fs.collection('loans')
        .where('userId', isEqualTo: userId)
        .where('isClosed', isEqualTo: false)
        .get();
        
    // Simple matching heuristic
    // We use a dummy doc as fallback because firstWhere throws
    final matchedLoan = loansSnap.docs.cast<DocumentSnapshot<Map<String, dynamic>>?>().firstWhere((d) {
      if (d == null) return false;
      final data = d.data();
      if (data == null) return false;
      final lName = (data['lenderName'] ?? data['title'] ?? '').toString().toLowerCase();
      final lAcc = (data['accountLast4'] ?? '').toString();
      
      // A. Exact Account Match (Strongest)
      // If txn has "Loan Account XX1234", extract 1234 and match
      if (lAcc.isNotEmpty && note.contains(lAcc)) return true;
      
      // B. Lender Name Match
      // normalized check
      if (lName.isNotEmpty && merchant.toLowerCase().contains(lName)) {
        // Double check amount approx match? (Optional: if EMI is defined)
        final emi = (data['emi'] as num?)?.toDouble();
        if (emi != null && (emi - amount).abs() < 50) return true; // match within ₹50
        
        // If no EMI defined, trust the name match
        return true; 
      }
      
      return false;
    }, orElse: () => null);
    
    if (matchedLoan != null) {
      // --> FOUND! Record payment (reduce outstanding)
      await _recordPaymentRaw(matchedLoan.reference, amount, date);
      return;
    }

    // 4. No Match -> Create Suggestion
    // This is a "Single Shot" suggestion
    final key = 'SINGLE|${merchant.toLowerCase()}|${amount.toInt()}';
    
    final sug = LoanSuggestion(
      key: key,
      lender: _title(merchant.isEmpty ? 'Unknown Lender' : merchant),
      emi: amount,
      firstSeen: date,
      lastSeen: date,
      occurrences: 1, // It's new
      autopay: note.toLowerCase().contains('auto'),
      paymentDay: date.day,
      confidence: 0.85, // High confidence because parser said it's a LOAN
    );



    // Write if not dismissed/accepted
    final ref = _fs.collection('users').doc(userId)
        .collection('loan_suggestions').doc(key);
    final existing = await ref.get();
    if (!existing.exists || (existing.data()?['status'] ?? 'new') == 'new') {
        await ref.set(sug.toJson(), SetOptions(merge: true));
        
        // NOTIFY USER
        if (!existing.exists) { // Only notify if it's truly new
           NotificationService().showNotification(
             title: 'New Loan Detected',
             body: 'Found potential loan from $merchant. Tap to review.',
           );
        }
    }
  }

  Future<void> _recordPaymentRaw(DocumentReference ref, double amount, DateTime date) async {
    await _fs.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists) return; // race condition
      
      final data = snap.data() as Map<String, dynamic>;
      final curr = (data['amount'] as num?)?.toDouble() ?? 0.0;
      final closed = data['isClosed'] == true;
      
      if (closed) return; // Don't reduce closed loans
      
      final newAmt = (curr - amount).clamp(0.0, double.infinity);
      final update = <String, dynamic>{
        'amount': newAmt,
        'lastPaymentDate': Timestamp.fromDate(date),
        'lastPaymentAmount': amount,
      };
      if (newAmt <= 0) update['isClosed'] = true;
      
      tx.update(ref, update);
    });
  }
}

String _merchantOf(ExpenseItem e) {
  final meta = (e.toJson()['brainMeta'] as Map?)?.cast<String, dynamic>();
  final m = (meta?['merchant'] as String?) ?? e.label ?? e.category ?? '';
  if (m.trim().isNotEmpty) return _title(m);
  final n = e.note;
  final m2 = RegExp(r'[A-Z][A-Z0-9&._-]{3,}').firstMatch(n.toUpperCase());
  return m2 != null ? _title(m2.group(0)!) : 'Loan';
}

String _title(String s) => s.split(RegExp(r'\s+')).map((w)=> w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
