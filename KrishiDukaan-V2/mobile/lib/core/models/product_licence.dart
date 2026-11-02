/// A manufacturer's selling licence for one product: the states it covers,
/// the licence document and its details. Stored on the product as `license`,
/// the same shape web writes (app/lib/product-licence.ts). Checkout only
/// sells the product online to delivery addresses in [states].
class ProductLicence {
  final List<String> states;
  final String? number;

  /// YYYY-MM-DD.
  final String? validUntil;

  /// {storagePath, fileName, contentType, size} — the document sits in the
  /// manufacturer's private `kyc/{phone}/` folder.
  final Map<String, dynamic>? file;

  const ProductLicence({this.states = const [], this.number, this.validUntil, this.file});

  static ProductLicence? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final states = raw['states'] is List
        ? (raw['states'] as List).map((e) => e.toString()).where((s) => s.isNotEmpty).toList()
        : <String>[];
    final f = raw['file'];
    return ProductLicence(
      states: states,
      number: (raw['number'] as String?)?.trim().isEmpty ?? true ? null : raw['number'] as String,
      validUntil: (raw['validUntil'] as String?)?.isEmpty ?? true ? null : raw['validUntil'] as String,
      file: f is Map && (f['storagePath'] ?? '').toString().isNotEmpty ? Map<String, dynamic>.from(f) : null,
    );
  }

  /// States chosen AND the document uploaded — enough to sell online.
  bool get isComplete => states.isNotEmpty && file != null;

  bool get isEmpty => states.isEmpty && file == null && (number ?? '').isEmpty && validUntil == null;

  bool get isExpired {
    final v = validUntil;
    if (v == null) return false;
    final end = DateTime.tryParse('${v}T23:59:59');
    return end != null && end.isBefore(DateTime.now());
  }

  String? get fileName => file?['fileName']?.toString();

  ProductLicence copyWith({
    List<String>? states,
    String? number,
    String? validUntil,
    bool clearValidUntil = false,
    Map<String, dynamic>? file,
  }) =>
      ProductLicence(
        states: states ?? this.states,
        number: number ?? this.number,
        validUntil: clearValidUntil ? null : (validUntil ?? this.validUntil),
        file: file ?? this.file,
      );

  /// Firestore value — same fields web writes.
  Map<String, dynamic> toMap() => {
        'states': states,
        if ((number ?? '').trim().isNotEmpty) 'number': number!.trim(),
        if (validUntil != null) 'validUntil': validUntil,
        if (file != null) 'file': file,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      other is ProductLicence &&
      other.states.join('|') == states.join('|') &&
      other.number == number &&
      other.validUntil == validUntil &&
      other.file?['storagePath'] == file?['storagePath'];

  @override
  int get hashCode => Object.hash(states.join('|'), number, validUntil, file?['storagePath']);
}
