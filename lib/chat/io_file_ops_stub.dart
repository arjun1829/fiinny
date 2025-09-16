import 'package:firebase_storage/firebase_storage.dart';

Future<TaskSnapshot> ioPutFile(Reference ref, String path, SettableMetadata meta) {
  throw UnsupportedError('File uploads from local path are not supported on web');
}

Future<int> ioFileLength(String path) async => 0;
