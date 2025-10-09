import 'package:flutter/material.dart';
import '../../../models/suggestion.dart';
import '../../../services/subscriptions/suggestions_repo.dart';
import '../../../services/subscriptions/suggestion_detector.dart';

class SuggestionsSection extends StatefulWidget {
  final String? userPhone;
  final Future<void> Function(Suggestion s) onAddSuggestion;

  const SuggestionsSection({
    Key? key,
    required this.userPhone,
    required this.onAddSuggestion,
  }) : super(key: key);

  @override
  State<SuggestionsSection> createState() => _SuggestionsSectionState();
}

class _SuggestionsSectionState extends State<SuggestionsSection> {
  final _detector = SuggestionDetector();
  final _repo = SuggestionsRepo();

  late Future<List<Suggestion>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Suggestion>> _load() async {
    // SAFE: returns [] if not wired
    final raw = await _detector.detectRecent(widget.userPhone);
    // filter dismissed
    final dismissed = await _repo.getDismissedIds();
    return raw.where((s) => !dismissed.contains(s.id)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Suggestion>>(
      future: _future,
      builder: (_, snap) {
        final list = snap.data ?? const <Suggestion>[];
        if (list.isEmpty) return const SizedBox.shrink();

        return _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _TitleRow(),
              const SizedBox(height: 8),
              ...list.map((s) => _row(s)),
            ],
          ),
        );
      },
    );
  }

  Widget _row(Suggestion s) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black12),
      ),
      child: Row(
        children: [
          const Icon(Icons.lightbulb_outline),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.merchant, style: const TextStyle(fontWeight: FontWeight.w900)),
              const SizedBox(height: 2),
              Text(
                '${s.frequency} • ${s.amount == null ? "--" : "₹${s.amount!.toStringAsFixed(0)}"}',
                style: const TextStyle(color: Colors.black54),
              ),
            ]),
          ),
          TextButton(
            onPressed: () async {
              await widget.onAddSuggestion(s);
              if (mounted) setState(() => _future = _load());
            },
            child: const Text('Add'),
          ),
          IconButton(
            tooltip: 'Dismiss',
            onPressed: () async {
              await _repo.dismiss(s.id);
              if (mounted) setState(() => _future = _load());
            },
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }

  Widget _card({required Widget child}) => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.black12),
      boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 6))],
    ),
    child: Padding(padding: const EdgeInsets.all(14), child: child),
  );
}

class _TitleRow extends StatelessWidget {
  const _TitleRow();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: const [
        Icon(Icons.auto_awesome_outlined),
        SizedBox(width: 8),
        Text('Suggestions from transactions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
      ],
    );
  }
}
