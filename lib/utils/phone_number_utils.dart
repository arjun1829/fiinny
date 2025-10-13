const String kDefaultCountryCode = '+91';
const List<String> kSupportedCountryCodes = <String>[
  '+91', // India
  '+1',  // USA/Canada
  '+44', // UK
  '+84', // Vietnam
  '+81', // Japan
];

String digitsOnly(String input) => input.replaceAll(RegExp(r'[^0-9]'), '');

String _normalizeCountryCode(String code) {
  final trimmed = code.trim();
  if (trimmed.isEmpty) return kDefaultCountryCode;
  final normalized = trimmed.startsWith('+') ? trimmed : '+$trimmed';
  final digits = digitsOnly(normalized);
  return digits.isEmpty ? kDefaultCountryCode : '+$digits';
}

/// Tries to determine the most likely country code for [phone].
String inferCountryCode(String phone, {String fallback = kDefaultCountryCode}) {
  final sanitized = phone.trim();
  if (sanitized.isEmpty) return _normalizeCountryCode(fallback);

  final digits = digitsOnly(sanitized);
  for (final code in kSupportedCountryCodes) {
    final codeDigits = digitsOnly(code);
    if (digits.startsWith(codeDigits) && codeDigits.isNotEmpty) {
      return _normalizeCountryCode(code);
    }
  }

  if (sanitized.startsWith('+') && digits.isNotEmpty) {
    final length = digits.length >= 3 ? 3 : digits.length;
    if (length > 0) {
      return '+${digits.substring(0, length)}';
    }
  }

  return _normalizeCountryCode(fallback);
}

/// Normalizes [raw] to an E.164 string (e.g. "+911234567890").
String normalizeToE164(String raw, {String fallbackCountryCode = kDefaultCountryCode}) {
  var sanitized = raw.trim();
  if (sanitized.isEmpty) return '';

  sanitized = sanitized.replaceAll(RegExp(r'[^0-9+]'), '');
  if (sanitized.isEmpty) return '';

  if (sanitized.startsWith('+')) {
    final digits = digitsOnly(sanitized).replaceFirst(RegExp(r'^0+'), '');
    return digits.isEmpty ? '' : '+$digits';
  }

  final digits = digitsOnly(sanitized).replaceFirst(RegExp(r'^0+'), '');
  if (digits.isEmpty) return '';

  final fallback = digitsOnly(_normalizeCountryCode(fallbackCountryCode));
  if (fallback.isEmpty) {
    return '+$digits';
  }
  return '+$fallback$digits';
}

class PhoneParseResult {
  const PhoneParseResult({required this.countryCode, required this.localDigits});

  final String countryCode;
  final String localDigits;

  String get e164 =>
      localDigits.isEmpty ? normalizeToE164(countryCode) : '$countryCode$localDigits';
}

/// Splits [raw] (any format) into a [PhoneParseResult].
PhoneParseResult splitPhone(String raw, {String fallbackCountryCode = kDefaultCountryCode}) {
  final e164 = normalizeToE164(raw, fallbackCountryCode: fallbackCountryCode);
  if (e164.isEmpty) {
    return PhoneParseResult(
      countryCode: _normalizeCountryCode(fallbackCountryCode),
      localDigits: '',
    );
  }

  final digits = digitsOnly(e164);
  for (final code in kSupportedCountryCodes) {
    final codeDigits = digitsOnly(code);
    if (codeDigits.isEmpty) continue;
    if (digits.startsWith(codeDigits)) {
      final local = digits.substring(codeDigits.length);
      return PhoneParseResult(
        countryCode: _normalizeCountryCode(code),
        localDigits: local,
      );
    }
  }

  final ccLength = digits.length >= 3 ? 3 : digits.length;
  final countryCode = ccLength > 0 ? '+${digits.substring(0, ccLength)}' : _normalizeCountryCode(fallbackCountryCode);
  final local = ccLength > 0 ? digits.substring(ccLength) : digits;
  return PhoneParseResult(
    countryCode: _normalizeCountryCode(countryCode),
    localDigits: local,
  );
}
