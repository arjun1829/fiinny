import 'package:call_log_reader/call_log_reader.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../app_state.dart';
import '../core/background.dart';
import '../core/notifier.dart';
import 'common.dart';

/// First launch: name this phone, grant permissions, import the call history.
class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.state, required this.onDone});
  final AppState state;
  final VoidCallback onDone;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _name = TextEditingController();
  var _callLog = false;
  var _contacts = false;
  var _battery = false;
  var _busy = false;
  String? _status;

  @override
  void initState() {
    super.initState();
    CallLogReader.deviceModel().then((m) {
      if (_name.text.isEmpty) setState(() => _name.text = m);
    });
    _refresh();
  }

  Future<void> _refresh() async {
    final callLog = await CallLogReader.hasPermission();
    final contacts = await Permission.contacts.isGranted;
    final battery = await Permission.ignoreBatteryOptimizations.isGranted;
    if (!mounted) return;
    setState(() {
      _callLog = callLog;
      _contacts = contacts;
      _battery = battery;
    });
  }

  Future<void> _grant() async {
    await Permission.phone.request();
    await Permission.contacts.request();
    await PendingNotifier.requestPermission();
    await _refresh();
    if (!_callLog && mounted) {
      final open = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Call log permission needed'),
          content: const Text(
              'Open Settings → Permissions → Call logs → Allow. The app cannot track calls without it.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Open settings')),
          ],
        ),
      );
      if (open == true) await openAppSettings();
    }
  }

  Future<void> _start() async {
    if (_name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Give this phone a name first')));
      return;
    }
    setState(() {
      _busy = true;
      _status = 'Importing call history from this phone…';
    });
    await widget.state.setDeviceName(_name.text);
    final report = await widget.state.sync();
    await scheduleBackgroundSync();
    await widget.state.prefs.setSetupDone();
    setState(() => _status = 'Imported ${report.imported} calls'
        '${report.pulled > 0 ? ', ${report.pulled} from other phones' : ''}.');
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Set up Call Tracker')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('1. Name this phone', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 4),
        const Text('Shown next to every call so you know which phone took it.'),
        const SizedBox(height: 8),
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
              border: OutlineInputBorder(), hintText: 'e.g. Office phone – Ramesh'),
        ),
        const SizedBox(height: 24),
        const Text('2. Allow access', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        _PermRow('Call log and calling', _callLog),
        _PermRow('Contacts (read names, save new ones)', _contacts),
        const SizedBox(height: 8),
        OutlinedButton.icon(
            onPressed: _busy ? null : _grant,
            icon: const Icon(Icons.verified_user),
            label: const Text('Allow permissions')),
        const SizedBox(height: 24),
        const Text('3. Keep syncing in the background',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const Text('Stops Android from pausing the app. Needed on Xiaomi, Oppo, Vivo, Realme.'),
        _PermRow('Battery optimisation off', _battery),
        OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () async {
                  await Permission.ignoreBatteryOptimizations.request();
                  await _refresh();
                },
          icon: const Icon(Icons.battery_charging_full),
          label: const Text('Turn off battery optimisation'),
        ),
        const SizedBox(height: 32),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _busy || !_callLog ? null : _start,
          icon: _busy
              ? const SizedBox(
                  width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.download),
          label: const Text('Import call history and start'),
        ),
        if (_status != null) ...[
          const SizedBox(height: 12),
          Text(_status!, textAlign: TextAlign.center),
        ],
      ]),
    );
  }
}

class _PermRow extends StatelessWidget {
  const _PermRow(this.label, this.ok);
  final String label;
  final bool ok;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        dense: true,
        leading: Icon(ok ? Icons.check_circle : Icons.radio_button_unchecked,
            color: ok ? kGreen : kGrey),
        title: Text(label),
      );
}
