import 'package:flutter/services.dart';

/// One row of Android's CallLog.Calls.
class DeviceCall {
  DeviceCall({
    required this.id,
    required this.number,
    required this.name,
    required this.type,
    required this.date,
    required this.duration,
    required this.sim,
  });

  final int id;
  final String number;
  final String? name;

  /// CallLog.Calls.TYPE: 1 incoming, 2 outgoing, 3 missed, 4 voicemail,
  /// 5 rejected, 6 blocked, 7 answered externally.
  final int type;
  final int date;
  final int duration;
  final String? sim;

  factory DeviceCall.fromMap(Map<Object?, Object?> m) => DeviceCall(
        id: (m['id'] as num).toInt(),
        number: (m['number'] as String?) ?? '',
        name: m['name'] as String?,
        type: (m['type'] as num).toInt(),
        date: (m['date'] as num).toInt(),
        duration: (m['duration'] as num).toInt(),
        sim: m['sim'] as String?,
      );
}

class CallLogReader {
  static const _channel = MethodChannel('com.fiinny.calllogreader');

  static Future<bool> hasPermission() async =>
      (await _channel.invokeMethod<bool>('hasCallLogPermission')) ?? false;

  /// Calls with date > [sinceMillis], oldest first.
  static Future<List<DeviceCall>> query({int sinceMillis = 0}) async {
    final rows = await _channel.invokeListMethod<Map<Object?, Object?>>(
        'query', {'since': sinceMillis});
    return (rows ?? const []).map(DeviceCall.fromMap).toList();
  }

  /// Direct call when CALL_PHONE is granted, otherwise opens the dialer.
  static Future<void> call(String number) =>
      _channel.invokeMethod('call', {'number': number});

  static Future<void> openUrl(String url) =>
      _channel.invokeMethod('openUrl', {'url': url});

  static Future<String> deviceModel() async =>
      (await _channel.invokeMethod<String>('deviceModel')) ?? 'Android phone';
}
