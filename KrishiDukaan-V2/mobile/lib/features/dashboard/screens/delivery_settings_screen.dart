import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/indian_states.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/services/address_locator.dart' show matchIndianState;
import '../data/dashboard_repository.dart';

/// Seller delivery-charge configuration.
///
/// SCHEMA CONTRACT: the checkout estimators on BOTH platforms and the server
/// read `deliverySettings/{phone}` — the same doc the web dashboard's Delivery
/// Settings page edits, written here field for field:
///
///   coverageType   'pan_india' | 'states'
///   states         the covered states (states coverage only)
///   weightSlabs    [{minKg, maxKg, charge}] — the set for states coverage, and
///                  for pan-India the copy of inStateSlabs old readers use
///   inStateSlabs   pan-India: slabs for deliveries inside the seller's state
///   outStateSlabs  pan-India: slabs for deliveries to any other state
///   sellerState    the seller's own state, from their profile, so "within
///                  state" needs no second read at checkout
///
/// Do not invent other fields: an earlier version saved
/// `slabs/freeDelivery/flatCharge`, which no checkout read. And a save that
/// omits inStateSlabs / outStateSlabs silently erases what the web set up.
class DeliverySettingsScreen extends ConsumerWidget {
  const DeliverySettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) =>
          const Scaffold(body: Center(child: Text('Not logged in.'))),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: Center(child: Text('Not logged in.')));
        }
        return _DeliverySettingsBody(
          sellerPhone: user.phone,
          // The profile state (canonicalised onto the recognised list), which
          // decides what "within state" means.
          profileState: matchIndianState(user.state) ?? '',
        );
      },
    );
  }
}

class _DeliverySettingsBody extends ConsumerStatefulWidget {
  final String sellerPhone;
  final String profileState;
  const _DeliverySettingsBody({
    required this.sellerPhone,
    required this.profileState,
  });

  @override
  ConsumerState<_DeliverySettingsBody> createState() =>
      _DeliverySettingsBodyState();
}

class _DeliverySettingsBodyState extends ConsumerState<_DeliverySettingsBody> {
  // `states` coverage uses one set; pan-India keeps a within-state and an
  // outside-state set (decided by the customer's delivery state).
  final List<_WeightSlab> _slabs = [];
  final List<_WeightSlab> _inSlabs = [];
  final List<_WeightSlab> _outSlabs = [];
  String _sellerState = '';
  bool _saving = false;
  bool _loaded = false;

  // Delivery Coverage — which states/UTs (or all of India) this seller
  // ships to. Not enforced anywhere at checkout on either platform today
  // (web's CartView only reads weightSlabs for the charge estimate); this is
  // seller-facing configuration, matching what web's Delivery Coverage
  // section actually does.
  String _coverageType = 'pan_india';
  List<String> _states = [];
  final _stateSearchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  @override
  void dispose() {
    _stateSearchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final data = await DashboardRepository().fetchDeliverySettings(
      widget.sellerPhone,
    );
    if (!mounted) return;
    setState(() {
      _coverageType = data?['coverageType'] == 'states'
          ? 'states'
          : 'pan_india';
      _states =
          (data?['states'] as List?)?.map((e) => e.toString()).toList() ??
          const [];
      List<_WeightSlab> read(Object? raw) => [
        for (final s in (raw as List? ?? const []).whereType<Map>())
          if (s['minKg'] is num && s['maxKg'] is num && s['charge'] is num)
            _WeightSlab(
              minKg: (s['minKg'] as num).toDouble(),
              maxKg: (s['maxKg'] as num).toDouble(),
              charge: (s['charge'] as num).toDouble(),
            ),
      ];
      _slabs.addAll(read(data?['weightSlabs']));
      // A legacy pan-India doc has only weightSlabs: seed the within-state
      // editor from it so the seller starts from what they already had.
      final inStored = read(data?['inStateSlabs']);
      _inSlabs.addAll(
        inStored.isNotEmpty ? inStored : read(data?['weightSlabs']),
      );
      _outSlabs.addAll(read(data?['outStateSlabs']));
      // The freshest profile state wins, then the stored one (web's rule).
      _sellerState = widget.profileState.isNotEmpty
          ? widget.profileState
          : (matchIndianState(data?['sellerState'] as String?) ?? '');
      _loaded = true;
    });
  }

  void _addSlab(List<_WeightSlab> list) {
    // Same default as web: new slab continues from the last one's max.
    final lastMax = list.isNotEmpty ? list.last.maxKg : 0.0;
    setState(
      () =>
          list.add(_WeightSlab(minKg: lastMax, maxKg: lastMax + 5, charge: 0)),
    );
  }

  /// First problem in a slab set, worded for [label], or null.
  String? _validateSet(List<_WeightSlab> slabs, String label) {
    for (var i = 0; i < slabs.length; i++) {
      final s = slabs[i];
      if (s.minKg < 0) {
        return '$label slab ${i + 1}: minimum weight cannot be negative.';
      }
      if (s.maxKg <= s.minKg) {
        return '$label slab ${i + 1}: "to" weight must be greater than "from" weight.';
      }
      if (s.charge < 0) {
        return '$label slab ${i + 1}: charge cannot be negative.';
      }
      for (var j = 0; j < i; j++) {
        final o = slabs[j];
        if (s.minKg < o.maxKg && s.maxKg > o.minKg) {
          return '$label slab ${i + 1} overlaps slab ${j + 1} — ranges must not overlap.';
        }
      }
    }
    return null;
  }

  String? _validate() {
    if (_coverageType == 'pan_india') {
      final e =
          _validateSet(_inSlabs, 'Within-state') ??
          _validateSet(_outSlabs, 'Outside-state');
      if (e != null) return e;
    } else {
      final e = _validateSet(_slabs, 'Delivery');
      if (e != null) return e;
    }
    // Matches web's coverageInvalid check: "Selected States" with an empty
    // list would save a config that covers nowhere.
    if (_coverageType == 'states' && _states.isEmpty) {
      return 'Select at least one state, or switch to Pan India.';
    }
    return null;
  }

  Future<void> _save() async {
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: AppColors.error),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      List<Map<String, dynamic>> encode(List<_WeightSlab> list) =>
          ([...list]..sort((a, b) => a.minKg.compareTo(b.minKg)))
              .map(
                (s) => {'minKg': s.minKg, 'maxKg': s.maxKg, 'charge': s.charge},
              )
              .toList();
      final isPan = _coverageType == 'pan_india';
      await DashboardRepository().saveDeliverySettings(widget.sellerPhone, {
        // Web's saveDeliverySettings also stores the phone on the doc body.
        'sellerPhone': widget.sellerPhone,
        // Web's fetchDeliverySettings requires these three; a doc created by
        // mobile without them read back as onlineDeliveryEnabled: false, so
        // the web dashboard showed delivery as off and hid the charges the
        // seller had just configured here.
        'onlineDeliveryEnabled': true,
        'coverageType': _coverageType,
        'states': _coverageType == 'states' ? _states : const <String>[],
        // Exactly what the web writes: for pan-India, weightSlabs mirrors the
        // within-state set (so any older reader still resolves a sane charge)
        // and the two sets are stored; for selected states, one set.
        'weightSlabs': encode(isPan ? _inSlabs : _slabs),
        'inStateSlabs': isPan
            ? encode(_inSlabs)
            : const <Map<String, dynamic>>[],
        'outStateSlabs': isPan
            ? encode(_outSlabs)
            : const <Map<String, dynamic>>[],
        'sellerState': _sellerState,
        // Remove dead fields a previous version of this screen wrote, so the
        // doc converges on the single schema checkout actually reads.
        'slabs': FieldValue.delete(),
        'freeDelivery': FieldValue.delete(),
        'flatCharge': FieldValue.delete(),
        'useSlabs': FieldValue.delete(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Delivery settings saved'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not save: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(
          'Delivery Settings',
          style: AppTextStyles.heading2.copyWith(color: Colors.white),
        ),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: Text(
              _saving ? 'Saving...' : 'Save',
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Coverage first: it decides whether there is one slab set or two.
                _coverageSection(),
                const SizedBox(height: 16),
                if (_coverageType == 'pan_india') ...[
                  _Section(
                    title: 'Delivery Charges',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // What "within state" means, so it is never a guess.
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceVariant,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(
                                Icons.place_outlined,
                                size: 16,
                                color: AppColors.primary,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _sellerState.isNotEmpty
                                      ? 'Your registered state is $_sellerState. Orders delivered to '
                                            '$_sellerState use the Within-State slabs; all other states '
                                            'use the Outside-State slabs.'
                                      : 'Set your business state in your Profile so within-state and '
                                            'outside-state deliveries can be told apart.',
                                  style: AppTextStyles.bodySmall,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        _slabSet(
                          _sellerState.isNotEmpty
                              ? 'Within-State Delivery ($_sellerState)'
                              : 'Within-State Delivery',
                          _inSlabs,
                        ),
                        const Divider(height: 28),
                        _slabSet('Outside-State Delivery', _outSlabs),
                      ],
                    ),
                  ),
                ] else
                  _Section(
                    title: 'Weight Slabs',
                    child: _slabSet(null, _slabs),
                  ),
                const SizedBox(height: 80),
              ],
            ),
    );
  }

  /// One editable list of weight slabs, with an optional heading.
  Widget _slabSet(String? heading, List<_WeightSlab> list) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            if (heading != null)
              Expanded(
                child: Text(
                  heading,
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            else
              const Spacer(),
            TextButton.icon(
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add Slab'),
              onPressed: () => _addSlab(list),
            ),
          ],
        ),
        const Text(
          'Charge customers based on the total order weight. '
          'Example: 0–5 kg → ₹50. Orders whose weight matches '
          'no slab are delivered free.',
          style: TextStyle(color: AppColors.onSurfaceVariant),
        ),
        const SizedBox(height: 12),
        if (list.isEmpty)
          const Text(
            'No slabs yet — delivery is currently FREE for these orders. '
            'Add a slab to start charging.',
            style: TextStyle(
              color: AppColors.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          )
        else
          Column(
            children: list
                .asMap()
                .entries
                .map(
                  (e) => _SlabRow(
                    key: ObjectKey(e.value),
                    slab: e.value,
                    onDelete: () => setState(() => list.removeAt(e.key)),
                  ),
                )
                .toList(),
          ),
      ],
    );
  }

  Widget _coverageSection() {
    return _Section(
      title: 'Delivery Coverage',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Choose where your online orders can be delivered.',
            style: TextStyle(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _CoverageTypeButton(
                  icon: Icons.public,
                  label: 'Pan India',
                  selected: _coverageType == 'pan_india',
                  onTap: () => setState(() => _coverageType = 'pan_india'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _CoverageTypeButton(
                  icon: Icons.map_outlined,
                  label: 'Selected States',
                  selected: _coverageType == 'states',
                  onTap: () => setState(() => _coverageType = 'states'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_coverageType == 'pan_india')
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'Your products can be ordered for delivery '
                'anywhere in India.',
                style: TextStyle(color: AppColors.primary),
              ),
            )
          else
            _StatePicker(
              selected: _states,
              onChanged: (s) => setState(() => _states = s),
              searchCtrl: _stateSearchCtrl,
            ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;

  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(title, style: AppTextStyles.heading3)],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _CoverageTypeButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _CoverageTypeButton({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.white,
          border: Border.all(
            color: selected
                ? AppColors.primary
                : AppColors.onSurfaceVariant.withValues(alpha: 0.3),
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 18,
              color: selected ? Colors.white : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : AppColors.onSurfaceVariant,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Search + multi-select grid of Indian states/UTs, mirroring web's
/// StatePicker (same search-then-toggle interaction, same "show all" reveal
/// so a long list doesn't dump 37 chips at once).
class _StatePicker extends StatefulWidget {
  final List<String> selected;
  final ValueChanged<List<String>> onChanged;
  final TextEditingController searchCtrl;

  const _StatePicker({
    required this.selected,
    required this.onChanged,
    required this.searchCtrl,
  });

  @override
  State<_StatePicker> createState() => _StatePickerState();
}

class _StatePickerState extends State<_StatePicker> {
  bool _showAll = false;

  @override
  Widget build(BuildContext context) {
    final query = widget.searchCtrl.text.trim().toLowerCase();
    final filtered = query.isEmpty
        ? kIndianStates
        : kIndianStates.where((s) => s.toLowerCase().contains(query)).toList();
    final visible = _showAll ? filtered : filtered.take(16).toList();

    void toggle(String state) {
      final next = List<String>.from(widget.selected);
      if (next.contains(state)) {
        next.remove(state);
      } else {
        next.add(state);
      }
      widget.onChanged(next);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: widget.searchCtrl,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: 'Search states...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
              ),
            ),
            if (widget.selected.isNotEmpty) ...[
              const SizedBox(width: 8),
              TextButton(
                onPressed: () => widget.onChanged(const []),
                child: const Text(
                  'Clear all',
                  style: TextStyle(color: AppColors.error),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 6),
        Text(
          '${widget.selected.length} of ${kIndianStates.length} selected',
          style: const TextStyle(
            color: AppColors.onSurfaceVariant,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final state in visible)
              _StateChip(
                label: state,
                selected: widget.selected.contains(state),
                onTap: () => toggle(state),
              ),
          ],
        ),
        if (!_showAll && filtered.length > visible.length)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: TextButton(
              onPressed: () => setState(() => _showAll = true),
              child: Text('Show all ${filtered.length}'),
            ),
          ),
      ],
    );
  }
}

class _StateChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _StateChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary
              : AppColors.onSurfaceVariant.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.white : AppColors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _WeightSlab {
  double minKg;
  double maxKg;
  double charge;
  _WeightSlab({required this.minKg, required this.maxKg, required this.charge});
}

class _SlabRow extends StatelessWidget {
  final _WeightSlab slab;
  final VoidCallback onDelete;

  const _SlabRow({super.key, required this.slab, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: TextFormField(
              initialValue: '${slab.minKg}',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'From (kg)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (v) => slab.minKg = double.tryParse(v) ?? slab.minKg,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextFormField(
              initialValue: '${slab.maxKg}',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'To (kg)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (v) => slab.maxKg = double.tryParse(v) ?? slab.maxKg,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextFormField(
              initialValue: '${slab.charge.toInt()}',
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Charge (₹)',
                border: OutlineInputBorder(),
                isDense: true,
                prefixText: '₹ ',
              ),
              onChanged: (v) => slab.charge = double.tryParse(v) ?? slab.charge,
            ),
          ),
          IconButton(
            icon: const Icon(
              Icons.delete_outline,
              color: AppColors.error,
              size: 20,
            ),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}
