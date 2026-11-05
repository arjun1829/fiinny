import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../app_state.dart';
import '../core/models.dart';
import 'common.dart';

String _cell(Object? v) {
  final s = (v ?? '').toString();
  return s.contains(RegExp(r'[",\n]')) ? '"${s.replaceAll('"', '""')}"' : s;
}

/// Writes the given calls to a CSV (opens in Excel) and opens the share sheet.
Future<void> exportCalls(AppState state, List<CallRecord> calls) async {
  final fmt = DateFormat('yyyy-MM-dd HH:mm:ss');
  final buf = StringBuffer()
    ..writeln(['Date time', 'Name', 'Number', 'Type', 'Duration (s)', 'Phone', 'SIM', 'Number status', 'Notes']
        .join(','));
  for (final c in calls) {
    final s = state.byNumber[c.numberKey];
    buf.writeln([
      fmt.format(c.time),
      s?.name ?? c.cachedName ?? '',
      c.rawNumber,
      c.kind.label,
      c.duration,
      c.deviceName,
      c.sim ?? '',
      s == null ? '' : statusLabel(s.status),
      s?.notes ?? '',
    ].map(_cell).join(','));
  }
  final bytes = [0xEF, 0xBB, 0xBF, ...utf8.encode(buf.toString())];
  final fileName = 'calls_${DateFormat('yyyyMMdd_HHmm').format(DateTime.now())}.csv';
  if (kIsWeb) {
    // Browser: no file system; hand the CSV over directly (download/share).
    await SharePlus.instance.share(ShareParams(
      files: [XFile.fromData(Uint8List.fromList(bytes), mimeType: 'text/csv', name: fileName)],
      fileNameOverrides: [fileName],
      subject: 'Call Tracker export (${calls.length} calls)',
    ));
    return;
  }
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/calls_${DateFormat('yyyyMMdd_HHmm').format(DateTime.now())}.csv');
  // BOM so Excel reads Hindi/Marathi names correctly.
  await file.writeAsBytes([0xEF, 0xBB, 0xBF, ...utf8.encode(buf.toString())]);
  await SharePlus.instance.share(ShareParams(
    files: [XFile(file.path, mimeType: 'text/csv')],
    subject: 'Call Tracker export (${calls.length} calls)',
  ));
}
