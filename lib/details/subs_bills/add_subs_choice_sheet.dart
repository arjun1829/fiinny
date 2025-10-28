// lib/details/subs_bills/add_subs_choice_sheet.dart
import 'package:flutter/material.dart';

class AddSubsChoice {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const AddSubsChoice({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
}

class AddSubsChoiceSheet extends StatelessWidget {
  final List<AddSubsChoice> choices;
  final String? heading;

  const AddSubsChoiceSheet({super.key, required this.choices, this.heading});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (heading != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Text(
                      heading!,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
            for (final choice in choices) ...[
              ListTile(
                leading: CircleAvatar(
                  radius: 22,
                  backgroundColor: Colors.teal.withOpacity(.12),
                  child: Icon(choice.icon, color: Colors.teal.shade700),
                ),
                title: Text(
                  choice.title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text(choice.subtitle),
                onTap: choice.onTap,
              ),
              const Divider(height: 1),
            ],
          ],
        ),
      ),
    );
  }
}
