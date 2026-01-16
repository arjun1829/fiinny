class CategoryMapper {
  Future<void> load() async {
    // TODO: Load rules from assets/enrich/categories.json
  }

  String mapCategory({String? merchant, required String fallback}) {
    // TODO: Implement ruling logic
    return fallback;
  }
}
