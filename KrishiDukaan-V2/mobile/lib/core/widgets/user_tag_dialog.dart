import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../features/marketplace/data/store_repository.dart';

class TaggedUser {
  final String id;
  final String name;
  final String role;
  TaggedUser(this.id, this.name, this.role);
}

/// Every shop, loaded once per app session on first use from the store
/// directory (1–2 reads, see StoreRepository.fetchStores) rather than the
/// whole users and retailers collections.
List<TaggedUser>? _sellerCache;
Future<List<TaggedUser>>? _sellerLoad;

Future<List<TaggedUser>> _loadSellers() {
  if (_sellerCache != null) return Future.value(_sellerCache);
  return _sellerLoad ??= () async {
    try {
      final stores = await StoreRepository().fetchStores();
      return _sellerCache = [
        for (final s in stores)
          TaggedUser(s.phone ?? s.id, s.name.isEmpty ? 'Seller' : s.name, 'seller'),
      ];
    } catch (_) {
      return const <TaggedUser>[];
    } finally {
      _sellerLoad = null;
    }
  }();
}

/// Only sellers may query users (firestore.rules), so after the first
/// refusal people-search stops for the rest of the session.
bool _usersSearchDenied = false;

/// Seller accounts whose name starts with [query] (as typed, or capitalised):
/// a bounded search of at most 10 docs instead of downloading every user.
/// Sellers may only read other sellers' records (firestore.rules keeps
/// farmers' records private), so the query filters on role.
Future<List<TaggedUser>> _searchUsers(String query) async {
  if (query.length < 2 || _usersSearchDenied) return const [];
  final prefixes = {query, query[0].toUpperCase() + query.substring(1)};
  try {
    final snaps = await Future.wait(prefixes.map((p) => FirebaseFirestore.instance
        .collection('users')
        .where('role', whereIn: ['retailer', 'manufacturer'])
        .where('name', isGreaterThanOrEqualTo: p)
        .where('name', isLessThanOrEqualTo: '$p')
        .limit(5)
        .get()));
    return [
      for (final snap in snaps)
        for (final doc in snap.docs)
          TaggedUser(doc.id, doc.data()['name'] as String? ?? 'User', 'user'),
    ];
  } on FirebaseException catch (e) {
    if (e.code == 'permission-denied') _usersSearchDenied = true;
    return const [];
  }
}

/// Shops whose name contains [query] plus people whose name starts with it.
/// Used by the inline "@" mention suggestions.
Future<List<TaggedUser>> searchTaggableUsers(String query) async {
  if (query.isEmpty) return const [];
  final q = query.toLowerCase();
  final results = await Future.wait([_loadSellers(), _searchUsers(query.trim())]);
  final seen = <String>{};
  return [
    ...results[0].where((u) => u.name.toLowerCase().contains(q)),
    ...results[1],
  ].where((u) => seen.add(u.id)).take(8).toList();
}

/// Inline "@mention" suggestions list — shown above a comment input while
/// the user is mid-way through typing "@partial-name". Lives inline in the
/// composer so suggestions appear as you type, Instagram/Twitter-style. This
/// is the only tagging entry point — a separate tap-to-open "Tag User"
/// dialog/icon used to exist alongside it but was removed since having two
/// ways to tag was confusing and the icon's flow independently duplicated
/// the tagged name into the comment text.
class MentionSuggestions extends StatelessWidget {
  final List<TaggedUser> results;
  final bool loading;
  final String query;
  final ValueChanged<TaggedUser> onSelect;

  const MentionSuggestions({
    super.key,
    required this.results,
    required this.loading,
    required this.query,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxHeight: 180),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black12),
        boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, -2))],
      ),
      child: loading
          ? const Padding(
              padding: EdgeInsets.all(12),
              child: Center(child: SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))),
            )
          : results.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text('No matches for "$query"', style: const TextStyle(fontSize: 12, color: Colors.black54)),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: results.length,
                  itemBuilder: (context, index) {
                    final u = results[index];
                    return ListTile(
                      dense: true,
                      leading: CircleAvatar(
                        radius: 14,
                        backgroundColor: u.role == 'seller' ? Colors.green.shade100 : Colors.blue.shade100,
                        child: Icon(u.role == 'seller' ? Icons.store : Icons.person, size: 14, color: Colors.black87),
                      ),
                      title: Text(u.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: Text(u.role.toUpperCase(), style: const TextStyle(fontSize: 9)),
                      onTap: () => onSelect(u),
                    );
                  },
                ),
    );
  }
}
