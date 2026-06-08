class PhoneUtils {
  PhoneUtils._();

  /// Normalizes any Indian phone input to E164 format: +91XXXXXXXXXX
  /// Throws [FormatException] if input is not a valid 10-digit Indian number.
  static String normalize(String input) {
    final digits = input.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('91') && digits.length == 12) {
      return '+$digits';
    }
    if (digits.length == 10) {
      return '+91$digits';
    }
    throw FormatException('Invalid phone number: $input');
  }

  /// Returns true if the string is a valid 10-digit Indian mobile number.
  static bool isValid(String input) {
    final digits = input.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 10) return RegExp(r'^[6-9]\d{9}$').hasMatch(digits);
    if (digits.length == 12 && digits.startsWith('91')) {
      return RegExp(r'^91[6-9]\d{9}$').hasMatch(digits);
    }
    return false;
  }

  /// Strips +91 prefix for display (returns 10-digit number).
  static String toDisplay(String e164) {
    if (e164.startsWith('+91') && e164.length == 13) {
      return e164.substring(3);
    }
    return e164;
  }
}
