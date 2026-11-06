import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../widgets/form_bits.dart';
import '../auth/auth_repository.dart';
import 'customer.dart';
import 'customer_detail_screen.dart';
import 'customer_form_screen.dart';
import 'customers_repository.dart';

enum _Filter { all, due, partners, counter }

class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  String _q = '';
  _Filter _filter = _Filter.all;

  static const _labels = {
    _Filter.all: 'All',
    _Filter.due: 'With dues',
    _Filter.partners: 'B2B partners',
    _Filter.counter: 'Counter',
  };

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final async = ref.watch(customersProvider);
    final all = async.valueOrNull ?? const <Customer>[];
    final q = _q.trim().toLowerCase();
    final digits = phoneKey(_q);
    final list = all.where((c) {
      switch (_filter) {
        case _Filter.due:
          if (c.cachedDue <= 0) return false;
        case _Filter.partners:
          if (c.isPosCustomer) return false;
        case _Filter.counter:
          if (!c.isPosCustomer) return false;
        case _Filter.all:
          break;
      }
      if (q.isEmpty) return true;
      return c.name.toLowerCase().contains(q) ||
          (digits.length >= 3 && phoneKey(c.phone).contains(digits)) ||
          c.placeLine.toLowerCase().contains(q);
    }).toList();
    if (_filter == _Filter.due) list.sort((a, b) => b.cachedDue.compareTo(a.cachedDue));
    final dueTotal = list.fold<double>(0, (s, c) => s + c.cachedDue);
    final canEdit = user?.can.canEditCustomers ?? false;

    return Scaffold(
      floatingActionButton: canEdit
          ? Padding(
              padding: const EdgeInsets.only(bottom: 80),
              child: FloatingActionButton.extended(
                heroTag: 'add-customer',
                onPressed: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const CustomerFormScreen())),
                icon: const Icon(Icons.person_add_alt_1_rounded),
                label: const Text('Customer'),
              ),
            )
          : null,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text('CUSTOMERS', style: kMicro),
                const Spacer(),
                Text('${list.length} SHOWN · DUE ${fmtInrCompact(dueTotal)}', style: kMicro),
              ]),
              const SizedBox(height: 10),
              TextField(
                style: TextStyle(fontSize: 14, color: AppColors.ink),
                decoration: const InputDecoration(
                  hintText: 'Search name, phone or village',
                  prefixIcon: Icon(Icons.search, size: 19),
                  isDense: true,
                ),
                onChanged: (v) => setState(() => _q = v),
              ),
              const SizedBox(height: 10),
              ChoiceRow(
                options: _labels.values.toList(),
                selected: _labels[_filter]!,
                onSelected: (s) => setState(
                    () => _filter = _labels.entries.firstWhere((e) => e.value == s).key),
              ),
              if (user?.can.isScopedToAssignedRetailers ?? false) ...[
                const SizedBox(height: 8),
                Text('Showing only customers assigned to you.',
                    style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
              ],
            ]),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: async.isLoading
                ? const Center(child: CircularProgressIndicator())
                : async.hasError
                    ? Center(child: Text('Could not load customers.', style: TextStyle(color: AppColors.inkMute)))
                    : list.isEmpty
                        ? Center(child: Text('No customers found', style: TextStyle(color: AppColors.inkMute)))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(14, 0, 14, 160),
                            itemCount: list.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (_, i) => _CustomerTile(customer: list[i]),
                          ),
          ),
        ]),
      ),
    );
  }
}

class _CustomerTile extends StatelessWidget {
  const _CustomerTile({required this.customer});
  final Customer customer;

  @override
  Widget build(BuildContext context) {
    final c = customer;
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: c.id))),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: (c.isPosCustomer ? AppColors.pos : AppColors.b2b).withValues(alpha: 0.16),
              child: Text(c.name.isEmpty ? '?' : c.name[0].toUpperCase(),
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: c.isPosCustomer ? AppColors.pos : AppColors.b2b)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: AppColors.ink)),
                const SizedBox(height: 3),
                Text([c.phone, c.placeLine].where((s) => s.isNotEmpty).join('  ·  '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
              ]),
            ),
            const SizedBox(width: 10),
            if (c.cachedDue > 0)
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(fmtInr(c.cachedDue),
                    style: kTabular.copyWith(fontSize: 13.5, color: AppColors.critical)),
                Text('DUE', style: kMicro.copyWith(color: AppColors.critical)),
              ]),
          ]),
        ),
      ),
    );
  }
}
