// lib/services/ingest_filters.dart

/// Helpers to decide whether an SMS/email snippet looks like a real
/// financial transaction vs. promo/OTP/spam.
bool isLikelyPromo(String body) {
  final lower = body.toLowerCase();

  // Skip clear promotional keywords
  const promoKeywords = [
    "sale",
    "offer",
    "discount",
    "deal",
    "subscribe",
    "buy now",
    "limited time",
    "shopping",
    "amazon",
    "flipkart",
    "myntra",
    "ajio",
    "ola",
    "uber",
    "swiggy",
    "zomato",
    "dream11",
    "bookmyshow",
    "lottery",
    "jackpot",
  ];

  for (final kw in promoKeywords) {
    if (lower.contains(kw)) return true;
  }

  // SMS that contain links but no financial verbs
  if (RegExp(r'https?://').hasMatch(lower) &&
      !RegExp(r'(debited|credited|txn|payment|upi|imps|neft)',
          caseSensitive: false)
          .hasMatch(lower)) {
    return true;
  }

  return false;
}

bool looksLikeOtpOnly(String body) {
  final lower = body.toLowerCase();

  if (lower.contains("otp")) {
    final hasTxnVerb = RegExp(
      r'(debited|credited|txn|payment|upi|imps|neft|withdrawn|deposit)',
      caseSensitive: false,
    ).hasMatch(lower);
    if (!hasTxnVerb) return true;
  }
  return false;
}

/// Crude bank guesser — you can refine this with allowlists.
String? guessBankFromSms({String? address, required String body}) {
  final lower = (address ?? body).toLowerCase();

  if (lower.contains("hdfc")) return "HDFC";
  if (lower.contains("icici")) return "ICICI";
  if (lower.contains("sbi")) return "SBI";
  if (lower.contains("axis")) return "AXIS";
  if (lower.contains("kotak")) return "KOTAK";
  if (lower.contains("yesbank")) return "YES";
  if (lower.contains("indusind")) return "INDUSIND";
  if (lower.contains("pnb")) return "PNB";

  // fallback: null means unknown bank
  return null;
}
