import '../models/transaction_model.dart';
import '../models/expense_item.dart';
import '../services/categorization/category_rules.dart';

class TransactionClassification {
  final String category;
  final String subcategory;
  final bool isIncome;
  final bool isTransfer;
  final bool isSalary;
  final double confidence;
  final List<String> tags;

  const TransactionClassification({
    required this.category,
    required this.subcategory,
    required this.isIncome,
    required this.isTransfer,
    required this.isSalary,
    required this.confidence,
    required this.tags,
  });

  Map<String, dynamic> toJson() => {
    'category': category,
    'subcategory': subcategory,
    'isIncome': isIncome,
    'isTransfer': isTransfer,
    'isSalary': isSalary,
    'confidence': confidence,
    'tags': tags,
  };
}

class TransactionEngine {
  static TransactionClassification analyze(dynamic t) {
    double amount = 0.0;
    String type = '';
    String note = '';
    
    // Extract common fields
    if (t is TransactionModel) {
      amount = t.amount;
      type = t.type;
      note = t.note ?? '';
    } else if (t is ExpenseItem) {
      amount = t.amount;
      type = t.type;
      note = t.note;
    } else {
      return const TransactionClassification(
        category: 'Unknown',
        subcategory: 'Unknown',
        isIncome: false,
        isTransfer: false,
        isSalary: false,
        confidence: 0,
        tags: [],
      );
    }

    // Normalize
    final normalizedNote = note.trim().toLowerCase();
    final normalizedType = type.trim().toLowerCase();

    // 1. Detect Transfer (must happen FIRST to exclude from income/expense)
    final bool isTransfer = _detectTransfer(normalizedNote, normalizedType);
    
    // 2. Detect Income vs Expense (skip if transfer)
    bool isIncome = false;
    if (!isTransfer) {
      if (t is TransactionModel) {
        isIncome = normalizedType == 'income';
      } else if (t is ExpenseItem) {
        isIncome = normalizedType.contains('credit') || 
                   normalizedType.contains('deposit') || 
                   normalizedType.contains('income') ||
                   normalizedType.contains('refund');
      }
    }

    // 3. Categorization (transfers get 'Fund Transfers' category)
    final catGuess = CategoryRules.categorizeMerchant(note, note);

    // 4. Salary Detection with confidence
    bool isSalary = false;
    double salaryConfidence = 0.0;
    if (isIncome && !isTransfer) {
      final salaryResult = _detectSalary(normalizedNote, amount);
      isSalary = salaryResult['isSalary'] as bool;
      salaryConfidence = salaryResult['confidence'] as double;
    }

    // Collect tags
    final tags = List<String>.from(catGuess.tags);
    if (isSalary) tags.add('salary');
    if (isIncome) tags.add('income');
    if (isTransfer) tags.add('transfer');

    // Final confidence is min of category confidence and salary confidence (if salary)
    double finalConfidence = catGuess.confidence;
    if (isSalary && salaryConfidence > 0) {
      finalConfidence = (catGuess.confidence + salaryConfidence) / 2;
    }

    return TransactionClassification(
      category: catGuess.category,
      subcategory: catGuess.subcategory,
      isIncome: isIncome,
      isTransfer: isTransfer,
      isSalary: isSalary,
      confidence: finalConfidence.clamp(0.0, 1.0),
      tags: tags,
    );
  }

  // Transfer detection logic
  static bool _detectTransfer(String note, String type) {
    // UPI to self/friend
    if (note.contains('upi') && (note.contains('transfer') || note.contains('sent'))) {
      return true;
    }
    // IMPS/NEFT/RTGS
    if (note.contains('imps') || note.contains('neft') || note.contains('rtgs')) {
      return true;
    }
    // Explicit transfer type
    if (type.contains('transfer')) {
      return true;
    }
    return false;
  }

  // Salary detection with confidence scoring
  static Map<String, dynamic> _detectSalary(String note, double amount) {
    bool isSalary = false;
    double confidence = 0.0;

    // Keyword matching (weighted)
    int keywordScore = 0;
    if (note.contains('salary')) keywordScore += 3;
    if (note.contains('sal')) keywordScore += 2;
    if (note.contains('payroll')) keywordScore += 3;
    if (note.contains('credited')) keywordScore += 1;
    
    // Amount heuristic (no hardcoded threshold, just scoring)
    // TODO: This should be replaced with historical pattern analysis
    // For now: amounts > 10k get higher confidence
    double amountScore = 0.0;
    if (amount > 50000) {
      amountScore = 0.4;
    } else if (amount > 20000) {
      amountScore = 0.3;
    } else if (amount > 10000) {
      amountScore = 0.2;
    }

    // Combine scores
    if (keywordScore >= 3) {
      isSalary = true;
      confidence = (0.6 + amountScore).clamp(0.0, 1.0);
    } else if (keywordScore >= 2 && amountScore > 0.2) {
      isSalary = true;
      confidence = (0.5 + amountScore * 0.5).clamp(0.0, 1.0);
    }

    return {'isSalary': isSalary, 'confidence': confidence};
  }
}
