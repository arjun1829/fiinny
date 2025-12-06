import 'package:cloud_firestore/cloud_firestore.dart';

class FriendTool {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> addFriend(String input, String userId) async {
    // "Add friend Rahul"
    final name = input.replaceAll(RegExp(r'(add|friend|new)', caseSensitive: false), '').trim();
    
    if (name.isEmpty) return "What's their name?";

    await _firestore
        .collection('users')
        .doc(userId)
        .collection('friends')
        .add({
      'name': name,
      'createdAt': FieldValue.serverTimestamp(),
    });

    return "Added $name to your contacts.";
  }

  Future<String> createGroup(String input, String userId) async {
    // "Create group Goa Trip"
    final name = input.replaceAll(RegExp(r'(create|group)', caseSensitive: false), '').trim();

    if (name.isEmpty) return "What should I name the group?";

    await _firestore
        .collection('users')
        .doc(userId)
        .collection('groups')
        .add({
      'name': name,
      'createdAt': FieldValue.serverTimestamp(),
      'members': [], // Just user for now
    });

    return "Created group '$name'.";
  }

  Future<String> addToGroup(String input, String userId) async {
    // "Add expense 500 to Goa Trip"
    // Extract group name
    final groupNameRegex = RegExp(r'to (.+)$');
    final match = groupNameRegex.firstMatch(input);
    if (match == null) return "Which group?";
    
    String groupName = match.group(1)!.trim();

    // Fetch all user groups to fuzzy match
    final snapshot = await _firestore
        .collection('users')
        .doc(userId)
        .collection('groups')
        .get();
    
    final groups = snapshot.docs.map((d) => d['name'] as String).toList();
    final bestMatch = _findBestMatch(groupName, groups);

    if (bestMatch != null) {
      // If close enough, use it
      // Logic to actually add expense would go here (calling ExpenseTool with group ID)
      return "Found group '$bestMatch' (matched from '$groupName'). (Expense logic pending Phase 9 completion)";
    }

    return "Could not find a group named '$groupName'. Did you mean one of: ${groups.join(', ')}?";
  }

  String? _findBestMatch(String input, List<String> candidates) {
    if (candidates.isEmpty) return null;
    
    String? best;
    int minDistance = 1000;
    
    for (var c in candidates) {
      int dist = _levenshtein(input.toLowerCase(), c.toLowerCase());
      if (dist < minDistance) {
        minDistance = dist;
        best = c;
      }
    }
    
    // Threshold: allow up to 3 typos
    return minDistance <= 3 ? best : null;
  }

  int _levenshtein(String s, String t) {
    if (s == t) return 0;
    if (s.isEmpty) return t.length;
    if (t.isEmpty) return s.length;

    List<int> v0 = List<int>.generate(t.length + 1, (i) => i);
    List<int> v1 = List<int>.filled(t.length + 1, 0);

    for (int i = 0; i < s.length; i++) {
      v1[0] = i + 1;
      for (int j = 0; j < t.length; j++) {
        int cost = (s.codeUnitAt(i) == t.codeUnitAt(j)) ? 0 : 1;
        v1[j + 1] = [v1[j] + 1, v0[j + 1] + 1, v0[j] + cost].reduce((a, b) => a < b ? a : b);
      }
      for (int j = 0; j < v0.length; j++) v0[j] = v1[j];
    }
    return v1[t.length];
  }
}

