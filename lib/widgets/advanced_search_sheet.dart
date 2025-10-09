// lib/widgets/advanced_search_sheet.dart
import 'package:flutter/material.dart';

class AdvancedSearchSpec {
  final List<String> categories;
  final List<String> labels;
  final DateTime? from;
  final DateTime? to;
  final double? minAmount;
  final double? maxAmount;
  final String? text;

  const AdvancedSearchSpec({
    this.categories = const [],
    this.labels = const [],
    this.from,
    this.to,
    this.minAmount,
    this.maxAmount,
    this.text,
  });

  AdvancedSearchSpec copyWith({
    List<String>? categories,
    List<String>? labels,
    DateTime? from,
    DateTime? to,
    double? minAmount,
    double? maxAmount,
    String? text,
  }) {
    return AdvancedSearchSpec(
      categories: categories ?? this.categories,
      labels: labels ?? this.labels,
      from: from ?? this.from,
      to: to ?? this.to,
      minAmount: minAmount ?? this.minAmount,
      maxAmount: maxAmount ?? this.maxAmount,
      text: text ?? this.text,
    );
  }
}

class AdvancedSearchSheet extends StatefulWidget {
  /// Provide async loaders that return distinct values from the user's data.
  final Future<List<String>> Function() loadCategories;
  final Future<List<String>> Function() loadLabels;

  /// Optional initial spec to prefill the UI.
  final AdvancedSearchSpec initial;

  const AdvancedSearchSheet({
    super.key,
    required this.loadCategories,
    required this.loadLabels,
    this.initial = const AdvancedSearchSpec(),
  });

  @override
  State<AdvancedSearchSheet> createState() => _AdvancedSearchSheetState();
}

class _AdvancedSearchSheetState extends State<AdvancedSearchSheet> {
  final _textCtl = TextEditingController();
  final _minCtl = TextEditingController();
  final _maxCtl = TextEditingController();

  List<String> _allCats = const [];
  List<String> _allLabels = const [];
  final Set<String> _cats = {};
  final Set<String> _labels = {};

  DateTime? _from;
  DateTime? _to;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _hydrateFromInitial();
    _initOptions();
  }

  void _hydrateFromInitial() {
    _textCtl.text = widget.initial.text ?? '';
    if (widget.initial.minAmount != null) {
      _minCtl.text = widget.initial.minAmount!.toString();
    }
    if (widget.initial.maxAmount != null) {
      _maxCtl.text = widget.initial.maxAmount!.toString();
    }
    _cats.addAll(widget.initial.categories);
    _labels.addAll(widget.initial.labels);
    _from = widget.initial.from;
    _to = widget.initial.to;
  }

  Future<void> _initOptions() async {
    try {
      final cats = await widget.loadCategories();
      final labs = await widget.loadLabels();
      if (!mounted) return;
      setState(() {
        _allCats = cats;
        _allLabels = labs;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  double? _tryParseDouble(String s) {
    final t = s.trim();
    if (t.isEmpty) return null;
    return double.tryParse(t);
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 1),
      initialDateRange: (_from != null && _to != null)
          ? DateTimeRange(start: _from!, end: _to!)
          : null,
    );
    if (picked != null) {
      setState(() {
        _from = DateTime(picked.start.year, picked.start.month, picked.start.day);
        _to = DateTime(picked.end.year, picked.end.month, picked.end.day, 23, 59, 59, 999);
      });
    }
  }

  void _reset() {
    setState(() {
      _textCtl.clear();
      _minCtl.clear();
      _maxCtl.clear();
      _cats.clear();
      _labels.clear();
      _from = null;
      _to = null;
    });
  }

  void _apply() {
    final spec = AdvancedSearchSpec(
      categories: _cats.toList(),
      labels: _labels.toList(),
      from: _from,
      to: _to,
      minAmount: _tryParseDouble(_minCtl.text),
      maxAmount: _tryParseDouble(_maxCtl.text),
      text: _textCtl.text.trim().isEmpty ? null : _textCtl.text.trim(),
    );
    Navigator.of(context).pop(spec);
  }

  Future<void> _addLabelManually() async {
    final ctl = TextEditingController();
    final res = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add label filter'),
        content: TextField(
          controller: ctl,
          decoration: const InputDecoration(hintText: 'e.g. office, trip, food'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, ctl.text.trim()), child: const Text('Add')),
        ],
      ),
    );
    if (res != null && res.isNotEmpty) {
      setState(() {
        _labels.add(res);
        if (!_allLabels.contains(res)) _allLabels = [..._allLabels, res]..sort();
      });
    }
  }

  @override
  void dispose() {
    _textCtl.dispose();
    _minCtl.dispose();
    _maxCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.9;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Material(
          color: Theme.of(context).scaffoldBackgroundColor,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Text('Advanced Search', style: Theme.of(context).textTheme.titleMedium),
                    const Spacer(),
                    IconButton(
                      tooltip: 'Reset',
                      onPressed: _reset,
                      icon: const Icon(Icons.refresh),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: Padding(
                  padding: EdgeInsets.all(24.0),
                  child: CircularProgressIndicator(),
                ))
                    : SingleChildScrollView(
                  padding: EdgeInsets.only(
                    left: 16,
                    right: 16,
                    bottom: MediaQuery.of(context).viewInsets.bottom + 16,
                    top: 4,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        controller: _textCtl,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          labelText: 'Search text (title, comments, note, labels, category)',
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Categories
                      Text('Categories', style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: -8,
                        children: _allCats.map((c) {
                          final selected = _cats.contains(c);
                          return FilterChip(
                            label: Text(c),
                            selected: selected,
                            onSelected: (_) => setState(() {
                              selected ? _cats.remove(c) : _cats.add(c);
                            }),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // Labels
                      Row(
                        children: [
                          Text('Labels', style: Theme.of(context).textTheme.labelLarge),
                          const Spacer(),
                          TextButton.icon(
                            onPressed: _addLabelManually,
                            icon: const Icon(Icons.add),
                            label: const Text('Add filter'),
                          ),
                        ],
                      ),
                      Wrap(
                        spacing: 8,
                        runSpacing: -8,
                        children: _allLabels.map((l) {
                          final selected = _labels.contains(l);
                          return FilterChip(
                            label: Text('#$l'),
                            selected: selected,
                            onSelected: (_) => setState(() {
                              selected ? _labels.remove(l) : _labels.add(l);
                            }),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // Amount range
                      Text('Amount range', style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _minCtl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: const InputDecoration(labelText: 'Min'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _maxCtl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: const InputDecoration(labelText: 'Max'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Date range
                      Text('Date range', style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _pickRange,
                              icon: const Icon(Icons.date_range),
                              label: Text(
                                _from == null || _to == null
                                    ? 'Pick range'
                                    : '${_from!.toString().split(' ').first} → ${_to!.toString().split(' ').first}',
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          IconButton(
                            tooltip: 'Clear',
                            onPressed: () => setState(() { _from = null; _to = null; }),
                            icon: const Icon(Icons.clear),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),

              // Action bar
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).pop(const AdvancedSearchSpec()),
                        icon: const Icon(Icons.close),
                        label: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _apply,
                        icon: const Icon(Icons.check),
                        label: const Text('Apply'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
