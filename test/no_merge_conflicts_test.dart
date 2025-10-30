import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  const markers = ['<<<<<<<', '=======', '>>>>>>>'];
  final directories = [Directory('lib'), Directory('test')];

  test('project is free from merge conflict markers', () {
    final hits = <String>[];

    for (final directory in directories) {
      if (!directory.existsSync()) continue;
      for (final entity in directory.listSync(recursive: true)) {
        if (entity is! File) continue;
        if (!entity.path.endsWith('.dart')) continue;

        final lines = entity.readAsLinesSync();
        for (var index = 0; index < lines.length; index++) {
          final line = lines[index];
          if (markers.any(line.contains)) {
            hits.add('${entity.path}:${index + 1}');
          }
        }
      }
    }

    expect(
      hits,
      isEmpty,
      reason: 'Merge conflict markers were found:\n${hits.join('\n')}',
    );
  });
}
