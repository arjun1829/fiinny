// lib/services/recurring_service_bridge.dart
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/details/models/recurring_rule.dart';
import '../models/loan_model.dart';
import 'loan_service.dart';
import 'package:lifemap/details/services/recurring_service.dart';

/// Bridges Loans ↔ Recurring (EMI) so each side can materialize / reference the other.
class RecurringLoanBridge {
  final RecurringService _recurring;
  final LoanService _loans;

  RecurringLoanBridge({
    RecurringService? recurring,
    LoanService? loans,
  })  : _recurring = recurring ?? RecurringService(),
        _loans = loans ?? LoanService();

  /// 1) From a LOAN → create a mirrored recurring EMI item (and optional notifications).
  ///
  /// - Creates an EMI-type SharedItem mirrored under:
  ///   users/{userPhone}/friends/{friendId}/recurring/{itemId}
  ///   and
  ///   users/{friendId}/friends/{userPhone}/recurring/{itemId}
  /// - Back-references the created recurring id into the Loan doc as `recurringItemId`.
  ///
  /// [userPhone] = owner’s phone (your “me”)
  /// [friendId]  = other side (can be same as userPhone for solo)
  Future<String> ensureRecurringForLoan({
    required LoanModel loan,
    required String userPhone,
    required String friendId,
    bool notify = true,
    int daysBefore = 5,
    String timeHHmm = "09:00",
    String? note,
    String? attachmentUrl,
    bool mirrorToFriend = true,
  }) async {
    // EMI amount fallback: prefer EMI, else minDue (card-like), else 0.
    final double amount = (loan.emi ?? loan.minDue ?? 0).toDouble();

    // Safe monthly due day (1..28). Prefer explicit DOM; else infer from nextPaymentDate; else today.
    final DateTime now = DateTime.now();
    final DateTime? modelNext = loan.nextPaymentDate(now: now);
    final int dom =
        (loan.paymentDayOfMonth ?? modelNext?.day ?? now.day).clamp(1, 28);

    // Rule: monthly, active, anchored to this month’s (or next’s) safe day.
    final RecurringRule rule = RecurringRule(
      frequency: 'monthly',
      status: 'active',
      anchorDate: DateTime(now.year, now.month, dom),
      amount: amount,
      dueDay: dom,
      weekday: null,
      intervalDays: null,
      // participant shares optional—depends on your SharedItem/Rule model
      participants: [
        ParticipantShare(userId: userPhone, sharePct: 50),
        ParticipantShare(userId: friendId, sharePct: 50),
      ],
    );

    // Compute next due respecting anchor & frequency.
    final DateTime nextDue = _recurring.computeNextDue(rule);

    final SharedItem item = SharedItem(
      id: '', // let service assign
      // Keep both "type" and meta.recurringKind for compatibility with older code.
      type: 'emi',
      title: loan.title,
      note: note ?? loan.note,
      rule: rule,
      nextDueAt: nextDue,
      meta: {
        'recurringKind': 'emi',
        'link': {
          'type': 'loan',
          'loanId': loan.id,
          'userId': loan.userId,
        },
        'lenderType': loan.lenderType,
        if (loan.lenderName != null) 'lenderName': loan.lenderName,
        if (loan.interestRate != null) 'interestRate': loan.interestRate,
        if (loan.accountLast4 != null) 'accountLast4': loan.accountLast4,
        if (attachmentUrl != null && attachmentUrl.isNotEmpty)
          'attachmentUrl': attachmentUrl,
      },
      // Do NOT set a `participantsTop` here; RecurringService.add() injects participants.userIds.
    );

    // Create mirrored recurring item.
    final String newId = await _recurring.add(
      userPhone,
      friendId,
      item,
      mirrorToFriend: mirrorToFriend,
    );

    // Optional: back-reference recurring id on the loan doc for quick joins.
    if (loan.id != null) {
      await _loans.patch(
        loan.id!,
        {'recurringItemId': newId},
        asTimestamp: false,
      );
    }

    // Notifications (mirrored), if desired.
    if (notify) {
      await _recurring.setNotifyPrefs(
        userPhone: userPhone,
        friendId: friendId,
        itemId: newId,
        enabled: true,
        daysBefore: daysBefore,
        timeHHmm: timeHHmm,
        notifyBoth: true,
        mirrorToFriend: mirrorToFriend,
      );
    }

    return newId;
  }

  /// 2) From a RECURRING (EMI) item → create a Loan stub so Loans UI can show it.
  ///
  /// Provide [friendId] explicitly so we can write back the cross-link to the correct mirror path.
  Future<String> ensureLoanForRecurringEmi({
    required SharedItem emiItem,
    required String userId,
    required String friendId,
    String lenderType = 'Bank',
    String? lenderName,
  }) async {
    // Ensure we are bridging only EMI-like items.
    final String? kind =
        (emiItem.meta?['recurringKind'] as String?) ?? emiItem.type;
    assert(
        kind == 'emi', 'ensureLoanForRecurringEmi expects an EMI SharedItem');

    final int dueDay = (emiItem.rule.dueDay ?? DateTime.now().day).clamp(1, 28);
    final double amt = (emiItem.rule.amount).toDouble();

    final LoanModel stub = LoanModel(
      userId: userId,
      title: emiItem.title ?? 'EMI',
      amount: amt, // outstanding (user can edit later)
      lenderType: lenderType,
      lenderName: lenderName,
      interestRate: null,
      interestMethod: LoanInterestMethod.reducing,
      emi: amt,
      tenureMonths: null,
      paymentDayOfMonth: dueDay,
      reminderEnabled: true,
      reminderDaysBefore: 5,
      reminderTime: '09:00',
      note: emiItem.note,
      isClosed: false,
      createdAt: DateTime.now(),
      tags: const ['emi', 'fromRecurring'],
    );

    final String loanId = await _loans.addLoan(stub);

    // Write back cross-link on the recurring item (to my side; shown friendId given).
    await _recurring.patchMeta(
      userId: userId,
      friendId: friendId,
      itemId: emiItem.id,
      meta: {
        ...?emiItem.meta,
        'link': {
          'type': 'loan',
          'loanId': loanId,
          'userId': userId,
        },
      },
    );

    return loanId;
  }
}
