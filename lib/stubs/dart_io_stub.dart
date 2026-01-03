// lib/stubs/dart_io_stub.dart

class File {
  final String path;
  File(this.path);

  Future<bool> exists() async => false;
  Future<void> delete() async {}
  // Add other methods as needed or leave empty/dummy
}

class Platform {
  static bool get isAndroid => false;
  static bool get isIOS => false;
  static bool get isMacOS => false;
  static bool get isWindows => false;
  static bool get isLinux => false;
  static bool get isFuchsia => false;

  static String get operatingSystem => 'web';
  // Add others if needed
}
