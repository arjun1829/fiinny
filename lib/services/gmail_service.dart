import 'dart:convert';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:googleapis/gmail/v1.dart' as gmail;
import '../models/transaction_item.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';

class GmailService {
  static final _scopes = [
    gmail.GmailApi.gmailReadonlyScope,
  ];

  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: _scopes);
  GoogleSignInAccount? _currentUser;

  static const Map<String, String> keywordCategoryMap = {
    "credit card": "Credit Card",
    "debit card": "Debit Card",
    // Add more as needed
  };

  String _guessCategory(String text) {
    final lower = text.toLowerCase();
    for (final entry in keywordCategoryMap.entries) {
      if (lower.contains(entry.key)) return entry.value;
    }
    return "Other";
  }

  String? _extractCardLast4(String text) {
    final regex = RegExp(r'(?:ending|xx|XXXX)\s?(\d{4})', caseSensitive: false);
    final match = regex.firstMatch(text);
    return match != null ? match.group(1) : null;
  }

  // --- MAIN FETCH & STORE LOGIC ---
  Future<List<TransactionItem>> fetchAndStoreTransactionsFromGmail(String userId) async {
    _currentUser = await _googleSignIn.signIn();
    if (_currentUser == null) throw Exception("Sign in failed");

    final authHeaders = await _currentUser!.authHeaders;
    final authenticateClient = _GoogleAuthClient(authHeaders);

    final gmailApi = gmail.GmailApi(authenticateClient);

    // Fetch latest 100 emails (targeting banking, cards, etc.)
    final messages = await gmailApi.users.messages.list(
      'me',
      maxResults: 100,
      q: "bank OR transaction OR credited OR debited OR purchase OR spent OR withdrawn OR UPI OR payment OR credit card OR statement OR due",
    );

    List<TransactionItem> transactions = [];
    final Set<String> seen = {}; // For deduplication

    if (messages.messages != null) {
      for (var message in messages.messages!) {
        final msg = await gmailApi.users.messages.get('me', message.id!);
        final snippet = msg.snippet ?? '';
        final date = DateTime.fromMillisecondsSinceEpoch(
            int.tryParse(msg.internalDate ?? '0') ?? DateTime.now().millisecondsSinceEpoch);

        // --- Deduplication key: amount|date|type ---
        double? amount = _extractAmount(snippet);
        String? dedupType = _deduceTransactionType(snippet);

        if (amount != null && dedupType != null) {
          String dedupKey = '${amount.toStringAsFixed(2)}|${date.millisecondsSinceEpoch}|$dedupType';
          if (seen.contains(dedupKey)) continue;
          seen.add(dedupKey);
        }

        // --- Credit Card Bill Statement ---
        if (_isCreditCardBill(snippet)) {
          final billAmount = _extractBillAmount(snippet);
          final last4 = _extractCardLast4(snippet);
          if (billAmount != null) {
            final expense = ExpenseItem(
              id: '',
              type: "Credit Card Bill",
              amount: billAmount,
              note: snippet,
              date: date,
              friendIds: [],
              groupId: null,
              payerId: userId,
              cardType: "Credit Card",
              cardLast4: last4,
              isBill: true,
            );
            await ExpenseService().addExpense(userId, expense);
            continue;
          }
        }

        // --- Credit Card Spend ---
        if (_isCreditCardSpend(snippet)) {
          final spendAmount = _extractAmount(snippet);
          final last4 = _extractCardLast4(snippet);
          if (spendAmount != null) {
            final expense = ExpenseItem(
              id: '',
              type: "Credit Card",
              amount: spendAmount,
              note: snippet,
              date: date,
              friendIds: [],
              groupId: null,
              payerId: userId,
              cardType: "Credit Card",
              cardLast4: last4,
              isBill: false,
            );
            await ExpenseService().addExpense(userId, expense);
            continue;
          }
        }

        // --- Other Debit/Credit ---
        String? detectedType = _deduceTransactionType(snippet);

        if (detectedType != null) {
          final cat = _guessCategory(snippet);

          // Build transaction object
          final transaction = TransactionItem(
            type: detectedType == "credit"
                ? TransactionType.credit
                : TransactionType.debit,
            amount: amount ?? 0.0,
            note: snippet,
            date: date,
            category: cat,
          );
          // Dedup key already checked above
          transactions.add(transaction);

          if (detectedType == "debit") {
            final expense = ExpenseItem(
              id: '',
              type: cat,
              amount: amount ?? 0.0,
              note: snippet,
              date: date,
              friendIds: [],
              groupId: null,
              payerId: userId,
              cardType: cat.contains("Credit Card")
                  ? "Credit Card"
                  : cat.contains("Debit Card")
                  ? "Debit Card"
                  : null,
              cardLast4: _extractCardLast4(snippet),
              isBill: false,
            );
            await ExpenseService().addExpense(userId, expense);
          } else if (detectedType == "credit") {
            final income = IncomeItem(
              id: '',
              type: cat,
              amount: amount ?? 0.0,
              note: snippet,
              date: date,
              source: 'Email',
            );
            await IncomeService().addIncome(userId, income);
          }
        }
      }
    }
    return transactions;
  }

  // --- Helper: Detect Credit Card Bill Statement ---
  bool _isCreditCardBill(String text) {
    return text.contains(RegExp(r'(statement generated|total due|bill amount)', caseSensitive: false))
        && text.contains(RegExp(r'credit card', caseSensitive: false));
  }

  // --- Helper: Detect Credit Card Spend ---
  bool _isCreditCardSpend(String text) {
    return text.contains(RegExp(r'(spent|purchase|charged|payment made|debited)', caseSensitive: false))
        && text.contains(RegExp(r'credit card', caseSensitive: false));
  }

  // --- Helper: Extract Amount for Bill ---
  double? _extractBillAmount(String text) {
    final regex = RegExp(r'(?:Total\sDue|Bill\sAmount|Amount\sDue)[:\s]*[INR|Rs\.|₹]*\s?([\d,]+(?:\.\d{1,2})?)', caseSensitive: false);
    final match = regex.firstMatch(text);
    if (match != null) {
      return double.tryParse(match.group(1)!.replaceAll(",", ""));
    }
    return null;
  }

  double? _extractAmount(String text) {
    final regex = RegExp(r'(?:INR|Rs\.?|₹|\$|USD|EUR|GBP|AED)\s?([\d,]+(?:\.\d{1,2})?)', caseSensitive: false);
    final match = regex.firstMatch(text);
    if (match != null) {
      return double.tryParse(match.group(1)!.replaceAll(",", ""));
    }
    return null;
  }

  // --- Helper: Detect and strictly label transaction type ---
  String? _deduceTransactionType(String text) {
    final isDebit = text.contains(RegExp(
        r'(debited|spent|withdrawn|purchase|paid|transferred|used for payment|deducted|ATM withdrawal)',
        caseSensitive: false));
    final isCredit = text.contains(RegExp(
        r'(credited|received|deposited|salary|refund|interest credited|cashback)',
        caseSensitive: false));

    if (isDebit && !isCredit) return "debit";
    if (isCredit && !isDebit) return "credit";
    if (isDebit && isCredit) {
      final debitIdx = text.indexOf(RegExp(
          r'(debited|spent|withdrawn|purchase|paid|transferred|used for payment|deducted|ATM withdrawal)', caseSensitive: false));
      final creditIdx = text.indexOf(RegExp(
          r'(credited|received|deposited|salary|refund|interest credited|cashback)', caseSensitive: false));
      if (debitIdx >= 0 && creditIdx >= 0) {
        return (debitIdx < creditIdx) ? "debit" : "credit";
      }
    }
    return null; // Unknown
  }

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    _currentUser = null;
  }
}

class _GoogleAuthClient extends http.BaseClient {
  final Map<String, String> _headers;
  final http.Client _client = http.Client();

  _GoogleAuthClient(this._headers);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    return _client.send(request..headers.addAll(_headers));
  }
}
