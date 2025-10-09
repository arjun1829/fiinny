// lib/widgets/bulk_edit_sheet.dart
import 'package:flutter/material.dart';

class BulkEditSpec {
  final String? title;
  final String? comments;
  final String? category;
  final DateTime? date;
  final List<String> addLabels;
  final List<String> removeLabels;

  const BulkEditSpec({
    this.title,
    this.comments,
    this.category,
    this.date,
    this.addLabels = const [],
    this.removeLabels = const [],
  });

  bool get isNoop =>
      (title == null || title!.trim().isEmpty) &&
          (comments == null || comments!.trim().isEmpty) &&
          (category == null || category!.trim().isEmpty) &&
          date == null &&
          addLabels.isEmpty &&
          removeLabels.isEmpty;
}

class BulkEditSheet extends StatefulWidget {
  /// Optional: pass preloaded categories (e.g. from ExpenseService.distinctCategories)
  final List<String> categories;

  /// Optional: async loaders for suggestions (useful to auto-fill chips/dropdowns)
  final Future<List<String>> Function()? loadCategories;
  final Future<List<String>> Function()? loadLabels;

  /// Optional initial values (for “repeat last bulk edit” UX)
  final BulkEditSpec initial;

  const BulkEditSheet({
    super.key,
    this.categories = const [],
    this.loadCategories,
    this.loadLabels,
    this.initial = const BulkEditSpec(),
  });

  @override
  State<BulkEditSheet> createState() => _BulkEditSheetState();
}

class _BulkEditSheetState extends State<BulkEditSheet> {
  final _titleCtl = TextEditingController();
  final _commentsCtl = TextEditingController();

  String? _category;
  DateTime? _date;

  // Suggestions
  List<String> _allCategories = [];
  List<String> _labelSuggestions = [];

  // Chip inputs
  final Set<String> _addLabels = {};
  final Set<String> _removeLabels = {};
  final _addCtl = TextEditingController();
  final _remCtl = TextEditingController();

  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _hydrateFromInitial();
    _initSuggestions();
  }

  void _hydrateFromInitial() {
    if (widget.initial.title != null) _titleCtl.text = widget.initial.title!;
    if (widget.initial.comments != null) _commentsCtl.text = widget.initial.comments!;
    _category = widget.initial.category;
    _date = widget.initial.date;
    _addLabels.addAll(widget.initial.addLabels);
    _removeLabels.addAll(widget.initial.removeLabels);
  }

  Future<void> _initSuggestions() async {
    try {
      final cats = <String>[
        ...widget.categories,
        if (widget.loadCategories != null) ...await widget.loadCategories!.call(),
      ];
      final labs = <String>[
        if (widget.loadLabels != null) ...await widget.loadLabels!.call(),
      ];
      cats.removeWhere((e) => e.trim().isEmpty);
      labs.removeWhere((e) => e.trim().isEmpty);
      cats.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      labs.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      if (!mounted) return;
      setState(() {
        _allCategories = _uniqueOrdered(cats);
        _labelSuggestions = _uniqueOrdered(labs);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  List<String> _uniqueOrdered(List<String> list) {
    final seen = <String>{};
    return list.where((e) => seen.add(e)).toList();
  }

  @override
  void dispose() {
    _titleCtl.dispose();
    _commentsCtl.dispose();
    _addCtl.dispose();
    _remCtl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 2),
    );
    if (picked != null) {
      setState(() => _date = DateTime(picked.year, picked.month, picked.day));
    }
  }

  void _addChipFromField(TextEditingController ctl, Set<String> target) {
    final raw = ctl.text.trim();
    if (raw.isEmpty) return;
    for (final piece in raw.split(RegExp(r'[,\s]+'))) {
      final v = piece.trim();
      if (v.isEmpty) continue;
      target.add(v);
    }
    ctl.clear();
    setState(() {});
  }

  void _toggleSuggestionLabel(String label, Set<String> target) {
    if (target.contains(label)) {
      target.remove(label);
    } else {
      target.add(label);
    }
    setState(() {});
  }

  bool get _applyEnabled {
    final spec = _buildSpec();
    return !spec.isNoop;
  }

  BulkEditSpec _buildSpec() {
    String? title = _titleCtl.text.trim();
    if (title.isEmpty) title = null;

    String? comments = _commentsCtl.text.trim();
    if (comments.isEmpty) comments = null;

    String? category = _category?.trim();
    if (category != null && category.isEmpty) category = null;

    return BulkEditSpec(
      title: title,
      comments: comments,
      category: category,
      date: _date,
      addLabels: _addLabels.toList(),
      removeLabels: _removeLabels.toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxH = MediaQuery.of(context).size.height * 0.9;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxH),
        child: Material(
          color: theme.scaffoldBackgroundColor,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: Colors.black12, borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Text('Bulk Edit', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    const Spacer(),
                    IconButton(
                      tooltip: 'Reset',
                      onPressed: () {
                        setState(() {
                          _titleCtl.clear();
                          _commentsCtl.clear();
                          _category = null;
                          _date = null;
                          _addLabels.clear();
                          _removeLabels.clear();
                          _addCtl.clear();
                          _remCtl.clear();
                        });
                      },
                      icon: const Icon(Icons.refresh),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
                    : SingleChildScrollView(
                  padding: EdgeInsets.only(
                    left: 16, right: 16,
                    bottom: MediaQuery.of(context).viewInsets.bottom + 16,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title
                      TextField(
                        controller: _titleCtl,
                        decoration: const InputDecoration(
                          labelText: 'Set Title (optional)',
                          prefixIcon: Icon(Icons.title),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Comments
                      TextField(
                        controller: _commentsCtl,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Set Comments (optional)',
                          hintText: 'Personal thoughts or context',
                          prefixIcon: Icon(Icons.mode_comment_outlined),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Category
                      InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Set Category (optional)',
                          prefixIcon: Icon(Icons.category_outlined),
                          border: OutlineInputBorder(),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _category,
                            isExpanded: true,
                            hint: const Text('— leave as-is —'),
                            items: [
                              const DropdownMenuItem(value: null, child: Text('— leave as-is —')),
                              ..._allCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))),
                            ],
                            onChanged: (v) => setState(() => _category = v),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Date
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _pickDate,
                              icon: const Icon(Icons.date_range),
                              label: Text(
                                _date == null
                                    ? 'Set Date (optional)'
                                    : _date!.toString().split(' ').first,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (_date != null)
                            IconButton(
                              tooltip: 'Clear date',
                              onPressed: () => setState(() => _date = null),
                              icon: const Icon(Icons.clear),
                            ),
                        ],
                      ),
                      const SizedBox(height: 20),

                      // Add Labels
                      Text('Add Labels', style: theme.textTheme.labelLarge),
                      const SizedBox(height: 6),
                      _ChipInputRow(
                        controller: _addCtl,
                        hint: 'Type and press Enter (or comma) to add',
                        onSubmit: () => _addChipFromField(_addCtl, _addLabels),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: -8,
                        children: _addLabels.map((l) => Chip(
                          label: Text('#$l'),
                          onDeleted: () => setState(() => _addLabels.remove(l)),
                        )).toList(),
                      ),
                      if (_labelSuggestions.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text('Suggestions', style: theme.textTheme.bodySmall),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: -8,
                          children: _labelSuggestions.take(24).map((l) {
                            final selected = _addLabels.contains(l);
                            return FilterChip(
                              label: Text('#$l'),
                              selected: selected,
                              onSelected: (_) => _toggleSuggestionLabel(l, _addLabels),
                            );
                          }).toList(),
                        ),
                      ],

                      const SizedBox(height: 20),

                      // Remove Labels
                      Text('Remove Labels', style: theme.textTheme.labelLarge),
                      const SizedBox(height: 6),
                      _ChipInputRow(
                        controller: _remCtl,
                        hint: 'Type and press Enter (or comma) to add',
                        onSubmit: () => _addChipFromField(_remCtl, _removeLabels),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: -8,
                        children: _removeLabels.map((l) => Chip(
                          label: Text('#$l'),
                          onDeleted: () => setState(() => _removeLabels.remove(l)),
                        )).toList(),
                      ),
                      if (_labelSuggestions.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text('Suggestions', style: theme.textTheme.bodySmall),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: -8,
                          children: _labelSuggestions.take(24).map((l) {
                            final selected = _removeLabels.contains(l);
                            return FilterChip(
                              label: Text('#$l'),
                              selected: selected,
                              onSelected: (_) => _toggleSuggestionLabel(l, _removeLabels),
                            );
                          }).toList(),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close),
                        label: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _applyEnabled
                            ? () => Navigator.of(context).pop(_buildSpec())
                            : null,
                        icon: const Icon(Icons.check),
                        label: const Text('Apply to Selected'),
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

class _ChipInputRow extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSubmit;
  final String hint;

  const _ChipInputRow({
    required this.controller,
    required this.onSubmit,
    required this.hint,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onSubmitted: (_) => onSubmit(),
      textInputAction: TextInputAction.done,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.tag_outlined),
        suffixIcon: IconButton(
          icon: const Icon(Icons.add),
          onPressed: onSubmit,
          tooltip: 'Add',
        ),
        labelText: hint,
        border: const OutlineInputBorder(),
      ),
      // Allow comma-separated quick entry
      onChanged: (v) {
        if (v.contains(',')) {
          onSubmit();
        }
      },
    );
  }
}
