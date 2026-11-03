import 'package:flutter/material.dart';

import '../app_state.dart';
import '../core/status_engine.dart';
import 'common.dart';
import 'number_detail_screen.dart';

enum _Sort { recent, mostCalls, name }

/// Every number that has called or been called, plus contacts added by hand.
class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key, required this.state});
  final AppState state;

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  final _search = TextEditingController();
  var _sort = _Sort.recent;
  var _namedOnly = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final q = _search.text.trim().toLowerCase();
    final qDigits = q.replaceAll(RegExp(r'\D'), '');

    final rows = <_Row>[
      for (final n in s.status.summaries) _Row(n.numberKey, n.title, n.displayNumber, n, n.name != null),
      // Saved in the app but never called yet.
      for (final c in s.contacts.values)
        if (!s.byNumber.containsKey(c.numberKey))
          _Row(c.numberKey, c.name ?? c.displayNumber, c.displayNumber, null, c.name != null),
    ].where((r) {
      if (_namedOnly && !r.named) return false;
      if (q.isEmpty) return true;
      return r.title.toLowerCase().contains(q) ||
          (qDigits.isNotEmpty && r.number.replaceAll(RegExp(r'\D'), '').contains(qDigits));
    }).toList();

    switch (_sort) {
      case _Sort.recent:
        rows.sort((a, b) => (b.summary?.lastCallAt ?? 0).compareTo(a.summary?.lastCallAt ?? 0));
      case _Sort.mostCalls:
        rows.sort((a, b) => (b.summary?.totalCalls ?? 0).compareTo(a.summary?.totalCalls ?? 0));
      case _Sort.name:
        rows.sort((a, b) {
          if (a.named != b.named) return a.named ? -1 : 1;
          return a.title.toLowerCase().compareTo(b.title.toLowerCase());
        });
    }

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-contact',
        onPressed: () => showEditContactSheet(context, s),
        icon: const Icon(Icons.person_add),
        label: const Text('Add contact'),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              isDense: true,
              prefixIcon: Icon(Icons.search),
              hintText: 'Search name or number',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              for (final o in _Sort.values)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(switch (o) {
                      _Sort.recent => 'Recent',
                      _Sort.mostCalls => 'Most calls',
                      _Sort.name => 'A–Z',
                    }),
                    selected: _sort == o,
                    onSelected: (_) => setState(() => _sort = o),
                  ),
                ),
              FilterChip(
                label: const Text('Named only'),
                selected: _namedOnly,
                onSelected: (v) => setState(() => _namedOnly = v),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('${rows.length} numbers',
                style: const TextStyle(color: kGrey, fontSize: 12)),
          ),
        ),
        Expanded(
          child: rows.isEmpty
              ? const EmptyState(icon: Icons.contacts, text: 'No numbers yet')
              : ListView.builder(
                  padding: const EdgeInsets.only(bottom: 88),
                  itemCount: rows.length,
                  itemBuilder: (_, i) {
                    final r = rows[i];
                    final n = r.summary;
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: (n == null ? kBlue : statusColor(n.status))
                            .withValues(alpha: 0.15),
                        child: Text(
                          r.named ? r.title.characters.first.toUpperCase() : '#',
                          style: TextStyle(
                              color: n == null ? kBlue : statusColor(n.status),
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                      title: Text(r.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text([
                        if (r.named) r.number,
                        if (n != null) '${n.totalCalls} calls · last ${whenText(n.lastCallAt)}',
                        if (n == null) 'No calls yet',
                      ].join('\n')),
                      isThreeLine: r.named,
                      trailing: CallButton(state: s, number: r.number),
                      onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => NumberDetailScreen(state: s, numberKey: r.key))),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

class _Row {
  _Row(this.key, this.title, this.number, this.summary, this.named);
  final String key;
  final String title;
  final String number;
  final NumberSummary? summary;
  final bool named;
}
