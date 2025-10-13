import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:permission_handler/permission_handler.dart';

/// The final permission state after attempting to access contacts.
enum ContactsPermissionState {
  granted,
  denied,
  permanentlyDenied,
  error,
}

class ContactsLoadResult {
  const ContactsLoadResult._({
    required this.contacts,
    required this.state,
    this.error,
  });

  factory ContactsLoadResult.granted(List<Contact> contacts) =>
      ContactsLoadResult._(contacts: contacts, state: ContactsPermissionState.granted);

  factory ContactsLoadResult.denied({bool permanently = false}) =>
      ContactsLoadResult._(
        contacts: const [],
        state: permanently
            ? ContactsPermissionState.permanentlyDenied
            : ContactsPermissionState.denied,
      );

  factory ContactsLoadResult.error(Object error) => ContactsLoadResult._(
        contacts: const [],
        state: ContactsPermissionState.error,
        error: error,
      );

  final List<Contact> contacts;
  final ContactsPermissionState state;
  final Object? error;

  bool get granted => state == ContactsPermissionState.granted;
  bool get permanentlyDenied => state == ContactsPermissionState.permanentlyDenied;
  bool get denied => state == ContactsPermissionState.denied;
  bool get hasError => state == ContactsPermissionState.error && error != null;
}

/// Attempts to request the Contacts runtime permission and load contacts.
///
/// The helper returns a [ContactsLoadResult] describing the final state. The
/// caller is expected to surface UI (snackbars/dialogs) based on that state.
Future<ContactsLoadResult> getContactsWithPermission({
  bool includePhotos = false,
  bool onlyWithPhoneNumbers = true,
}) async {
  try {
    PermissionStatus status = await Permission.contacts.status;

    if (status.isPermanentlyDenied) {
      return ContactsLoadResult.denied(permanently: true);
    }

    if (!status.isGranted && !status.isLimited) {
      status = await Permission.contacts.request();
    }

    if (status.isPermanentlyDenied) {
      return ContactsLoadResult.denied(permanently: true);
    }

    if (!status.isGranted && !status.isLimited) {
      return ContactsLoadResult.denied();
    }

    final granted = await FlutterContacts.requestPermission(readonly: true);
    if (!granted) {
      return ContactsLoadResult.denied();
    }

    final contacts = await FlutterContacts.getContacts(
      withProperties: true,
      withPhoto: includePhotos,
    );

    final filtered = contacts
        .where((c) => !onlyWithPhoneNumbers || c.phones.isNotEmpty)
        .toList()
      ..sort((a, b) =>
          a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));

    return ContactsLoadResult.granted(filtered);
  } catch (e, stack) {
    debugPrint('getContactsWithPermission failed: $e\n$stack');
    return ContactsLoadResult.error(e);
  }
}

/// Shows a dialog guiding the user to the system settings when the contacts
/// permission has been permanently denied.
Future<void> showContactsPermissionSettingsDialog(BuildContext context) async {
  if (!context.mounted) return;

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Contacts permission needed'),
      content: const Text(
        'To add friends from your contacts, enable the Contacts permission for Fiinny in Settings.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Not now'),
        ),
        TextButton(
          onPressed: () {
            openAppSettings();
            Navigator.of(ctx).pop();
          },
          child: const Text('Open settings'),
        ),
      ],
    ),
  );
}
