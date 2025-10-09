// lib/shims/shared_prefs_shim.dart
// Simple in-memory replacement for SharedPreferences.
// NOTE: This is NOT persistent. Good for compiling & quick testing.

class SharedPreferences {
  static SharedPreferences? _instance;
  final Map<String, Object?> _m = {};

  SharedPreferences._();

  static Future<SharedPreferences> getInstance() async {
    return _instance ??= SharedPreferences._();
  }

  // getters
  bool? getBool(String key) => _m[key] as bool?;
  int? getInt(String key) => _m[key] as int?;
  double? getDouble(String key) => _m[key] as double?;
  String? getString(String key) => _m[key] as String?;
  List<String>? getStringList(String key) =>
      (_m[key] is List) ? List<String>.from(_m[key] as List) : null;

  // setters (always return true like the real API)
  Future<bool> setBool(String key, bool value) async { _m[key] = value; return true; }
  Future<bool> setInt(String key, int value) async { _m[key] = value; return true; }
  Future<bool> setDouble(String key, double value) async { _m[key] = value; return true; }
  Future<bool> setString(String key, String value) async { _m[key] = value; return true; }
  Future<bool> setStringList(String key, List<String> value) async { _m[key] = List<String>.from(value); return true; }

  // maintenance
  bool containsKey(String key) => _m.containsKey(key);
  Set<String> getKeys() => _m.keys.toSet();
  Future<bool> remove(String key) async { _m.remove(key); return true; }
  Future<bool> clear() async { _m.clear(); return true; }
}
