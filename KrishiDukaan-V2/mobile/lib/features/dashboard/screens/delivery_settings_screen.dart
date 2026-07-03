import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../data/dashboard_repository.dart';

/// Seller delivery-charge configuration.
///
/// SCHEMA CONTRACT: the checkout estimators on BOTH platforms (web
/// `useDeliveryEstimates`, mobile `deliveryChargeProvider`) read exactly
/// `deliverySettings/{phone}.weightSlabs: [{minKg, maxKg, charge}]` — the
/// same doc the web dashboard's Delivery Settings page edits. Do not invent
/// other fields here: an earlier version of this screen saved
/// `slabs/freeDelivery/flatCharge`, which no checkout ever read, so seller
/// edits from mobile silently did nothing.
class DeliverySettingsScreen extends ConsumerWidget {
  const DeliverySettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) => const Scaffold(
          body: Center(child: Text('Not logged in.'))),
      data: (user) {
        if (user == null) {
          return const Scaffold(
              body: Center(child: Text('Not logged in.')));
        }
        return _DeliverySettingsBody(sellerPhone: user.phone);
      },
    );
  }
}

class _DeliverySettingsBody extends ConsumerStatefulWidget {
  final String sellerPhone;
  const _DeliverySettingsBody({required this.sellerPhone});

  @override
  ConsumerState<_DeliverySettingsBody> createState() =>
      _DeliverySettingsBodyState();
}

class _DeliverySettingsBodyState
    extends ConsumerState<_DeliverySettingsBody> {
  final List<_WeightSlab> _slabs = [];
  bool _saving = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final data =
        await DashboardRepository().fetchDeliverySettings(widget.sellerPhone);
    if (!mounted) return;
    setState(() {
      final rawSlabs = data?['weightSlabs'] as List? ?? [];
      _slabs.addAll(rawSlabs.map((s) {
        final m = s as Map<String, dynamic>;
        return _WeightSlab(
          minKg: (m['minKg'] as num?)?.toDouble() ?? 0,
          maxKg: (m['maxKg'] as num?)?.toDouble() ?? 0,
          charge: (m['charge'] as num?)?.toDouble() ?? 0,
        );
      }));
      _loaded = true;
    });
  }

  void _addSlab() {
    // Same default as web: new slab continues from the last one's max.
    final lastMax = _slabs.isNotEmpty ? _slabs.last.maxKg : 0.0;
    setState(() =>
        _slabs.add(_WeightSlab(minKg: lastMax, maxKg: lastMax + 5, charge: 0)));
  }

  String? _validate() {
    for (var i = 0; i < _slabs.length; i++) {
      final s = _slabs[i];
      if (s.minKg < 0) return 'Slab ${i + 1}: minimum weight cannot be negative.';
      if (s.maxKg <= s.minKg) {
        return 'Slab ${i + 1}: "to" weight must be greater than "from" weight.';
      }
      if (s.charge < 0) return 'Slab ${i + 1}: charge cannot be negative.';
      for (var j = 0; j < i; j++) {
        final o = _slabs[j];
        if (s.minKg < o.maxKg && s.maxKg > o.minKg) {
          return 'Slab ${i + 1} overlaps slab ${j + 1} — ranges must not overlap.';
        }
      }
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
      final sorted = [..._slabs]..sort((a, b) => a.minKg.compareTo(b.minKg));
      await DashboardRepository().saveDeliverySettings(widget.sellerPhone, {
        // Web's saveDeliverySettings also stores the phone on the doc body.
        'sellerPhone': widget.sellerPhone,
        'weightSlabs': sorted
            .map((s) =>
                {'minKg': s.minKg, 'maxKg': s.maxKg, 'charge': s.charge})
            .toList(),
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
        title: Text('Delivery Settings',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
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
                _Section(
                  title: 'Weight Slabs',
                  trailing: TextButton.icon(
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('Add Slab'),
                    onPressed: _addSlab,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Charge customers based on the total order weight. '
                        'Example: 0–5 kg → ₹50. Orders whose weight matches '
                        'no slab are delivered free.',
                        style: TextStyle(color: AppColors.onSurfaceVariant),
                      ),
                      const SizedBox(height: 12),
                      if (_slabs.isEmpty)
                        const Text(
                          'No slabs yet — delivery is currently FREE for all '
                          'your orders. Add a slab to start charging.',
                          style: TextStyle(
                              color: AppColors.onSurfaceVariant,
                              fontWeight: FontWeight.w600),
                        )
                      else
                        Column(
                          children: _slabs
                              .asMap()
                              .entries
                              .map((e) => _SlabRow(
                                    key: ObjectKey(e.value),
                                    slab: e.value,
                                    onDelete: () => setState(
                                        () => _slabs.removeAt(e.key)),
                                  ))
                              .toList(),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 80),
              ],
            ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? trailing;

  const _Section(
      {required this.title, required this.child, this.trailing});

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
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: AppTextStyles.heading3),
              ?trailing,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
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

  const _SlabRow({
    super.key,
    required this.slab,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: TextFormField(
              initialValue: '${slab.minKg}',
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
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
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
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
            icon: const Icon(Icons.delete_outline,
                color: AppColors.error, size: 20),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}
