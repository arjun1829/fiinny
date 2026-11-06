import 'package:calltracker/core/models.dart';
import 'package:calltracker/core/status_engine.dart';
import 'package:flutter_test/flutter_test.dart';

var _seq = 0;
CallRecord call(String number, CallKind kind, int minute,
        {int duration = 0, String device = 'A'}) =>
    CallRecord(
      id: '$device-${_seq++}',
      numberKey: numberKey(number),
      rawNumber: number,
      kind: kind,
      timestamp: minute * 60000,
      duration: duration,
      deviceId: device,
      deviceName: 'Phone $device',
    );

NumberSummary only(List<CallRecord> calls, {Map<String, ContactInfo> contacts = const {}}) =>
    computeStatuses(calls, contacts).summaries.single;

void main() {
  group('numberKey', () {
    test('matches the same mobile in every format', () {
      expect(numberKey('+91 98765 43210'), '9876543210');
      expect(numberKey('098765-43210'), '9876543210');
      expect(numberKey('9876543210'), '9876543210');
      expect(numberKey(''), '');
    });
  });

  group('CallKind.fromAndroid', () {
    test('maps call-log types', () {
      expect(CallKind.fromAndroid(1, 30), CallKind.incoming);
      expect(CallKind.fromAndroid(1, 0), CallKind.missed);
      expect(CallKind.fromAndroid(2, 0), CallKind.outgoing);
      expect(CallKind.fromAndroid(3, 0), CallKind.missed);
      expect(CallKind.fromAndroid(4, 0), CallKind.missed);
      expect(CallKind.fromAndroid(5, 0), CallKind.rejected);
      expect(CallKind.fromAndroid(6, 0), CallKind.blocked);
    });
  });

  group('status', () {
    test('missed with no call back is red, counting every missed call', () {
      final s = only([
        call('9876543210', CallKind.missed, 1),
        call('+919876543210', CallKind.missed, 5),
      ]);
      expect(s.status, CallStatus.pending);
      expect(s.openMissed, 2);
      expect(s.openSince, 60000);
    });

    test('call back that did not connect is orange', () {
      final s = only([
        call('9876543210', CallKind.missed, 1),
        call('9876543210', CallKind.outgoing, 10),
      ]);
      expect(s.status, CallStatus.attempted);
      expect(s.attempts, 1);
    });

    test('connected call back is green, from either phone', () {
      final s = only([
        call('9876543210', CallKind.missed, 1, device: 'A'),
        call('9876543210', CallKind.outgoing, 10, device: 'B'),
        call('9876543210', CallKind.outgoing, 12, duration: 45, device: 'B'),
      ]);
      expect(s.status, CallStatus.calledBack);
      expect(s.resolvedBy, 'Phone B');
      expect(s.openMissed, 0);
    });

    test('customer calling again and getting answered also clears it', () {
      final s = only([
        call('9876543210', CallKind.missed, 1),
        call('9876543210', CallKind.incoming, 20, duration: 60),
      ]);
      expect(s.status, CallStatus.calledBack);
    });

    test('a new missed call after a call back turns it red again', () {
      final s = only([
        call('9876543210', CallKind.missed, 1),
        call('9876543210', CallKind.outgoing, 5, duration: 30),
        call('9876543210', CallKind.missed, 50),
      ]);
      expect(s.status, CallStatus.pending);
      expect(s.openMissed, 1);
      expect(s.openSince, 50 * 60000);
    });

    test('not needed is grey until they miss-call again', () {
      final calls = [call('9876543210', CallKind.missed, 1)];
      final dismissed = {
        '9876543210': ContactInfo(
            numberKey: '9876543210', displayNumber: '9876543210', dismissedAt: 2 * 60000, updatedAt: 0),
      };
      expect(only(calls, contacts: dismissed).status, CallStatus.dismissed);
      calls.add(call('9876543210', CallKind.missed, 3));
      expect(only(calls, contacts: dismissed).status, CallStatus.pending);
    });

    test('answered-only numbers are normal and blocked calls are ignored', () {
      final r = computeStatuses([
        call('9876543210', CallKind.incoming, 1, duration: 10),
        call('9000000000', CallKind.blocked, 2),
        call('', CallKind.missed, 3),
      ], {});
      expect(r.summaries.single.status, CallStatus.normal);
    });

    test('pending numbers sort first, oldest waiting at the top', () {
      final r = computeStatuses([
        call('9111111111', CallKind.incoming, 100, duration: 5),
        call('9222222222', CallKind.missed, 30),
        call('9333333333', CallKind.missed, 10),
      ], {});
      expect(r.summaries.map((s) => s.numberKey), ['9333333333', '9222222222', '9111111111']);
    });

    test('team name beats phone name beats call-log name', () {
      final c = call('9876543210', CallKind.incoming, 1, duration: 5);
      final withCached = CallRecord(
        id: c.id, numberKey: c.numberKey, rawNumber: c.rawNumber, kind: c.kind,
        timestamp: c.timestamp, duration: c.duration, deviceId: 'A', deviceName: 'A',
        cachedName: 'Cached',
      );
      expect(computeStatuses([withCached], {}).summaries.single.name, 'Cached');
      expect(
          computeStatuses([withCached], {}, phoneNames: {'9876543210': 'Phone'}).summaries.single.name,
          'Phone');
      expect(
          computeStatuses([withCached], {
            '9876543210': ContactInfo(
                numberKey: '9876543210', displayNumber: '9876543210', name: 'Team', updatedAt: 0),
          }, phoneNames: {'9876543210': 'Phone'}).summaries.single.name,
          'Team');
    });
  });
}
