import 'package:flutter/material.dart';
import '../models/friend_model.dart';

Future<Map<String, double>?> showCustomSplitDialog(
  BuildContext context,
  List<FriendModel> members,
  double totalAmount, {
  Map<String, double>? initialSplits,
}) {
  final controllers = {
    for (var m in members)
      (m.phone): TextEditingController(
        text: (initialSplits?[m.phone] ?? (totalAmount / members.length))
            .toStringAsFixed(2),
      )
  };
  return showDialog<Map<String, double>>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text("Custom Split"),
      content: SizedBox(
        width: 300,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ...members.map((m) => Row(
                  children: [
                    Text('${m.avatar} ${m.name}'),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: controllers[m.phone],
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(hintText: "Amount"),
                      ),
                    ),
                  ],
                )),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, null),
          child: const Text("Cancel"),
        ),
        ElevatedButton(
          onPressed: () {
            final Map<String, double> splits = {};
            double total = 0.0;
            for (var m in members) {
              final key = m.phone;
              final v = double.tryParse(controllers[key]?.text ?? "") ?? 0;
              splits[key] = v;
              total += v;
            }
            if ((total - totalAmount).abs() > 0.01) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(content: Text("Split must total to $totalAmount")),
              );
              return;
            }
            Navigator.pop(ctx, splits);
          },
          child: const Text("Save"),
        ),
      ],
    ),
  );
}
