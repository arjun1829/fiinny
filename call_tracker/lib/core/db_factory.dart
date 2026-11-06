// Picks the SQLite engine: the phone's own on Android, an in-browser one
// (sqflite_common_ffi_web, files in web/) when the app runs in a browser for
// testing. The browser package can't be compiled for Android, hence the
// conditional import.
export 'db_factory_stub.dart' if (dart.library.js_interop) 'db_factory_web.dart';
