import 'dart:async';
import '../../services/gmail_service.dart';

Future<void> main(List<String> args) async {
  if (args.isEmpty) {
    print("❌ User ID is required");
    return;
  }

  final userId = args[0];
  print("🔄 Starting Gmail sync for $userId...");

  final gmailService = GmailService();

  try {
    await gmailService.fetchAndStoreTransactionsFromGmail(userId);
    print("✅ Gmail sync completed for $userId.");
  } catch (e, st) {
    print("❌ Error during sync for $userId: $e");
    print(st);
  }
}
