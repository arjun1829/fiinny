// lib/stubs/sqflite_stub.dart

abstract class Database {
  Future<void> execute(String sql, [List<Object?>? arguments]);
  Future<int> insert(String table, Map<String, Object?> values,
      {String? nullColumnHack, ConflictAlgorithm? conflictAlgorithm});
  Future<List<Map<String, Object?>>> query(String table,
      {bool? distinct,
      List<String>? columns,
      String? where,
      List<Object?>? whereArgs,
      String? groupBy,
      String? having,
      String? orderBy,
      int? limit,
      int? offset});
}

Future<Database> openDatabase(
  String path, {
  int? version,
  OnDatabaseConfigureFn? onConfigure,
  OnDatabaseCreateFn? onCreate,
  OnDatabaseVersionChangeFn? onUpgrade,
  OnDatabaseVersionChangeFn? onDowngrade,
  OnDatabaseOpenFn? onOpen,
  bool? readOnly,
  bool? singleInstance,
}) async {
  // Return a dummy implementation
  return _FakeDatabase();
}

Future<String> getDatabasesPath() async => '';

typedef OnDatabaseCreateFn = Future<void> Function(Database db, int version);
typedef OnDatabaseConfigureFn = Future<void> Function(Database db);
typedef OnDatabaseVersionChangeFn = Future<void> Function(
    Database db, int oldVersion, int newVersion);
typedef OnDatabaseOpenFn = Future<void> Function(Database db);

enum ConflictAlgorithm {
  rollback,
  abort,
  fail,
  ignore,
  replace,
}

class _FakeDatabase implements Database {
  @override
  Future<void> execute(String sql, [List<Object?>? arguments]) async {}

  @override
  Future<int> insert(String table, Map<String, Object?> values,
          {String? nullColumnHack,
          ConflictAlgorithm? conflictAlgorithm}) async =>
      0;

  @override
  Future<List<Map<String, Object?>>> query(String table,
          {bool? distinct,
          List<String>? columns,
          String? where,
          List<Object?>? whereArgs,
          String? groupBy,
          String? having,
          String? orderBy,
          int? limit,
          int? offset}) async =>
      [];
}
