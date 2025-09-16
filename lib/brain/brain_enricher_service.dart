// lib/brain/brain_enricher_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import 'fiinny_brain_parser.dart';
import 'brain_constants.dart';

class BrainEnricherService {
  Map<String, dynamic> buildExpenseBrainUpdate(ExpenseItem e) {
    final br = FiinnyBrainParser.parseExpense(
      amount: e.amount, note: e.note, date: e.date,
      cardLast4: e.cardLast4, type: e.type,
    );
    return {
      if (br.category != null) 'category': br.category,
      if (br.label != null) 'label': br.label,
      'confidence': br.confidence,
      'tags': br.tags,
      'brainMeta': br.meta,
      'brainVersion': kBrainVersion,
      'brainParsedAt': FieldValue.serverTimestamp(),
    };
  }

  Map<String, dynamic> buildIncomeBrainUpdate(IncomeItem i) {
    final br = FiinnyBrainParser.parseIncome(
      amount: i.amount, note: i.note, source: i.source, date: i.date,
    );
    return {
      if (br.category != null) 'category': br.category,
      if (br.label != null) 'label': br.label,
      'confidence': br.confidence,
      'tags': br.tags,
      'brainMeta': br.meta,
      'brainVersion': kBrainVersion,
      'brainParsedAt': FieldValue.serverTimestamp(),
    };
  }
}
