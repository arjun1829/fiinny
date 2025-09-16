import 'dart:io';
import 'package:firebase_storage/firebase_storage.dart';

Future<TaskSnapshot> ioPutFile(Reference ref, String path, SettableMetadata meta) {
  return ref.putFile(File(path), meta);
}

Future<int> ioFileLength(String path) => File(path).length();
