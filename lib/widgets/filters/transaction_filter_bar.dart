import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/filters/subcategory_source.dart';
import '../../core/filters/transaction_filter.dart';

class TransactionFilterBar extends StatefulWidget {
  const TransactionFilterBar({
    super.key,
    required this.allTx,
    required this.initial,
    required this.isRail,
    required this.onApply,
    this.onReset,
    this.onSaveView,
    this.loadSavedViews,
  });

  final List<Map<String, dynamic>> allTx;
  final TransactionFilter initial;
  final bool isRail;
  final void Function(TransactionFilter) onApply;
  final VoidCallback? onReset;
  final Future<void> Function(String name, TransactionFilter filter)? onSaveView;
  final Future<List<(String, TransactionFilter)>> Function()? loadSavedViews;

  @override
  State<TransactionFilterBar> createState() => _TransactionFilterBarState();
}

class _TransactionFilterBarState extends State<TransactionFilterBar> {
  static const _debounceDuration = Duration(milliseconds: 150);

  late TransactionFilter _filter;
  Timer? _debounce;

  double _amountMin = 0;
  double _amountMax = 0;

  List<String> _categoryOptions = const [];
  List<String> _merchantOptions = const [];
  List<String> _instrumentOptions = const [];
  List<String> _networkOptions = const [];
  List<String> _issuerOptions = const [];
  List<String> _last4Options = const [];
  List<String> _labelOptions = const [];
  List<String> _tagOptions = const [];
  List<String> _friendPhoneOptions = const [];
  List<String> _groupOptions = const [];

  List<String> _subcategories = const [];
  bool _loadingSubcategories = false;

  List<(String, TransactionFilter)> _savedViews = const [];
  bool _loadingSavedViews = false;

  @override
  void initState() {
    super.initState();
    _filter = widget.initial;
    _refreshOptions();
    _loadSubcategories();
    _loadSavedViews();
  }

  @override
  void didUpdateWidget(covariant TransactionFilterBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.allTx != widget.allTx) {
      _refreshOptions();
    }
    if (oldWidget.initial != widget.initial) {
      _filter = widget.initial;
      _loadSubcategories();
    }
    if (oldWidget.loadSavedViews != widget.loadSavedViews ||
        oldWidget.onSaveView != widget.onSaveView) {
      _loadSavedViews();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _refreshOptions() {
    final categories = <String>{};
    final merchants = <String>{};
    final instruments = <String>{};
    final networks = <String>{};
    final issuers = <String>{};
    final last4 = <String>{};
    final labels = <String>{};
    final tags = <String>{};
    final friendPhones = <String>{};
    final groups = <String>{};

    var minAmount = double.infinity;
    var maxAmount = -double.infinity;

    for (final tx in widget.allTx) {
      void addString(dynamic value, Set<String> target) {
        if (value == null) return;
        final str = value.toString().trim();
        if (str.isNotEmpty) {
          target.add(str);
        }
      }

      final amount = (tx['amount'] as num?)?.toDouble();
      if (amount != null) {
        minAmount = math.min(minAmount, amount);
        maxAmount = math.max(maxAmount, amount);
      }

      addString(tx['category'], categories);
      addString(tx['merchant'], merchants);
      addString(tx['instrument'], instruments);
      addString(tx['network'], networks);
      addString(tx['issuerBank'], issuers);
      addString(tx['cardLast4'] ?? tx['last4'], last4);
      addString(tx['groupId'], groups);

      final lbl = tx['labels'];
      if (lbl is Iterable) {
        for (final item in lbl) {
          addString(item, labels);
        }
      } else if (lbl is String) {
        for (final part in lbl.split(',')) {
          addString(part, labels);
        }
      }

      final tag = tx['tags'];
      if (tag is Iterable) {
        for (final item in tag) {
          addString(item, tags);
        }
      } else if (tag is String) {
        for (final part in tag.split(',')) {
          addString(part, tags);
        }
      }

      final raw = tx['raw'];
      if (raw is Map) {
        addString(raw['groupId'], groups);
        final friends = raw['friendPhones'] ?? raw['friendIds'];
        if (friends is Iterable) {
          for (final phone in friends) {
            addString(phone, friendPhones);
          }
        } else if (friends is String) {
          for (final part in friends.split(',')) {
            addString(part, friendPhones);
          }
        }
      } else if (raw != null) {
        try {
          final groupId = (raw as dynamic).groupId;
          addString(groupId, groups);
        } catch (_) {}
        try {
          final phones = (raw as dynamic).friendPhones;
          if (phones is Iterable) {
            for (final phone in phones) {
              addString(phone, friendPhones);
            }
          }
        } catch (_) {}
      }
    }

    if (minAmount == double.infinity || maxAmount == -double.infinity) {
      minAmount = 0;
      maxAmount = 0;
    }

    if (minAmount == maxAmount) {
      maxAmount = minAmount + 1;
    }

    List<String> sortSet(Set<String> source) {
      final list = source.toList();
      list.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      return list;
    }

    setState(() {
      _amountMin = minAmount.floorToDouble();
      _amountMax = maxAmount.ceilToDouble();
      _categoryOptions = sortSet(categories);
      _merchantOptions = sortSet(merchants);
      _instrumentOptions = sortSet(instruments);
      _networkOptions = sortSet(networks);
      _issuerOptions = sortSet(issuers);
      _last4Options = sortSet(last4);
      _labelOptions = sortSet(labels);
      _tagOptions = sortSet(tags);
      _friendPhoneOptions = sortSet(friendPhones);
      _groupOptions = sortSet(groups);
    });
  }

  Future<void> _loadSubcategories() async {
    final category = _filter.category;
    if (category == null || category.trim().isEmpty) {
      setState(() {
        _subcategories = const [];
        _loadingSubcategories = false;
      });
      return;
    }
    setState(() {
      _loadingSubcategories = true;
    });
    final subs = await SubcategorySource.instance.getSubcategories(category);
    if (!mounted) return;
    setState(() {
      _subcategories = subs;
      _loadingSubcategories = false;
    });
  }

  Future<void> _loadSavedViews() async {
    final loader = widget.loadSavedViews;
    if (loader == null) {
      setState(() {
        _savedViews = const [];
        _loadingSavedViews = false;
      });
      return;
    }
    setState(() {
      _loadingSavedViews = true;
    });
    try {
      final views = await loader();
      if (!mounted) return;
      setState(() {
        _savedViews = views;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _savedViews = const [];
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingSavedViews = false;
        });
      }
    }
  }

  void _apply(TransactionFilter filter) {
    if (widget.isRail) {
      _debounce?.cancel();
      _debounce = Timer(_debounceDuration, () {
        widget.onApply(filter);
      });
    } else {
      widget.onApply(filter);
    }
  }

  void _updateFilter(TransactionFilter Function(TransactionFilter current) mutate) {
    setState(() {
      _filter = mutate(_filter);
    });
    _loadSubcategories();
    _apply(_filter);
  }

  void _setFilter(TransactionFilter filter) {
    setState(() {
      _filter = filter;
    });
    _loadSubcategories();
    _apply(_filter);
  }

  Future<void> _selectCustomRange() async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365 * 5)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDateRange: (_filter.from != null && _filter.to != null)
          ? DateTimeRange(start: _filter.from!, end: _filter.to!)
          : null,
    );
    if (range != null) {
      final start = DateTime(range.start.year, range.start.month, range.start.day);
      final end = DateTime(range.end.year, range.end.month, range.end.day, 23, 59, 59, 999);
      _updateFilter((f) => f.copyWith(from: start, to: end));
    }
  }
  Future<void> _openSheet() async {
    final applied = await showModalBottomSheet<TransactionFilter>(
      context: context,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.9,
      ),
      builder: (context) {
        var working = _filter;
        List<String> modalSubs = _subcategories;
        bool loading = _loadingSubcategories;

        Future<void> refreshSubs(TransactionFilter next, void Function(void Function()) setModalState) async {
          final category = next.category;
          if (category == null || category.trim().isEmpty) {
            setModalState(() {
              modalSubs = const [];
              loading = false;
            });
            return;
          }
          setModalState(() {
            loading = true;
          });
          final subs = await SubcategorySource.instance.getSubcategories(category);
          setModalState(() {
            modalSubs = subs;
            loading = false;
          });
        }

        return StatefulBuilder(
          builder: (context, setModalState) {
            Future<void> update(TransactionFilter next) async {
              working = next;
              setModalState(() {});
              await refreshSubs(working, setModalState);
            }

            Future<void> saveView() async {
              final controller = TextEditingController();
              final name = await showDialog<String>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Save view'),
                  content: TextField(
                    controller: controller,
                    decoration: const InputDecoration(labelText: 'Name'),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () {
                        final value = controller.text.trim();
                        if (value.isNotEmpty) {
                          Navigator.of(ctx).pop(value);
                        }
                      },
                      child: const Text('Save'),
                    ),
                  ],
                ),
              );
              if (name != null && name.isNotEmpty) {
                await _persistView(name, working);
                if (mounted) {
                  await _loadSavedViews();
                }
              }
            }

            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(context).viewInsets.bottom,
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close),
                        ),
                        const Spacer(),
                        if (_loadingSavedViews)
                          const Padding(
                            padding: EdgeInsets.only(right: 8.0),
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        IconButton(
                          tooltip: 'Refresh saved views',
                          onPressed: _loadSavedViews,
                          icon: const Icon(Icons.refresh),
                        ),
                        IconButton(
                          tooltip: 'Save current view',
                          onPressed: saveView,
                          icon: const Icon(Icons.bookmark_add_outlined),
                        ),
                      ],
                    ),
                    Expanded(
                      child: _FilterControls(
                        filter: working,
                        amountMin: _amountMin,
                        amountMax: _amountMax,
                        categories: _categoryOptions,
                        subcategories: modalSubs,
                        merchants: _merchantOptions,
                        instruments: _instrumentOptions,
                        networks: _networkOptions,
                        issuerBanks: _issuerOptions,
                        last4s: _last4Options,
                        labels: _labelOptions,
                        tags: _tagOptions,
                        friendPhones: _friendPhoneOptions,
                        groups: _groupOptions,
                        loadingSubcategories: loading,
                        savedViews: _savedViews,
                        onChanged: (next) => update(next),
                        onSavedViewSelected: (view) {
                          Navigator.of(context).pop(view);
                        },
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Row(
                        children: [
                          TextButton(
                            onPressed: () => Navigator.of(context).pop(TransactionFilter.defaults()),
                            child: const Text('Reset'),
                          ),
                          const Spacer(),
                          FilledButton(
                            onPressed: () => Navigator.of(context).pop(working),
                            child: const Text('Apply'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (applied != null) {
      _setFilter(applied);
    }
  }

  Future<void> _persistView(String name, TransactionFilter filter) {
    if (widget.onSaveView != null) {
      return widget.onSaveView!(name, filter);
    }
    return Future.value();
  }

  List<_PeriodPreset> _periods() {
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    final todayEnd = DateTime(now.year, now.month, now.day, 23, 59, 59, 999);
    final yesterday = now.subtract(const Duration(days: 1));
    final yesterdayStart = DateTime(yesterday.year, yesterday.month, yesterday.day);
    final yesterdayEnd = DateTime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59, 999);
    final twoDayStart = todayStart.subtract(const Duration(days: 1));
    final weekStart = todayStart.subtract(Duration(days: todayStart.weekday - 1));
    final monthStart = DateTime(now.year, now.month, 1);
    final quarterMonth = ((now.month - 1) ~/ 3) * 3 + 1;
    final quarterStart = DateTime(now.year, quarterMonth, 1);
    final yearStart = DateTime(now.year, 1, 1);

    return [
      _PeriodPreset('Day', todayStart, todayEnd),
      _PeriodPreset('Yesterday', yesterdayStart, yesterdayEnd),
      _PeriodPreset('2D', twoDayStart, todayEnd),
      _PeriodPreset('Week', weekStart, todayEnd),
      _PeriodPreset('Month', monthStart, todayEnd),
      _PeriodPreset('Quarter', quarterStart, todayEnd),
      _PeriodPreset('Year', yearStart, todayEnd),
      const _PeriodPreset('All', null, null),
    ];
  }

  bool _matchesPeriod(_PeriodPreset preset) {
    bool same(DateTime? a, DateTime? b) {
      if (a == null && b == null) return true;
      if (a == null || b == null) return false;
      return a.isAtSameMomentAs(b);
    }

    return same(preset.from, _filter.from) && same(preset.to, _filter.to);
  }

  void _applyPeriod(_PeriodPreset preset) {
    _updateFilter((f) => f.copyWith(from: preset.from, to: preset.to));
  }

  Widget _buildTypeSegment() {
    final types = [TxType.all, TxType.expense, TxType.income];
    final labels = ['All', 'Expense', 'Income'];
    final selected = types.indexOf(_filter.type);
    return SegmentedButton<TxType>(
      segments: [
        for (var i = 0; i < types.length; i++)
          ButtonSegment<TxType>(value: types[i], label: Text(labels[i])),
      ],
      showSelectedIcon: false,
      selected: <TxType>{types[selected]},
      onSelectionChanged: (values) {
        if (values.isNotEmpty) {
          _updateFilter((f) => f.copyWith(type: values.first));
        }
      },
    );
  }

  Widget _buildSortDropdown() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        DropdownButton<SortField>(
          value: _filter.sort.field,
          onChanged: (value) {
            if (value == null) return;
            _updateFilter((f) => f.copyWith(sort: SortSpec(value, f.sort.dir)));
          },
          items: const [
            DropdownMenuItem(value: SortField.date, child: Text('Date')),
            DropdownMenuItem(value: SortField.amount, child: Text('Amount')),
            DropdownMenuItem(value: SortField.merchant, child: Text('Merchant')),
            DropdownMenuItem(value: SortField.category, child: Text('Category')),
          ],
        ),
        IconButton(
          tooltip: 'Toggle direction',
          onPressed: () {
            final nextDir =
                _filter.sort.dir == SortDir.asc ? SortDir.desc : SortDir.asc;
            _updateFilter((f) => f.copyWith(sort: SortSpec(f.sort.field, nextDir)));
          },
          icon: Icon(
            _filter.sort.dir == SortDir.asc
                ? Icons.arrow_upward
                : Icons.arrow_downward,
          ),
        ),
      ],
    );
  }

  Widget _buildGroupSegment() {
    return SegmentedButton<GroupBy>(
      segments: const [
        ButtonSegment(value: GroupBy.none, label: Text('None')),
        ButtonSegment(value: GroupBy.day, label: Text('Day')),
        ButtonSegment(value: GroupBy.week, label: Text('Week')),
        ButtonSegment(value: GroupBy.month, label: Text('Month')),
        ButtonSegment(value: GroupBy.merchant, label: Text('Merchant')),
        ButtonSegment(value: GroupBy.category, label: Text('Category')),
      ],
      showSelectedIcon: false,
      selected: <GroupBy>{_filter.groupBy},
      onSelectionChanged: (values) {
        if (values.isNotEmpty) {
          _updateFilter((f) => f.copyWith(groupBy: values.first));
        }
      },
    );
  }

  Widget _buildPeriodChips() {
    final periods = _periods();
    return Wrap(
      spacing: 8,
      children: [
        for (final period in periods)
          ChoiceChip(
            label: Text(period.label),
            selected: _matchesPeriod(period),
            onSelected: (_) => _applyPeriod(period),
          ),
        OutlinedButton.icon(
          onPressed: _selectCustomRange,
          icon: const Icon(Icons.date_range),
          label: const Text('Custom'),
        ),
      ],
    );
  }

  Widget _buildPortrait() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _buildTypeSegment(),
            const SizedBox(width: 12),
            _buildPeriodChips(),
            const SizedBox(width: 12),
            FilledButton.icon(
              onPressed: _openSheet,
              icon: const Icon(Icons.filter_list),
              label: const Text('Filter'),
            ),
            const SizedBox(width: 12),
            _buildSortDropdown(),
            const SizedBox(width: 12),
            _buildGroupSegment(),
          ],
        ),
      ),
    );
  }

  Widget _buildRail() {
    return Padding(
      padding: const EdgeInsets.all(12.0),
      child: _FilterControls(
        filter: _filter,
        amountMin: _amountMin,
        amountMax: _amountMax,
        categories: _categoryOptions,
        subcategories: _subcategories,
        merchants: _merchantOptions,
        instruments: _instrumentOptions,
        networks: _networkOptions,
        issuerBanks: _issuerOptions,
        last4s: _last4Options,
        labels: _labelOptions,
        tags: _tagOptions,
        friendPhones: _friendPhoneOptions,
        groups: _groupOptions,
        loadingSubcategories: _loadingSubcategories,
        savedViews: _savedViews,
        onChanged: _setFilter,
        onSavedViewSelected: _setFilter,
        onSaveView: widget.onSaveView != null
            ? (name) async {
                await widget.onSaveView!(name, _filter);
                await _loadSavedViews();
              }
            : null,
        onRefreshSavedViews: _loadSavedViews,
        onReset: widget.onReset ?? () => _setFilter(TransactionFilter.defaults()),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return widget.isRail ? _buildRail() : _buildPortrait();
  }
}

class _PeriodPreset {
  const _PeriodPreset(this.label, this.from, this.to);

  final String label;
  final DateTime? from;
  final DateTime? to;
}
class _FilterControls extends StatefulWidget {
  const _FilterControls({
    required this.filter,
    required this.amountMin,
    required this.amountMax,
    required this.categories,
    required this.subcategories,
    required this.merchants,
    required this.instruments,
    required this.networks,
    required this.issuerBanks,
    required this.last4s,
    required this.labels,
    required this.tags,
    required this.friendPhones,
    required this.groups,
    required this.loadingSubcategories,
    required this.onChanged,
    required this.savedViews,
    required this.onSavedViewSelected,
    this.onSaveView,
    this.onRefreshSavedViews,
    this.onReset,
  });

  final TransactionFilter filter;
  final double amountMin;
  final double amountMax;
  final List<String> categories;
  final List<String> subcategories;
  final List<String> merchants;
  final List<String> instruments;
  final List<String> networks;
  final List<String> issuerBanks;
  final List<String> last4s;
  final List<String> labels;
  final List<String> tags;
  final List<String> friendPhones;
  final List<String> groups;
  final bool loadingSubcategories;
  final ValueChanged<TransactionFilter> onChanged;
  final List<(String, TransactionFilter)> savedViews;
  final ValueChanged<TransactionFilter> onSavedViewSelected;
  final Future<void> Function(String name)? onSaveView;
  final VoidCallback? onRefreshSavedViews;
  final VoidCallback? onReset;

  @override
  State<_FilterControls> createState() => _FilterControlsState();
}

class _FilterControlsState extends State<_FilterControls> {
  late TextEditingController _searchController;
  late TextEditingController _counterpartyController;
  late TextEditingController _groupController;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(text: widget.filter.text);
    _counterpartyController =
        TextEditingController(text: widget.filter.counterpartyType ?? '');
    _groupController = TextEditingController(text: widget.filter.groupId ?? '');
  }

  @override
  void didUpdateWidget(covariant _FilterControls oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.filter.text != widget.filter.text) {
      _searchController.text = widget.filter.text;
    }
    if (oldWidget.filter.counterpartyType != widget.filter.counterpartyType) {
      _counterpartyController.text = widget.filter.counterpartyType ?? '';
    }
    if (oldWidget.filter.groupId != widget.filter.groupId) {
      _groupController.text = widget.filter.groupId ?? '';
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _counterpartyController.dispose();
    _groupController.dispose();
    super.dispose();
  }

  bool get _showCardDetails =>
      (widget.filter.instrument ?? '').toLowerCase().contains('card');

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.compactCurrency(symbol: '₹');
    final filter = widget.filter;

    final children = <Widget>[
      _SectionTitle(
        title: 'Saved views',
        action: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.onRefreshSavedViews != null)
              IconButton(
                tooltip: 'Refresh',
                onPressed: widget.onRefreshSavedViews,
                icon: const Icon(Icons.refresh),
              ),
            if (widget.onSaveView != null)
              IconButton(
                tooltip: 'Save current view',
                onPressed: () async {
                  final controller = TextEditingController();
                  final name = await showDialog<String>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Save view'),
                      content: TextField(
                        controller: controller,
                        decoration: const InputDecoration(labelText: 'Name'),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(ctx).pop(),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () {
                            final value = controller.text.trim();
                            if (value.isNotEmpty) {
                              Navigator.of(ctx).pop(value);
                            }
                          },
                          child: const Text('Save'),
                        ),
                      ],
                    ),
                  );
                  if (name != null && name.isNotEmpty) {
                    await widget.onSaveView!(name);
                  }
                },
                icon: const Icon(Icons.bookmark_add_outlined),
              ),
          ],
        ),
      ),
      if (widget.savedViews.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Text('No saved views yet'),
        )
      else
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in widget.savedViews)
              InputChip(
                label: Text(entry.$1),
                onPressed: () => widget.onSavedViewSelected(entry.$2),
              ),
          ],
        ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Search'),
      TextField(
        controller: _searchController,
        decoration: const InputDecoration(
          labelText: 'Search text',
          hintText: 'Merchant, note, label…',
        ),
        onChanged: (value) => widget.onChanged(filter.copyWith(text: value)),
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Dates'),
      Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () async {
                final now = DateTime.now();
                final current = filter.from ?? now;
                final picked = await showDatePicker(
                  context: context,
                  initialDate: current,
                  firstDate: DateTime(now.year - 5),
                  lastDate: DateTime(now.year + 1),
                );
                if (picked != null) {
                  final start = DateTime(picked.year, picked.month, picked.day);
                  widget.onChanged(filter.copyWith(from: start));
                }
              },
              icon: const Icon(Icons.calendar_today),
              label: Text(
                filter.from == null
                    ? 'From'
                    : DateFormat.yMMMd().format(filter.from!),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Clear',
            onPressed: () => widget.onChanged(filter.copyWith(from: null)),
            icon: const Icon(Icons.clear),
          ),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () async {
                final now = DateTime.now();
                final current = filter.to ?? now;
                final picked = await showDatePicker(
                  context: context,
                  initialDate: current,
                  firstDate: DateTime(now.year - 5),
                  lastDate: DateTime(now.year + 1),
                );
                if (picked != null) {
                  final end = DateTime(picked.year, picked.month, picked.day, 23, 59, 59, 999);
                  widget.onChanged(filter.copyWith(to: end));
                }
              },
              icon: const Icon(Icons.calendar_today),
              label: Text(
                filter.to == null
                    ? 'To'
                    : DateFormat.yMMMd().format(filter.to!),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Clear',
            onPressed: () => widget.onChanged(filter.copyWith(to: null)),
            icon: const Icon(Icons.clear),
          ),
        ],
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Amount range'),
      RangeSlider(
        min: widget.amountMin,
        max: widget.amountMax,
        divisions: math.max(1, (widget.amountMax - widget.amountMin).round()),
        values: RangeValues(
          filter.minAmount ?? widget.amountMin,
          filter.maxAmount ?? widget.amountMax,
        ),
        labels: RangeLabels(
          currency.format(filter.minAmount ?? widget.amountMin),
          currency.format(filter.maxAmount ?? widget.amountMax),
        ),
        onChanged: (values) {
          widget.onChanged(
            filter.copyWith(minAmount: values.start, maxAmount: values.end),
          );
        },
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Category'),
      DropdownButtonFormField<String?>(
        initialValue: filter.category,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Category'),
        items: [
          const DropdownMenuItem<String?>(value: null, child: Text('Any')),
          ...widget.categories
              .map((c) => DropdownMenuItem<String?>(value: c, child: Text(c))),
        ],
        onChanged: (value) =>
            widget.onChanged(filter.copyWith(category: value, subcategory: null)),
      ),
      if (widget.loadingSubcategories)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: LinearProgressIndicator(),
        )
      else if (widget.subcategories.isNotEmpty)
        DropdownButtonFormField<String?>(
          initialValue: filter.subcategory,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Subcategory'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Any')),
            ...widget.subcategories
                .map((s) => DropdownMenuItem<String?>(value: s, child: Text(s))),
          ],
          onChanged: (value) =>
              widget.onChanged(filter.copyWith(subcategory: value)),
        ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Merchant'),
      _AutocompleteField(
        options: widget.merchants,
        initialValue: filter.merchant,
        labelText: 'Merchant',
        onSelected: (value) => widget.onChanged(filter.copyWith(merchant: value)),
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Instrument'),
      DropdownButtonFormField<String?>(
        initialValue: filter.instrument,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Instrument'),
        items: [
          const DropdownMenuItem<String?>(value: null, child: Text('Any')),
          ...widget.instruments
              .map((i) => DropdownMenuItem<String?>(value: i, child: Text(i))),
        ],
        onChanged: (value) {
          var next = filter.copyWith(instrument: value);
          if (value == null || !value.toLowerCase().contains('card')) {
            next = next.copyWith(network: null, issuerBank: null, last4: null);
          }
          widget.onChanged(next);
        },
      ),
      if (_showCardDetails) ...[
        DropdownButtonFormField<String?>(
          initialValue: filter.network,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Network'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Any')),
            ...widget.networks
                .map((n) => DropdownMenuItem<String?>(value: n, child: Text(n))),
          ],
          onChanged: (value) => widget.onChanged(filter.copyWith(network: value)),
        ),
        DropdownButtonFormField<String?>(
          initialValue: filter.issuerBank,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Issuer bank'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Any')),
            ...widget.issuerBanks
                .map((b) => DropdownMenuItem<String?>(value: b, child: Text(b))),
          ],
          onChanged: (value) => widget.onChanged(filter.copyWith(issuerBank: value)),
        ),
        DropdownButtonFormField<String?>(
          initialValue: filter.last4,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Card last 4'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Any')),
            ...widget.last4s
                .map((l) => DropdownMenuItem<String?>(value: l, child: Text(l))),
          ],
          onChanged: (value) => widget.onChanged(filter.copyWith(last4: value)),
        ),
      ],
      const SizedBox(height: 16),
      _SectionTitle(title: 'Flags'),
      CheckboxListTile(
        title: const Text('International only'),
        value: filter.intl ?? false,
        onChanged: (value) => widget.onChanged(filter.copyWith(intl: value)),
      ),
      CheckboxListTile(
        title: const Text('Has fees'),
        value: filter.hasFees ?? false,
        onChanged: (value) => widget.onChanged(filter.copyWith(hasFees: value)),
      ),
      CheckboxListTile(
        title: const Text('Bills only'),
        value: filter.billsOnly ?? false,
        onChanged: (value) => widget.onChanged(filter.copyWith(billsOnly: value)),
      ),
      CheckboxListTile(
        title: const Text('With attachment'),
        value: filter.withAttachment ?? false,
        onChanged: (value) => widget.onChanged(filter.copyWith(withAttachment: value)),
      ),
      CheckboxListTile(
        title: const Text('Subscriptions only'),
        value: filter.subscriptionsOnly ?? false,
        onChanged: (value) =>
            widget.onChanged(filter.copyWith(subscriptionsOnly: value)),
      ),
      CheckboxListTile(
        title: const Text('Uncategorised only'),
        value: filter.uncategorizedOnly ?? false,
        onChanged: (value) =>
            widget.onChanged(filter.copyWith(uncategorizedOnly: value)),
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'People'),
      if (widget.friendPhones.isEmpty)
        const Text('No friend data available')
      else
        Wrap(
          spacing: 8,
          children: [
            for (final phone in widget.friendPhones)
              FilterChip(
                label: Text(phone),
                selected: filter.friendPhones.contains(phone),
                onSelected: (selected) {
                  final next = List<String>.from(filter.friendPhones);
                  if (selected) {
                    next.add(phone);
                  } else {
                    next.remove(phone);
                  }
                  widget.onChanged(filter.copyWith(friendPhones: next));
                },
              ),
          ],
        ),
      DropdownButtonFormField<String?>(
        initialValue: filter.groupId,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Group'),
        items: [
          const DropdownMenuItem<String?>(value: null, child: Text('Any')),
          ...widget.groups
              .map((g) => DropdownMenuItem<String?>(value: g, child: Text(g))),
        ],
        onChanged: (value) => widget.onChanged(filter.copyWith(groupId: value)),
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Labels'),
      Wrap(
        spacing: 8,
        children: [
          for (final label in widget.labels)
            FilterChip(
              label: Text(label),
              selected: filter.labels.contains(label),
              onSelected: (selected) {
                final next = List<String>.from(filter.labels);
                if (selected) {
                  next.add(label);
                } else {
                  next.remove(label);
                }
                widget.onChanged(filter.copyWith(labels: next));
              },
            ),
        ],
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Tags'),
      Wrap(
        spacing: 8,
        children: [
          for (final tag in widget.tags)
            FilterChip(
              label: Text(tag),
              selected: filter.tags.contains(tag),
              onSelected: (selected) {
                final next = List<String>.from(filter.tags);
                if (selected) {
                  next.add(tag);
                } else {
                  next.remove(tag);
                }
                widget.onChanged(filter.copyWith(tags: next));
              },
            ),
        ],
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Counterparty'),
      TextField(
        controller: _counterpartyController,
        decoration: const InputDecoration(labelText: 'Counterparty type'),
        onChanged: (value) =>
            widget.onChanged(filter.copyWith(counterpartyType: value)),
      ),
      const SizedBox(height: 16),
      _SectionTitle(title: 'Sort & group'),
      DropdownButtonFormField<SortField>(
        initialValue: filter.sort.field,
        decoration: const InputDecoration(labelText: 'Sort field'),
        items: const [
          DropdownMenuItem(value: SortField.date, child: Text('Date')),
          DropdownMenuItem(value: SortField.amount, child: Text('Amount')),
          DropdownMenuItem(value: SortField.merchant, child: Text('Merchant')),
          DropdownMenuItem(value: SortField.category, child: Text('Category')),
        ],
        onChanged: (value) {
          if (value != null) {
            widget.onChanged(filter.copyWith(sort: SortSpec(value, filter.sort.dir)));
          }
        },
      ),
      DropdownButtonFormField<SortDir>(
        initialValue: filter.sort.dir,
        decoration: const InputDecoration(labelText: 'Sort direction'),
        items: const [
          DropdownMenuItem(value: SortDir.asc, child: Text('Ascending')),
          DropdownMenuItem(value: SortDir.desc, child: Text('Descending')),
        ],
        onChanged: (value) {
          if (value != null) {
            widget.onChanged(filter.copyWith(sort: SortSpec(filter.sort.field, value)));
          }
        },
      ),
      DropdownButtonFormField<GroupBy>(
        initialValue: filter.groupBy,
        decoration: const InputDecoration(labelText: 'Group by'),
        items: const [
          DropdownMenuItem(value: GroupBy.none, child: Text('None')),
          DropdownMenuItem(value: GroupBy.day, child: Text('Day')),
          DropdownMenuItem(value: GroupBy.week, child: Text('Week')),
          DropdownMenuItem(value: GroupBy.month, child: Text('Month')),
          DropdownMenuItem(value: GroupBy.merchant, child: Text('Merchant')),
          DropdownMenuItem(value: GroupBy.category, child: Text('Category')),
        ],
        onChanged: (value) {
          if (value != null) {
            widget.onChanged(filter.copyWith(groupBy: value));
          }
        },
      ),
      const SizedBox(height: 16),
      Row(
        children: [
          TextButton(
            onPressed: widget.onReset,
            child: const Text('Reset to defaults'),
          ),
          const Spacer(),
          TextButton(
            onPressed: () => widget.onChanged(TransactionFilter.defaults()),
            child: const Text('Defaults'),
          ),
        ],
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth > 640;
        if (isWide) {
          final half = (children.length / 2).ceil();
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: ListView(
                  children: children.sublist(0, half),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ListView(
                  children: children.sublist(half),
                ),
              ),
            ],
          );
        }

        return ListView(
          children: children,
        );
      },
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.action});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.titleMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Text(title, style: style),
          const Spacer(),
          if (action != null) action!,
        ],
      ),
    );
  }
}
class _AutocompleteField extends StatefulWidget {
  const _AutocompleteField({
    required this.options,
    required this.initialValue,
    required this.labelText,
    required this.onSelected,
  });

  final List<String> options;
  final String? initialValue;
  final String labelText;
  final ValueChanged<String?> onSelected;

  @override
  State<_AutocompleteField> createState() => _AutocompleteFieldState();
}

class _AutocompleteFieldState extends State<_AutocompleteField> {
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue ?? '');
  }

  @override
  void didUpdateWidget(covariant _AutocompleteField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialValue != widget.initialValue) {
      _controller.text = widget.initialValue ?? '';
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Autocomplete<String>(
      initialValue: TextEditingValue(text: _controller.text),
      optionsBuilder: (textEditingValue) {
        if (textEditingValue.text.isEmpty) {
          return widget.options;
        }
        final query = textEditingValue.text.toLowerCase();
        return widget.options
            .where((option) => option.toLowerCase().contains(query))
            .toList();
      },
      onSelected: (value) {
        _controller.text = value;
        widget.onSelected(value);
      },
      fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
        controller.text = _controller.text;
        controller.selection = TextSelection.fromPosition(
          TextPosition(offset: controller.text.length),
        );
        return TextField(
          controller: controller,
          focusNode: focusNode,
          decoration: InputDecoration(labelText: widget.labelText),
          onChanged: (value) {
            _controller.text = value;
            widget.onSelected(value.isEmpty ? null : value);
          },
        );
      },
    );
  }
}

