import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import 'customer.dart';
import 'customers_repository.dart';

/// Bottom-sheet customer search by name, phone or village. Pops with the
/// chosen [Customer]. [b2bOnly] hides POS counter customers (channel 'pos'),
/// matching how the web B2B form lists partners first.
Future<Customer?> pickCustomer(BuildContext context, {bool b2bOnly = false}) =>
    showModalBottomSheet<Customer>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(
        heightFactor: 0.92,
        child: _CustomerPicker(b2bOnly: b2bOnly),
      ),
    );

class _CustomerPicker extends ConsumerStatefulWidget {
  const _CustomerPicker({required this.b2bOnly});
  final bool b2bOnly;

  @override
  ConsumerState<_CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends ConsumerState<_CustomerPicker> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(customersProvider);
    final all = (async.valueOrNull ?? const <Customer>[])
        .where((c) => !widget.b2bOnly || !c.isPosCustomer)
        .toList();
    final q = _q.trim().toLowerCase();
    final digits = phoneKey(_q);
    final list = q.isEmpty
        ? all
        : all
            .where((c) =>
                c.name.toLowerCase().contains(q) ||
                (digits.length >= 3 && phoneKey(c.phone).contains(digits)) ||
                c.placeLine.toLowerCase().contains(q))
            .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          child: TextField(
            autofocus: true,
            style: TextStyle(fontSize: 14, color: AppColors.ink),
            decoration: const InputDecoration(
              hintText: 'Search name, phone or village',
              prefixIcon: Icon(Icons.search, size: 19),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _q = v),
          ),
        ),
        Expanded(
          child: async.isLoading
              ? const Center(child: CircularProgressIndicator())
              : list.isEmpty
                  ? Center(
                      child: Text('No matching customers',
                          style: TextStyle(color: AppColors.inkMute)))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (_, i) {
                        final c = list[i];
                        return Material(
                          color: AppColors.card,
                          borderRadius: BorderRadius.circular(14),
                          child: ListTile(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                              side: BorderSide(color: AppColors.border),
                            ),
                            dense: true,
                            title: Text(c.name,
                                style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.ink)),
                            subtitle: Text(
                              [c.phone, c.placeLine]
                                  .where((s) => s.isNotEmpty)
                                  .join('  ·  '),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 11.5, color: AppColors.inkMute),
                            ),
                            trailing: c.cachedDue > 0
                                ? Text(fmtInr(c.cachedDue),
                                    style: kTabular.copyWith(
                                        fontSize: 12.5,
                                        color: AppColors.critical))
                                : null,
                            onTap: () => Navigator.of(context).pop(c),
                          ),
                        );
                      },
                    ),
        ),
      ],
    );
  }
}
