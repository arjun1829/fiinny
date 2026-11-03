import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../app_state.dart';
import '../core/app_config.dart';
import '../core/sync_service.dart';
import 'common.dart';
import 'export.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) {
        final p = state.prefs;
        return Scaffold(
          appBar: AppBar(title: const Text('Settings')),
          body: ListView(children: [
            ListTile(
              leading: const Icon(Icons.smartphone),
              title: const Text('This phone\'s name'),
              subtitle: Text(p.deviceName),
              trailing: const Icon(Icons.edit),
              onTap: () async {
                final ctl = TextEditingController(text: p.deviceName);
                final v = await showDialog<String>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Phone name'),
                    content: TextField(controller: ctl, autofocus: true),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                      FilledButton(
                          onPressed: () => Navigator.pop(ctx, ctl.text), child: const Text('Save')),
                    ],
                  ),
                );
                if (v != null && v.trim().isNotEmpty) await state.setDeviceName(v);
              },
            ),
            const Divider(),
            ListTile(
              leading: Icon(Icons.cloud, color: state.cloudEnabled ? kGreen : kOrange),
              title: Text(state.cloudEnabled ? 'Cloud sync on' : 'Cloud sync not connected'),
              subtitle: Text(state.cloudEnabled
                  ? 'Team data in its own database (${AppConfig.firestoreDatabase}). '
                      'Last cloud sync: ${p.lastCloudSyncAt == 0 ? 'never' : agoText(p.lastCloudSyncAt)}'
                  : 'Calls are saved on this phone. This build has no cloud config.'),
            ),
            ListTile(
              leading: const Icon(Icons.sync),
              title: const Text('Sync now'),
              subtitle: Text('Last run: ${p.lastSyncAt == 0 ? 'never' : agoText(p.lastSyncAt)}'
                  ' · ${state.unsynced} waiting to upload'),
              trailing: state.syncing
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : null,
              onTap: state.syncing ? null : state.sync,
            ),
            if (p.lastError != null)
              ListTile(
                leading: const Icon(Icons.error_outline, color: kRed),
                title: const Text('Last sync problem'),
                subtitle: Text(p.lastError!),
              ),
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('Re-scan whole call log'),
              subtitle: const Text('Imports anything on this phone that is missing. Safe to repeat.'),
              onTap: () async {
                final n = await SyncService.rescanDeviceLog();
                await state.sync();
                if (context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text('Found $n calls that were missing')));
                }
              },
            ),
            const Divider(),
            SwitchListTile(
              secondary: const Icon(Icons.contacts),
              title: const Text('Save team contacts to this phone'),
              subtitle: const Text('Names saved on any team phone get added to this phone\'s contacts'),
              value: p.saveTeamContactsToPhone,
              onChanged: (v) async {
                await p.setSaveTeamContactsToPhone(v);
                await state.reload();
              },
            ),
            SwitchListTile(
              secondary: const Icon(Icons.notifications),
              title: const Text('Pending call-back notification'),
              value: p.notifyPending,
              onChanged: (v) async {
                await p.setNotifyPending(v);
                await state.reload();
              },
            ),
            ListTile(
              leading: const Icon(Icons.battery_charging_full),
              title: const Text('Keep background sync running'),
              subtitle: const Text('Turn off battery optimisation for this app'),
              onTap: () => Permission.ignoreBatteryOptimizations.request(),
            ),
            ListTile(
              leading: const Icon(Icons.lock_open),
              title: const Text('App permissions'),
              onTap: openAppSettings,
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.file_download_outlined),
              title: const Text('Export all calls'),
              subtitle: Text('${state.calls.length} calls as a CSV (opens in Excel)'),
              onTap: state.calls.isEmpty ? null : () => exportCalls(state, state.calls),
            ),
          ]),
        );
      },
    );
  }
}
