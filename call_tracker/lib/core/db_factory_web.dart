import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi_web/sqflite_ffi_web.dart';

/// Browser: SQLite compiled to WebAssembly, stored in the browser (IndexedDB).
void useBrowserDatabaseIfNeeded() {
  databaseFactory = databaseFactoryFfiWebNoWebWorker;
}
