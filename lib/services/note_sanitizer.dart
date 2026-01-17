// lib/services/note_sanitizer.dart
import 'dart:math' as math;
import 'tx_analyzer.dart';

class SanitizedNote {
  final String note; // what we show in UI
  final String rawPreview; // short cleaned preview of original raw
  final int removedLines; // how many lines we dropped
  final List<String> tags; // e.g., ['UPI','P2M','AUTOPAY']
  const SanitizedNote({
    required this.note,
    required this.rawPreview,
    required this.removedLines,
    required this.tags,
  });
}

class NoteSanitizer {
  static SanitizedNote build({
    required String raw,
    required TxParseResult parse,
  }) {
    final cleaned = _cleanRaw(raw);
    final preview = _truncate(_collapseSpaces(cleaned), 240);

    final tags = <String>[];
    if (parse.isUPI) tags.add('UPI');
    if (parse.isP2M) tags.add('P2M');
    if (!parse.isDebit) tags.add('CR');

    final main = _smartSummary(parse);

    // If summary is too sparse, fall back to a compacted first sentence from cleaned
    final note = main.isNotEmpty ? main : _firstSentence(preview);

    final removed = _countRemoved(raw, cleaned);
    return SanitizedNote(
      note: note,
      rawPreview: preview,
      removedLines: removed,
      tags: tags,
    );
  }

  // ---------- SMART SUMMARY ----------
  static String _smartSummary(TxParseResult p) {
    final parts = <String>[];

    // Amount + direction
    if (p.amount != null) {
      final dir = p.isDebit ? 'debited' : 'credited';
      parts.add('₹${_fmtAmt(p.amount!)} $dir');
    }

    // Merchant/Channel
    if (p.merchant != null && p.merchant!.trim().isNotEmpty) {
      parts.add(p.merchant!);
    }
    if (p.isUPI) {
      parts.add(p.isP2M ? '• UPI P2M' : '• UPI');
    }

    // Reference (UPI/Txn id)
    if (p.reference != null && p.reference!.trim().isNotEmpty) {
      parts.add('• Ref ${_shortRef(p.reference!)}');
    }

    // Date (compact)
    if (p.when != null) {
      final d = p.when!;
      final dd = d.day.toString().padLeft(2, '0');
      final mo = d.month.toString().padLeft(2, '0');
      final hh = d.hour.toString().padLeft(2, '0');
      final mm = d.minute.toString().padLeft(2, '0');
      parts.add('• $dd/$mo $hh:$mm');
    }

    return parts.join(' ');
  }

  // ---------- RAW CLEANING ----------
  static String _cleanRaw(String s) {
    var t = s;

    // unify newlines
    t = t.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

    // drop unsubscribe / not-you / marketing CTAs / app-download lines
    final dropLine = RegExp(
      r'^(?:not you\?.*|block\s*upi.*|unsubscribe.*|to\s+stop.*|download.*app.*|install.*app.*|visit\s+https?://.*|t&c.*|terms.*|offer.*|hurry.*|limited time.*)$',
      caseSensitive: false,
    );

    // drop balance/limit statements
    final dropBalance = RegExp(
      r'^(?:available\s*(?:credit|balance|limit).+|avl\s*(?:bal|limit).+|account\s*balance.+|statement.+)$',
      caseSensitive: false,
    );

    // drop OTP lines completely
    final dropOtp = RegExp(
      r'^.*\botp\b.*$',
      caseSensitive: false,
    );

    // drop long phone / cust-id / service numbers lines
    final dropPhones = RegExp(
      r'^(?:cust(?:omer)?\s*id[:\s]*\S+|call\s*\d{6,}.*|ph[:\s]*\d{6,}.*)$',
      caseSensitive: false,
    );

    // drop pure url lines
    final dropUrlOnly = RegExp(
      r'^\s*(?:https?://|www\.)\S+\s*$',
      caseSensitive: false,
    );

    // trim URLs inside lines to keep just domain (e.g., “bookmyshow.com”)
    t = t.replaceAllMapped(
      RegExp(
        r'https?://([a-z0-9\-\._]+\.[a-z]{2,})(?:/[^\s]*)?',
        caseSensitive: false,
      ),
      (m) => m[1]!,
    );

    // remove email addresses (keep domain in many SMS is noisy anyway)
    t = t.replaceAll(
      RegExp(
        r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b',
        caseSensitive: false,
      ),
      '',
    );

    // mask long numbers except last 4
    t = t.replaceAllMapped(RegExp(r'(\d{2,})(\d{4})\b'),
        (m) => 'XX' * (m[1]!.length ~/ 2) + m[2]!);

    // split + filter
    final lines = t
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .where((l) => !dropLine.hasMatch(l))
        .where((l) => !dropBalance.hasMatch(l))
        .where((l) => !dropOtp.hasMatch(l))
        .where((l) => !dropPhones.hasMatch(l))
        .where((l) => !dropUrlOnly.hasMatch(l))
        .toList();

    // compact “available limit/balance” fragments inside remaining lines
    final compactAvail = RegExp(
      r'\b(?:available|avl|avail|bal(?:ance)?)\b.*$',
      caseSensitive: false,
    );
    final compacted = lines
        .map((l) => l.replaceAll(compactAvail, '').trim())
        .where((l) => l.isNotEmpty)
        .toList();

    return compacted.join(' • ');
  }

  // ---------- tiny helpers ----------
  static String _collapseSpaces(String s) =>
      s.replaceAll(RegExp(r'\s+'), ' ').trim();

  static String _truncate(String s, int max) =>
      s.length <= max ? s : ('${s.substring(0, max - 1)}…');

  static String _fmtAmt(double v) {
    // Indian clustering without intl dep inside sanitizer
    final parts =
        v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 2).split('.');
    final n = parts[0];
    if (n.length <= 3) {
      return parts.length == 2 ? '$n.${parts[1]}' : n;
    }
    final head = n.substring(0, n.length - 3);
    final tail = n.substring(n.length - 3);
    final headGrouped =
        head.replaceAll(RegExp(r'(\d)(?=(\d{2})+(?!\d))'), r'$1,');
    return parts.length == 2
        ? '$headGrouped,$tail.${parts[1]}'
        : '$headGrouped,$tail';
  }

  static String _shortRef(String r) => (r.length <= 12)
      ? r
      : '${r.substring(0, 4)}…${r.substring(r.length - 4)}';

  static String _firstSentence(String s) {
    final i = s.indexOf(RegExp(r'[.!?]'));
    return i == -1 ? s : s.substring(0, i + 1);
  }

  static int _countRemoved(String raw, String cleaned) {
    final rawLines = raw
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .split('\n')
        .where((l) => l.trim().isNotEmpty)
        .length;
    final cleanLines =
        cleaned.split('•').where((l) => l.trim().isNotEmpty).length;
    return math.max(0, rawLines - cleanLines);
  }
}
