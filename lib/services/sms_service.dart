import '../models/credit_card_model.dart';
import '../models/bill_model.dart';

class SMSParserService {
  // Existing SMS parsing logic...

  // NEW: Parse credit card due SMS
  List<CreditCardModel> parseCreditCardDueSMS(List<String> smsBodies) {
    // TODO: regex for "Due on XXXX", "Min Due", etc.
    return [];
  }

  // NEW: Parse bill/EMI/rent SMS
  List<BillModel> parseBillSMS(List<String> smsBodies) {
    // TODO: regex for rent/utility/EMI reminders
    return [];
  }
}
