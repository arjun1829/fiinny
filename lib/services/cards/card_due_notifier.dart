import 'dart:math' as math;

import 'package:intl/intl.dart';

import '../../models/credit_card_cycle.dart';
import '../credit_card_service.dart';
import '../notification_service.dart';

/// Schedules reminder notifications for credit card cycles.
class CardDueNotifier {
  CardDueNotifier(this._svc, this._notifs);

  final CreditCardService _svc;
  final NotificationService _notifs;

  Future<void> scheduleAll(String userId) async {
    final cards = await _svc.getUserCards(userId);
    final now = DateTime.now();

    for (final card in cards) {
      final CreditCardCycle? cycle =
          await _svc.getLatestCycle(userId, card.id);
      if (cycle == null) continue;

      await cancelFor(card.id, cycle.id);

      if (cycle.status == 'paid') continue;

      final remaining = math.max(0, cycle.totalDue - cycle.paidAmount);
      if (remaining <= 0.01) continue;

      // D-7, D-3, D-1 reminders at 9am local time.
      for (final daysBefore in const [7, 3, 1]) {
        final reminderTime = DateTime(
          cycle.dueDate.year,
          cycle.dueDate.month,
          cycle.dueDate.day,
          9,
        ).subtract(Duration(days: daysBefore));
        if (!reminderTime.isAfter(now)) continue;
        final notifId = _notifId('${card.id}_${cycle.id}_D$daysBefore');
        await _notifs.cancel(notifId);
        await _notifs.scheduleAt(
          id: notifId,
          title: 'Credit card due in $daysBefore day${daysBefore == 1 ? '' : 's'}',
          body:
              '₹${_money(remaining)} for ${card.bankName} • ${card.last4Digits} (due ${_formatDate(cycle.dueDate)})',
          when: reminderTime,
          payload: 'card:${card.id}|cycle:${cycle.id}',
        );
      }

      final statementDate = cycle.statementDate;
      if (statementDate.isAfter(now)) {
        final statementKey = _notifId('${card.id}_${cycle.id}_STATEMENT');
        final statementTime = DateTime(
          statementDate.year,
          statementDate.month,
          statementDate.day,
          9,
        );
        await _notifs.cancel(statementKey);
        await _notifs.scheduleAt(
          id: statementKey,
          title: '${card.bankName} statement ready',
          body:
              'Statement for ${card.bankName} • ${card.last4Digits} is ready. Bill due ${_formatDate(cycle.dueDate)}.',
          when: statementTime,
          payload: 'card:${card.id}|cycle:${cycle.id}|statement',
        );
      }

      if (now.isAfter(cycle.dueDate)) {
        for (var k = 1; k <= 3; k++) {
          final date = DateTime.now().add(Duration(days: k));
          final reminderTime = DateTime(date.year, date.month, date.day, 9);
          final notifId = _notifId('${card.id}_${cycle.id}_OVERDUE_$k');
          await _notifs.cancel(notifId);
          await _notifs.scheduleAt(
            id: notifId,
            title: 'Overdue credit card bill',
            body:
                '₹${_money(remaining)} pending for ${card.bankName} • ${card.last4Digits} (due ${_formatDate(cycle.dueDate)})',
            when: reminderTime,
            payload: 'card:${card.id}|cycle:${cycle.id}',
          );
        }
      }
    }
  }

  Future<void> cancelFor(String cardId, String cycleId) async {
    final keys = <String>[
      '${cardId}_${cycleId}_D7',
      '${cardId}_${cycleId}_D3',
      '${cardId}_${cycleId}_D1',
      '${cardId}_${cycleId}_STATEMENT',
      '${cardId}_${cycleId}_OVERDUE_1',
      '${cardId}_${cycleId}_OVERDUE_2',
      '${cardId}_${cycleId}_OVERDUE_3',
    ];

    for (final key in keys) {
      await _notifs.cancel(_notifId(key));
    }
  }

  String _money(num value) =>
      NumberFormat.decimalPattern('en_IN').format(value);

  String _formatDate(DateTime d) => '${d.day}/${d.month}/${d.year}';

  int _notifId(String key) {
    var hash = 0;
    for (final unit in key.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    return hash;
  }
}
