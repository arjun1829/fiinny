import '../../../core/models/catalog_model.dart';

/// Market search over the in-memory card list, matching the website's
/// /api/marketplace/products search:
///
/// * every typed word must match (name, linked searches, category, shop,
///   description); runs of single letters are joined, so "d a p" is "dap";
/// * a search that finds nothing is retried forgivingly: a word no product
///   has is swapped for its sound-alike ("pawar" -> "pwr", matching "power"),
///   or dropped; then one word at a time is dropped, last typed first
///   ("power plus booster" -> "power plus");
/// * results are ordered best match first (exact or linked search, name
///   starts with, name contains, every word in the name...), then newest.
///
/// [phoneticKey] must give the same key as phoneticKey() in
/// functions/src/marketplace/search-keywords.ts and app/lib/marketplace-cards.ts.

const int _minToken = 2;
const int _maxToken = 15;
const int _maxWords = 5;
final RegExp _wordSplit = RegExp(r'[^\p{L}\p{M}\p{N}]+', unicode: true);
final RegExp _latin = RegExp(r'^[a-z0-9]+$');
final RegExp _digits = RegExp(r'^[0-9]+$');

/// Sound-alike key for a Latin-script word: power / powar / pawar / pavar ->
/// "pwr". Keeps the first letter, maps letters that sound alike, drops
/// vowels and h, collapses repeats. "" for non-Latin words or keys under 2.
String phoneticKey(String word) {
  final w = word.toLowerCase();
  if (!_latin.hasMatch(w) || _digits.hasMatch(w)) return '';
  final mapped = w
      .replaceAll('ph', 'f')
      .replaceAll('v', 'w')
      .replaceAll(RegExp('[qc]'), 'k')
      .replaceAll('z', 'j');
  final out = StringBuffer(mapped[0]);
  var last = mapped[0];
  for (final ch in mapped.substring(1).split('')) {
    if ('aeiouyh'.contains(ch)) continue;
    if (ch == last) continue;
    out.write(ch);
    last = ch;
  }
  final key = out.toString();
  return key.length >= 2 ? key : '';
}

List<String> _words(String text) =>
    text.toLowerCase().split(_wordSplit).where((w) => w.isNotEmpty).toList();

/// The query's words in typed order, single-letter runs joined.
List<String> queryWords(String query) {
  final words = <String>[];
  var run = '';
  for (final w in _words(query)) {
    if (w.runes.length == 1) {
      run += w;
      continue;
    }
    if (run.isNotEmpty) {
      words.add(run);
      run = '';
    }
    words.add(w);
  }
  if (run.isNotEmpty) words.add(run);
  return words
      .where((w) => w.runes.length >= _minToken)
      .map((w) => w.length > _maxToken ? w.substring(0, _maxToken) : w)
      .toList();
}

/// One search token: a word to find as typed, or a sound-alike key.
class _Token {
  const _Token(this.text, {this.phonetic = false});
  final String text;
  final bool phonetic;
}

/// What one product can be found by, worked out once per search.
class _Haystack {
  _Haystack(CatalogModel p)
      : product = p,
        name = p.name.toLowerCase().trim(),
        aliases = p.searchAliases,
        nameWords = _words(p.name),
        aliasWords = p.searchAliases.expand(_words).toList(),
        other = [
          p.category,
          p.description ?? '',
          p.store ?? '',
          ...(p.availability ?? []).map((a) => a.storeName ?? ''),
        ].join(' ').toLowerCase();

  final CatalogModel product;
  final String name;
  final List<String> aliases;
  final List<String> nameWords;
  final List<String> aliasWords;
  final String other;

  late final List<String> _soundKeys = [
    for (final w in [...nameWords, ...aliasWords]) phoneticKey(w),
  ].where((k) => k.isNotEmpty).toList();

  bool has(_Token t) {
    if (t.phonetic) return _soundKeys.any((k) => k.startsWith(t.text));
    return name.contains(t.text) ||
        aliases.any((a) => a.contains(t.text)) ||
        other.contains(t.text);
  }

  bool _inWords(List<String> words, _Token t) => t.phonetic
      ? words.any((w) {
          final k = phoneticKey(w);
          return k.isNotEmpty && k.startsWith(t.text);
        })
      : words.any((w) => w.contains(t.text));

  /// Same ladder as matchScore() on the website.
  int score(String q, List<_Token> tokens) {
    if (name == q || aliases.contains(q)) return 100;
    if (name.startsWith(q)) return 90;
    if (aliases.any((a) => a.startsWith(q))) return 85;
    if (name.contains(q)) return 80;
    if (tokens.isEmpty) return 0;
    if (tokens.every((t) => _inWords(nameWords, t))) return 60;
    if (tokens.every((t) => _inWords(nameWords, t) || _inWords(aliasWords, t))) return 50;
    return 0;
  }
}

/// [products] matching [query], best match first; ties keep their order.
List<CatalogModel> searchProducts(List<CatalogModel> products, String query) {
  final raw = query.trim().toLowerCase();
  if (raw.isEmpty) return products;
  final words = queryWords(raw);
  final hay = products.map(_Haystack.new).toList();

  if (words.isEmpty) {
    // A single character: names starting with it.
    return products.where((p) => p.name.toLowerCase().startsWith(raw)).toList();
  }

  List<_Haystack> matching(List<_Token> tokens) =>
      hay.where((h) => tokens.every(h.has)).toList();

  var tokens = words.map((w) => _Token(w)).toList();
  var found = matching(tokens);

  if (found.isEmpty) {
    // Forgiving retry: keep a word some product has, else its sound-alike if
    // some product has that, else drop it.
    final resolved = <_Token>[];
    for (final w in words.take(_maxWords)) {
      final exact = _Token(w);
      if (hay.any((h) => h.has(exact))) {
        resolved.add(exact);
        continue;
      }
      final key = phoneticKey(w);
      final sound = _Token(key, phonetic: true);
      if (key.isNotEmpty && hay.any((h) => h.has(sound))) resolved.add(sound);
    }
    // What's left must hold a 3+ letter word or sound-alike key: a lone
    // fragment ("pl" from "pawar pl") matches unrelated products, and
    // showing nothing beats showing the wrong thing. Same as the website.
    List<_Haystack> forgiving(List<_Token> tokens) =>
        tokens.any((t) => t.text.runes.length >= 3) ? matching(tokens) : [];
    if (resolved.isNotEmpty) {
      tokens = resolved;
      found = forgiving(tokens);
      // Then drop one word at a time, last typed first.
      for (var drop = resolved.length - 1;
          found.isEmpty && drop >= 0 && resolved.length > 1;
          drop--) {
        final fewer = [...resolved]..removeAt(drop);
        final hits = forgiving(fewer);
        if (hits.isNotEmpty) {
          tokens = fewer;
          found = hits;
        }
      }
    }
  }

  final q = words.join(' ');

  // Found only via shop names or descriptions, none by product name ("pawar
  // pl" -> a corn seed sold by "Pawar Krushi Kendra"): a sound-alike reading
  // may name the product meant. Same as the website.
  if (found.isNotEmpty && found.every((h) => h.score(q, tokens) == 0)) {
    final sound = <_Token>[
      for (final w in words.take(_maxWords))
        if (phoneticKey(w).isNotEmpty) _Token(phoneticKey(w), phonetic: true) else _Token(w),
    ];
    final hits = sound.any((t) => t.text.runes.length >= 3) ? matching(sound) : <_Haystack>[];
    if (hits.any((h) => h.score(q, sound) > 0)) {
      // Its matches go first; the shop/description matches follow.
      tokens = sound;
      found = [...hits, ...found.where((h) => !hits.contains(h))];
    }
  }

  final scored = [
    for (var i = 0; i < found.length; i++)
      (h: found[i], i: i, s: found[i].score(q, tokens)),
  ]..sort((a, b) => b.s != a.s ? b.s.compareTo(a.s) : a.i.compareTo(b.i));
  return scored.map((e) => e.h.product).toList();
}
