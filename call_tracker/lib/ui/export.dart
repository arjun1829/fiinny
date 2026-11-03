import 'dart:convert';
import 'dart:io';

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
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/calls_${DateFormat('yyyyMMdd_HHmm').format(DateTime.now())}.csv');
  // BOM so Excel reads Hindi/Marathi names correctly.
  await file.writeAsBytes([0xEF, 0xBB, 0xBF, ...utf8.encode(buf.toString())]);
  await SharePlus.instance.share(ShareParams(
    files: [XFile(file.path, mimeType: 'text/csv')],
    subject: 'Call Tracker export (${calls.length} calls)',
  ));
}
