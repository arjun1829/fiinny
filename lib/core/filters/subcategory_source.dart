typedef SubcatFetcher = Future<List<String>> Function(String category);

class SubcategorySource {
  SubcategorySource._();
  static final instance = SubcategorySource._();

  /// Temporary simple map. Replace with your rules in a later step.
  Future<List<String>> getSubcategories(String category) async {
    final c = category.trim().toLowerCase();
    if (c == 'food') {
      return ['Dining', 'Groceries', 'Snacks'];
    }
    if (c == 'travel') {
      return ['Cabs', 'Flights', 'Trains', 'Fuel'];
    }
    if (c == 'bills') {
      return ['Electricity', 'Internet', 'Mobile', 'DTH'];
    }
    if (c == 'shopping') {
      return ['Online', 'Offline', 'Electronics', 'Fashion'];
    }
    return const <String>[];
  }
}
