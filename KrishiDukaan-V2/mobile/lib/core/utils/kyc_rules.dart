/// Seller KYC: what we ask for, and the checks on it.
///
/// Kept short on purpose (sellers abandon long forms): bank account (holder,
/// number typed twice, IFSC; bank and branch filled in from the IFSC), GST
/// number if they have one, PAN (taken from the GST number, which contains
/// it, or typed), and one licence upload.
///
/// Same rules as the website's app/lib/kyc.ts; change them together.
library;

/// RBI IFSC format: 4 letters, a literal 0, then 6 letters or digits.
final ifscRe = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');

/// Indian account numbers run 9–18 digits depending on the bank.
final accountRe = RegExp(r'^\d{9,18}$');

/// Account holder name as the bank has it: letters (any script), spaces and
/// . , ' & ( ) / - only ("M/s Sai Agro"), at least two letters, no digits. Same rule as app/lib/kyc.ts.
bool isValidHolderName(String raw) {
  final t = raw.trim();
  if (t.length < 2) return false;
  if (!RegExp(r"^[\p{L}\p{M} .,'&()/-]+$", unicode: true).hasMatch(t)) return false;
  return RegExp(r'\p{L}', unicode: true).allMatches(t).length >= 2;
}
final panRe = RegExp(r'^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$');
final gstinRe = RegExp(r'^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

/// The one document still required.
const requiredKycDoc = 'trade_license';

const _b36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/// GSTIN check character (the 15th), from the first 14.
String gstinCheckChar(String first14) {
  var sum = 0;
  for (var i = 0; i < 14; i++) {
    final p = _b36.indexOf(first14[i]) * (i.isEven ? 1 : 2);
    sum += p ~/ 36 + p % 36;
  }
  return _b36[(36 - sum % 36) % 36];
}

/// Format and check character, so one mistyped character is caught.
bool isValidGstin(String raw) {
  final g = raw.trim().toUpperCase();
  return gstinRe.hasMatch(g) && gstinCheckChar(g.substring(0, 14)) == g[14];
}

/// The PAN inside a valid GSTIN, else null.
String? panFromGstin(String raw) {
  final g = raw.trim().toUpperCase();
  if (!isValidGstin(g)) return null;
  final pan = g.substring(2, 12);
  return panRe.hasMatch(pan) ? pan : null;
}

bool isValidPan(String raw) => panRe.hasMatch(raw.trim().toUpperCase());

enum KycItem { bank, pan, licence }

const kycItemLabel = {
  KycItem.bank: 'Bank details',
  KycItem.pan: 'PAN or GST number',
  KycItem.licence: 'Licence',
};

/// What is still missing before the account can be verified.
List<KycItem> kycMissing({
  String? accountHolderName,
  bool hasAccountNumber = false,
  String? ifsc,
  String? pan,
  String? gstin,
  Iterable<String> documents = const [],
}) {
  final out = <KycItem>[];
  final bankOk =
      (accountHolderName ?? '').trim().length > 1 &&
      hasAccountNumber &&
      ifscRe.hasMatch((ifsc ?? '').toUpperCase());
  if (!bankOk) out.add(KycItem.bank);
  final p = (pan ?? '').isNotEmpty ? pan! : (panFromGstin(gstin ?? '') ?? '');
  if (!isValidPan(p)) out.add(KycItem.pan);
  if (!documents.contains(requiredKycDoc)) out.add(KycItem.licence);
  return out;
}
