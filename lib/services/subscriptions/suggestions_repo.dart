class SuggestionsRepo {
  // simple in-memory store; replace with shared prefs / firestore later
  static final Set<String> _dismissed = <String>{};

  Future<void> dismiss(String id) async {
    _dismissed.add(id);
  }

  Future<Set<String>> getDismissedIds() async {
    return _dismissed;
  }
}
