class FxFlags {
  FxFlags._();

  /// Enable the redesigned Settle Up V2 flow.
  static bool settleUpV2 = false;

  /// Experimental: surface network-wide settle suggestions.
  static bool settleSmart = false;

  /// Toggle UPI deeplink experiments.
  static bool upiEnabled = false;

  /// Prefill group expenses with saved weight presets.
  static bool defaultSplitPresets = false;

  /// Allow manual itemization flow inside add expense.
  static bool itemizationBeta = false;

  /// Future scaffolds (kept for parity with design docs).
  static bool reminderRules = false;
  static bool fxBeta = false;

  /// Toggle writing canonical group expense mirrors.
  static bool groupCanonicalWrites = true;
}
