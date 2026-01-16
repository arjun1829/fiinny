import 'models/ocr_friend_model.dart';
import 'models/ocr_group_model.dart';

class SplitwiseParser {
  static OcrGroup parse(String ocrText) {
    // Try to detect group name (first non-empty line before member lines)
    final lines = ocrText.split('\n');
    String? groupName;
    final List<OcrFriend> members = [];

    for (final line in lines) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;
      // Example patterns: "Shreya owes you ₹ 164.50" or "Utkarsh A. you owe ₹ 843.67"
      final match = RegExp(r'^([\w\s\.\-]+) (owes you|you owe) ₹\s?([0-9\.,]+)').firstMatch(trimmed);
      if (match != null) {
        final String name = match.group(1)!.trim();
        final String type = match.group(2)!;
        final double amount = double.tryParse(match.group(3)!.replaceAll(',', '')) ?? 0;
        final double signedAmount = type == "owes you" ? amount : -amount;
        members.add(OcrFriend(name: name, balance: signedAmount));
      } else if (groupName == null && trimmed.length < 40 && !trimmed.contains("you owe") && !trimmed.contains("owes you")) {
        // Heuristic: Use first short line as group name if it doesn't look like a member line
        groupName = trimmed;
      }
    }

    return OcrGroup(
      groupName: groupName ?? "Imported Group",
      members: members,
    );
  }
}
