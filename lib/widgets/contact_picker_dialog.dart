import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';

class ContactPickerDialog extends StatefulWidget {
  final List<Contact> contacts;
  final bool singleSelect; // NEW: Enable single or multi selection

  const ContactPickerDialog({
    super.key,
    required this.contacts,
    this.singleSelect = false,
  });

  @override
  State<ContactPickerDialog> createState() => _ContactPickerDialogState();
}

class _ContactPickerDialogState extends State<ContactPickerDialog> {
  late List<Contact> filteredContacts;
  List<Contact> selectedContacts = [];
  String searchQuery = "";

  @override
  void initState() {
    super.initState();
    filteredContacts = widget.contacts;
  }

  void _filter(String query) {
    setState(() {
      searchQuery = query;
      filteredContacts = widget.contacts
          .where((c) =>
              c.displayName.toLowerCase().contains(query.toLowerCase()) ||
              (c.phones.isNotEmpty && c.phones.first.number.contains(query)))
          .toList();
    });
  }

  void _toggleSelection(Contact contact) {
    if (widget.singleSelect) {
      // Single select: return contact immediately
      Navigator.pop(context, contact);
      return;
    }
    setState(() {
      if (selectedContacts.contains(contact)) {
        selectedContacts.remove(contact);
      } else {
        selectedContacts.add(contact);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Select Contacts'),
      content: SizedBox(
        width: double.maxFinite,
        height: 400,
        child: Column(
          children: [
            TextField(
              decoration: const InputDecoration(
                labelText: "Search",
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: _filter,
            ),
            const SizedBox(height: 10),
            Expanded(
              child: filteredContacts.isEmpty
                  ? const Center(child: Text('No contacts found.'))
                  : ListView.builder(
                      itemCount: filteredContacts.length,
                      itemBuilder: (context, index) {
                        final contact = filteredContacts[index];
                        final selected = selectedContacts.contains(contact);
                        return ListTile(
                          leading: CircleAvatar(
                            child: Text(contact.displayName.isNotEmpty
                                ? contact.displayName[0]
                                : '?'),
                          ),
                          title: Text(contact.displayName),
                          subtitle: Text(
                            contact.phones.isNotEmpty
                                ? contact.phones.first.number
                                : (contact.emails.isNotEmpty
                                    ? contact.emails.first.address
                                    : ''),
                          ),
                          trailing: widget.singleSelect
                              ? null
                              : Checkbox(
                                  value: selected,
                                  onChanged: (val) => _toggleSelection(contact),
                                ),
                          onTap: () => _toggleSelection(contact),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
      actions: widget.singleSelect
          ? [
              TextButton(
                child: const Text("Cancel"),
                onPressed: () => Navigator.pop(context, null),
              ),
            ]
          : [
              TextButton(
                child: const Text("Cancel"),
                onPressed: () => Navigator.pop(context, null),
              ),
              ElevatedButton(
                onPressed: selectedContacts.isEmpty
                    ? null
                    : () => Navigator.pop(context, selectedContacts),
                child: const Text("Add Selected"),
              ),
            ],
    );
  }
}
