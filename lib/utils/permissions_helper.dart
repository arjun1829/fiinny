import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter/material.dart';

Future<List<Contact>> getContactsWithPermission(BuildContext context) async {
  // Request permission using flutter_contacts
  if (await FlutterContacts.requestPermission()) {
    // Permission granted, fetch contacts
    return await FlutterContacts.getContacts(withProperties: true);
  } else {
    // Permission denied, check if permanently denied
    final isPermanentlyDenied = await Permission.contacts.isPermanentlyDenied;
    if (isPermanentlyDenied) {
      // Show dialog guiding to settings
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text("Contacts Permission Needed"),
          content: Text(
            "To add friends from your contacts, enable Contacts permission for Fiinny in Settings.",
          ),
          actions: [
            TextButton(
              child: Text("Cancel"),
              onPressed: () => Navigator.pop(ctx),
            ),
            TextButton(
              child: Text("Open Settings"),
              onPressed: () {
                openAppSettings();
                Navigator.pop(ctx);
              },
            ),
          ],
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Contacts permission denied.")),
      );
    }
    return [];
  }
}
