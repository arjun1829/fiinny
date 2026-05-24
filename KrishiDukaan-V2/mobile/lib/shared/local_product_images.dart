/// Maps a product name to a bundled local asset path using fuzzy matching.
/// Returns null when no local asset matches — caller should fall back to network.
library;

const _kAssetDir = 'asset/product-images/Product_Images';

// All filenames present in the asset folder.
const _kFiles = <String>[
  'Adama 2,4-D.jpg',
  'Aladin.jpg',
  'alika.jpg',
  'alliance.jpg',
  'amaze-xl.jpeg',
  'amistar-top.webp',
  'Ampligo.webp',
  'Biozyme.jpg',
  'bottle-1l-Photoroom.png',
  'bottle-3l-Photoroom.png',
  'bottle-5l-Photoroom.png',
  'Builder.png',
  'Calaris Xtra.jpeg',
  'clavengo.webp',
  'cymbush.jpg',
  'Decores.webp',
  'Evenso.jpeg',
  'fertistar.webp',
  'filia.webp',
  'Fusilade.jpg',
  'Fusion.jpg',
  'Glo-It.webp',
  'humi gold.png',
  'HUMIGROW.png',
  'Isabion.jpg',
  'Kaneem.webp',
  'Karate.jpg',
  'Kazoo.jpg',
  'Microla.png',
  'Nano Urea.webp',
  'NPK 151515.jpg',
  'NPK 202000.png',
  'NPK.jpeg',
  'NPK1.webp',
  'Power Plus.png',
  'Power Plus1.png',
  'Rosentra.webp',
  'Silicon.webp',
  'Sticker.jpg',
  'Sultan 505.jpg',
  'Tizom.jpeg',
  'Topas.jpg',
  'Vibrance Integral.webp',
];

// Lazy-init lookup table: normKey → filename.
Map<String, String>? _normMap;
Map<String, String> _getNormMap() {
  if (_normMap != null) return _normMap!;
  _normMap = {};
  for (final f in _kFiles) {
    final stem = f.replaceAll(RegExp(r'\.[^.]+$'), '');
    _normMap![_normKey(stem)] = f;
  }
  return _normMap!;
}

String _normKey(String s) => s
    .toLowerCase()
    .replaceAll(RegExp(r'[,\-:\.%]'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

String _compactKey(String s) =>
    s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

/// Returns the full asset path (e.g. `asset/product-images/.../Power Plus.png`)
/// or `null` when no local image matches [productName].
String? localAssetForProduct(String productName) {
  final map = _getNormMap();
  final kp = _normKey(productName);
  final cp = _compactKey(productName);

  // 1. Exact normalised match.
  if (map.containsKey(kp)) return '$_kAssetDir/${map[kp]}';

  // 2. Compact key (strips all punctuation — handles "NPK 15:15:15" ↔ "NPK 151515").
  for (final entry in map.entries) {
    if (_compactKey(entry.key) == cp && cp.length >= 4) {
      return '$_kAssetDir/${entry.value}';
    }
  }

  // Sort by key length desc so longer (more specific) keys are preferred.
  final sorted = map.entries.toList()
    ..sort((a, b) => b.key.length.compareTo(a.key.length));

  // 3. Prefix / suffix match.
  for (final e in sorted) {
    final kf = e.key;
    if (kp == kf) return '$_kAssetDir/${e.value}';
    if (kp.startsWith('$kf ') || kf.startsWith('$kp ')) {
      return '$_kAssetDir/${e.value}';
    }
  }

  // 4. All words of the file key appear in the product key.
  for (final e in sorted) {
    final words = e.key.split(' ').where((w) => w.isNotEmpty).toList();
    if (words.length >= 2 && words.every((w) => kp.contains(w))) {
      return '$_kAssetDir/${e.value}';
    }
  }

  return null;
}
