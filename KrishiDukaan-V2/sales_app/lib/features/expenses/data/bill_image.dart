import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

/// A bill photo held in memory, ready to upload.
///
/// Deliberately bytes rather than a `dart:io` File: `dart:io` does not exist on
/// web, so a File-typed bill would make the whole app impossible to compile for
/// the browser. `image_picker` hands back an [XFile] on every platform, and
/// reading it once here means the same value can both render the preview and be
/// uploaded, with no second read and no platform branch at the call sites.
class BillImage {
  final Uint8List bytes;
  final String contentType;

  /// File extension including the dot, derived from the content type so the
  /// object in Storage is named for what it actually is.
  final String extension;

  const BillImage({
    required this.bytes,
    required this.contentType,
    required this.extension,
  });

  /// Matches the `maxWidth`/`imageQuality` values already passed to
  /// `ImagePicker.pickImage` at both call sites.
  static const _maxDimension = 1600;
  static const _jpegQuality = 75;

  static Future<BillImage> fromXFile(XFile file) async {
    final bytes = await file.readAsBytes();

    // image_picker reports a mimeType on web; on mobile it is usually null, but
    // the picker re-encodes to JPEG whenever imageQuality is set, so falling
    // back to the file extension and then to JPEG is accurate in practice.
    final mime = file.mimeType ?? _mimeFromName(file.name);

    final compressed = _compress(bytes);
    if (compressed == null) {
      // Decode failed (corrupt/unsupported image) or the source was already
      // smaller than a JPEG re-encode would produce — use the original bytes
      // rather than risk shipping a larger or broken file.
      return BillImage(
        bytes: bytes,
        contentType: mime,
        extension: _extensionFor(mime),
      );
    }
    return BillImage(
      bytes: compressed,
      contentType: 'image/jpeg',
      extension: '.jpg',
    );
  }

  /// Re-encodes [bytes] as a resized JPEG, or returns null when that would not
  /// actually help.
  ///
  /// image_picker's own `maxWidth`/`imageQuality` already resize on mobile
  /// (native platform channels) and on web for JPEG/WebP sources. But
  /// `canvas.toBlob` — what the web plugin uses under the hood — only honours
  /// its quality argument for JPEG/WebP output; a PNG (or any other lossless
  /// format) source is re-encoded losslessly regardless of the quality value,
  /// so it can come back the same size or larger. Re-encoding here, after the
  /// picker's own resize, guarantees a real compressed JPEG independent of the
  /// source format or platform.
  static Uint8List? _compress(Uint8List bytes) {
    try {
      final decoded = img.decodeImage(bytes);
      if (decoded == null) return null;

      final resized = decoded.width > _maxDimension
          ? img.copyResize(decoded, width: _maxDimension)
          : decoded;
      final jpeg = img.encodeJpg(resized, quality: _jpegQuality);

      // Verify the re-encode is actually smaller rather than assuming it —
      // a tiny or already-optimized source can grow under JPEG re-encoding.
      return jpeg.length < bytes.length ? jpeg : null;
    } catch (_) {
      return null;
    }
  }

  static String _mimeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  static String _extensionFor(String contentType) {
    switch (contentType) {
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/heic':
        return '.heic';
      default:
        return '.jpg';
    }
  }
}
