import 'dart:collection';
import 'package:flutter/foundation.dart';

/// Pure math/validation helper for the Settle Up V2 flow.
/// Keeps track of the selected groups, derived outstanding, and amount limits.
class SettleUpControllerV2 extends ChangeNotifier {
  SettleUpControllerV2({
    required this.friendId,
    required Map<String, double> outstandingByGroup,
    required bool isReceiveFlow,
    required this.currency,
    Set<String>? initialSelection,
    double? initialAmount,
  })  : _outstandingByGroup = Map.unmodifiable(outstandingByGroup),
        _isReceiveFlow = isReceiveFlow {
    if (_outstandingByGroup.isEmpty) {
      _selectedGroupIds = <String>{};
      _proposedAmount = 0;
      return;
    }

    final defaultSelection = initialSelection ??
        _outstandingByGroup.entries
            .where((entry) =>
                entry.value != 0 && (entry.value > 0) == _isReceiveFlow)
            .map((entry) => entry.key)
            .toSet();

    _selectedGroupIds =
        defaultSelection.isEmpty ? <String>{} : defaultSelection;

    final suggested = initialAmount ?? _maxSelectableAmount();
    _setAmountInternal(suggested);
  }

  final String friendId;
  final Map<String, double> _outstandingByGroup;
  final bool _isReceiveFlow;
  final String currency;

  late Set<String> _selectedGroupIds;
  late double _proposedAmount;
  String? _errorText;

  UnmodifiableMapView<String, double> get outstandingByGroup =>
      UnmodifiableMapView(_outstandingByGroup);

  Set<String> get selectedGroupIds => UnmodifiableSetView(_selectedGroupIds);

  double get totalSelectedOutstanding => _selectedGroupIds.fold<double>(
      0.0, (sum, id) => sum + (_outstandingByGroup[id] ?? 0.0));

  bool get isReceiveFlow => _isReceiveFlow;

  double get proposedAmount => _proposedAmount;

  bool get hasSelection => _selectedGroupIds.isNotEmpty;

  String? get errorText => _errorText;

  bool get canSubmit =>
      hasSelection &&
      _proposedAmount > 0 &&
      _errorText == null &&
      _proposedAmount <= _maxSelectableAmount() + 0.005;

  List<double> get quickChipValues {
    final max = _maxSelectableAmount();
    if (max <= 0) {
      return const [];
    }

    double clamp(double value) {
      final capped = value.clamp(0, max);
      return double.parse(capped.toStringAsFixed(2));
    }

    bool isDuplicate(List<double> list, double value) {
      return list.any((existing) => (existing - value).abs() < 0.01);
    }

    final values = <double>[];

    const percents = [1.0, 0.75, 0.5, 0.25];
    for (final p in percents) {
      final v = clamp(max * p);
      if (v <= 0) continue;
      if (!isDuplicate(values, v)) values.add(v);
    }

    const absolute = [100.0, 200.0, 500.0];
    for (final raw in absolute) {
      final v = clamp(raw);
      if (v <= 0) {
        continue;
      }
      if (!isDuplicate(values, v)) {
        values.add(v);
      }
    }
    return values;
  }

  void toggleGroup(String id) {
    if (!_outstandingByGroup.containsKey(id)) {
      return;
    }
    final amount = _outstandingByGroup[id] ?? 0.0;
    if ((amount > 0) != _isReceiveFlow && amount != 0) {
      // Mixing opposite polarity is not allowed – ignore toggle.
      return;
    }

    if (_selectedGroupIds.contains(id)) {
      _selectedGroupIds = {..._selectedGroupIds}..remove(id);
    } else {
      _selectedGroupIds = {..._selectedGroupIds, id};
    }
    if (_selectedGroupIds.isEmpty) {
      _proposedAmount = 0;
      _errorText = null;
    } else {
      _setAmountInternal(_proposedAmount);
    }
    notifyListeners();
  }

  void setAmount(double value) {
    _setAmountInternal(value);
    notifyListeners();
  }

  void applyChip(double value) {
    _setAmountInternal(value);
    notifyListeners();
  }

  double _maxSelectableAmount() {
    final total = _selectedGroupIds.fold<double>(
      0.0,
      (sum, id) => sum + (_outstandingByGroup[id]?.abs() ?? 0.0),
    );
    return double.parse(total.toStringAsFixed(2));
  }

  void _setAmountInternal(double raw) {
    final max = _maxSelectableAmount();
    if (max <= 0) {
      _proposedAmount = 0;
      _errorText = null;
      return;
    }

    final value = raw.clamp(0, max);
    _proposedAmount = double.parse(value.toStringAsFixed(2));

    if (raw > max + 0.005) {
      _errorText = 'Amount cannot exceed outstanding.';
    } else if (_proposedAmount <= 0) {
      _errorText = 'Enter an amount to continue.';
    } else {
      _errorText = null;
    }
  }
}
