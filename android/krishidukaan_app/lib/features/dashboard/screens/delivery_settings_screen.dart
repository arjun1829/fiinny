import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../data/dashboard_repository.dart';

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
  bool _freeDelivery = false;
  final _flatChargeCtrl = TextEditingController();
  bool _useSlabs = false;
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
    if (data == null || !mounted) return;
    setState(() {
      _freeDelivery = data['freeDelivery'] as bool? ?? false;
      _flatChargeCtrl.text =
          '${(data['flatCharge'] as num? ?? 0).toInt()}';
      _useSlabs = data['useSlabs'] as bool? ?? false;
      final rawSlabs = data['slabs'] as List? ?? [];
      _slabs.addAll(rawSlabs.map((s) {
        final m = s as Map<String, dynamic>;
        return _WeightSlab(
          upToKg: (m['upToKg'] as num?)?.toDouble() ?? 1,
          charge: (m['charge'] as num?)?.toDouble() ?? 0,
        );
      }));
      _loaded = true;
    });
  }

  @override
  void dispose() {
    _flatChargeCtrl.dispose();
    super.dispose();
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
                // Free delivery toggle
                _Section(
                  title: 'Free Delivery',
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Offer free delivery'),
                    subtitle: const Text(
                        'Customers get free delivery on all orders'),
                    value: _freeDelivery,
                    activeThumbColor: AppColors.primary,
                    onChanged: (v) =>
                        setState(() => _freeDelivery = v),
                  ),
                ),
                const SizedBox(height: 16),

                if (!_freeDelivery) ...[
                  // Flat charge
                  _Section(
                    title: 'Flat Delivery Charge',
                    child: Column(
                      children: [
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Use weight-based slabs'),
                          value: _useSlabs,
                          activeThumbColor: AppColors.primary,
                          onChanged: (v) =>
                              setState(() => _useSlabs = v),
                        ),
                        if (!_useSlabs) ...[
                          const SizedBox(height: 8),
                          TextField(
                            controller: _flatChargeCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Flat charge (₹)',
                              border: OutlineInputBorder(),
                              prefixText: '₹ ',
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Weight slabs
                  if (_useSlabs) ...[
                    _Section(
                      title: 'Weight Slabs',
                      trailing: TextButton.icon(
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('Add Slab'),
                        onPressed: () => setState(() => _slabs.add(
                            _WeightSlab(upToKg: 1, charge: 0))),
                      ),
                      child: _slabs.isEmpty
                          ? const Text(
                              'No slabs yet. Add weight-based delivery charges.',
                              style: TextStyle(
                                  color: AppColors.onSurfaceVariant),
                            )
                          : Column(
                              children: _slabs
                                  .asMap()
                                  .entries
                                  .map((e) => _SlabRow(
                                        index: e.key,
                                        slab: e.value,
                                        onDelete: () => setState(
                                            () => _slabs
                                                .removeAt(e.key)),
                                        onChanged: (slab) =>
                                            setState(() =>
                                                _slabs[e.key] =
                                                    slab),
                                      ))
                                  .toList(),
                            ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ],

                const SizedBox(height: 80),
              ],
            ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final settings = <String, dynamic>{
        'freeDelivery': _freeDelivery,
        'flatCharge':
            double.tryParse(_flatChargeCtrl.text.trim()) ?? 0,
        'useSlabs': _useSlabs,
        'slabs': _slabs
            .map((s) => {'upToKg': s.upToKg, 'charge': s.charge})
            .toList(),
        'updatedAt': DateTime.now().toIso8601String(),
      };
      await DashboardRepository()
          .saveDeliverySettings(widget.sellerPhone, settings);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Delivery settings saved'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
  double upToKg;
  double charge;
  _WeightSlab({required this.upToKg, required this.charge});
}

class _SlabRow extends StatelessWidget {
  final int index;
  final _WeightSlab slab;
  final VoidCallback onDelete;
  final ValueChanged<_WeightSlab> onChanged;

  const _SlabRow({
    required this.index,
    required this.slab,
    required this.onDelete,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: TextFormField(
              initialValue: '${slab.upToKg}',
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Up to (kg)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (v) {
                slab.upToKg = double.tryParse(v) ?? slab.upToKg;
                onChanged(slab);
              },
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
              onChanged: (v) {
                slab.charge = double.tryParse(v) ?? slab.charge;
                onChanged(slab);
              },
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
