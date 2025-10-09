import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import '../../../services/subscriptions/subscriptions_service.dart';
import 'item_tile.dart';

class CategorySheet extends StatefulWidget {
  final String title;
  final String typeKey; // recurring|subscription|emi|reminder
  final List<SharedItem> items;
  final void Function(bool changed) onAction;

  const CategorySheet({
    Key? key,
    required this.title,
    required this.typeKey,
    required this.items,
    required this.onAction,
  }) : super(key: key);

  @override
  State<CategorySheet> createState() => _CategorySheetState();
}

class _CategorySheetState extends State<CategorySheet> {
  final _svc = SubscriptionsService();

  @override
  Widget build(BuildContext context) {
    final active = widget.items.where((e) => e.rule.status != 'ended').toList()
      ..sort((a, b) => _svc.dateOrEpoch(a.nextDueAt).compareTo(_svc.dateOrEpoch(b.nextDueAt)));
    final closed = widget.items.where((e) => e.rule.status == 'ended').toList()
      ..sort((a, b) => _svc.dateOrEpoch(a.nextDueAt).compareTo(_svc.dateOrEpoch(b.nextDueAt)));

    return DraggableScrollableSheet(
      initialChildSize: .85,
      minChildSize: .5,
      maxChildSize: .95,
      expand: false,
      builder: (ctx, controller) => Material(
        color: Colors.white,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(width: 48, height: 5, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(999))),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Text(widget.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Add',
                    onPressed: () => _svc.openAddFromType(context, widget.typeKey),
                    icon: const Icon(Icons.add),
                  ),
                  PopupMenuButton<String>(
                    onSelected: (v) async {
                      if (v == 'close_all') {
                        final ok = await _confirm();
                        if (ok) {
                          await _svc.closeAllOfType(widget.typeKey, widget.items);
                          if (mounted) setState(() {});
                          widget.onAction(true);
                        }
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: 'close_all',
                        child: ListTile(
                          dense: true,
                          leading: Icon(Icons.cancel_schedule_send_outlined),
                          title: Text('Close all active'),
                          visualDensity: VisualDensity(horizontal: -2, vertical: -2),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                children: [
                  if (active.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Text('No active ${widget.typeKey} items', style: TextStyle(color: Colors.grey.shade600)),
                    ),
                  ...active.map((e) => ItemTile(
                    item: e,
                    onChanged: (changed) {
                      if (changed && mounted) setState(() {});
                      widget.onAction(changed);
                    },
                  )),
                  if (closed.isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.only(top: 12, bottom: 6),
                      child: Row(
                        children: [
                          const Icon(Icons.inventory_2_outlined, size: 16),
                          const SizedBox(width: 6),
                          Text('Closed ${widget.typeKey}s', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.grey.shade800)),
                        ],
                      ),
                    ),
                    ...closed.map((e) => ItemTile(
                      item: e,
                      onChanged: (changed) {
                        if (changed && mounted) setState(() {});
                        widget.onAction(changed);
                      },
                    )),
                  ],
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<bool> _confirm() async {
    return await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Are you sure?'),
        content: const Text('This will close all active items in this category.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Yes')),
        ],
      ),
    ) ??
        false;
  }
}
