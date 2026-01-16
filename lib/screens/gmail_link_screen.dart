// lib/screens/gmail_link_screen.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../widgets/gmail_backfill_banner.dart';
import '../services/gmail_service.dart' as legacy_gmail;

class GmailLinkScreen extends StatefulWidget {
  final String userPhone;
  const GmailLinkScreen({super.key, required this.userPhone});

  @override
  State<GmailLinkScreen> createState() => _GmailLinkScreenState();
}

class _GmailLinkScreenState extends State<GmailLinkScreen> {
  bool _busy = false;
  String? _email;
  bool _linked = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final doc = await FirebaseFirestore.instance
        .collection('users')
        .doc(widget.userPhone)
        .get();
    if (!mounted) return;
    final data = doc.data() ?? {};
    setState(() {
      _email = (data['email'] ?? '').toString().trim().isEmpty
          ? null
          : (data['email'] as String);
      _linked = _email != null && _email!.isNotEmpty;
    });
  }

  Future<void> _setGmailStatus(String status, {String? error}) async {
    final docRef =
        FirebaseFirestore.instance.collection('users').doc(widget.userPhone);
    await docRef.set({
      'gmailBackfillStatus': status,
      if (error != null) 'gmailBackfillError': error,
      'gmailBackfillUpdatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> _link() async {
    setState(() => _busy = true);
    try {
      final google = GoogleSignIn(scopes: const [
        'email',
        'https://www.googleapis.com/auth/gmail.readonly'
      ]);
      final acc = await google.signIn();
      if (acc == null) {
        if (mounted) setState(() => _busy = false);
        return;
      }

      await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .set({
        'email': acc.email,
        'gmailLinkedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      if (mounted) {
        setState(() {
          _email = acc.email;
          _linked = true;
        });
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Gmail linked')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Link failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disconnect() async {
    setState(() => _busy = true);
    try {
      final google = GoogleSignIn();
      await google.disconnect().catchError((dynamic _) => null);
      await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .set({
        'email': FieldValue.delete(),
        'gmailBackfillStatus': 'idle',
        'gmailBackfillError': FieldValue.delete(),
      }, SetOptions(merge: true));
      if (mounted) {
        setState(() {
          _email = null;
          _linked = false;
        });
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Gmail disconnected')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Disconnect failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _retryImport() async {
    if (!_linked) return;
    setState(() => _busy = true);
    try {
      await _setGmailStatus('running');
      await legacy_gmail.GmailService()
          .fetchAndStoreTransactionsFromGmail(widget.userPhone);
      await _setGmailStatus('ok');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Email transactions imported')));
      }
    } catch (e) {
      await _setGmailStatus('error', error: e.toString());
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Import failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gmail Linking'),
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Fx.mintDark,
      ),
      body: Stack(
        children: [
          _bg(),
          ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              GmailBackfillBanner(
                userId: widget.userPhone,
                isLinked: _linked,
                onRetry: _busy ? null : _retryImport,
              ),
              const SizedBox(height: 8),
              GlassCard(
                radius: Fx.r24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      const Icon(Icons.mail_rounded, color: Fx.mintDark),
                      const SizedBox(width: Fx.s8),
                      Text('Linked Accounts', style: Fx.title),
                    ]),
                    const SizedBox(height: 12),
                    if (_linked && _email != null)
                      _buildAccountRow(_email!, 'Gmail'),
                    if (!_linked)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text('No accounts linked yet.',
                            style: Fx.label.copyWith(color: Colors.grey)),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GlassCard(
                radius: Fx.r24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      const Icon(Icons.info_outline_rounded,
                          color: Fx.mintDark),
                      const SizedBox(width: Fx.s8),
                      Text('How it works', style: Fx.title),
                    ]),
                    const SizedBox(height: 6),
                    Text(
                        'We read statements to detect expenses purely on your device/cloud. No data is shared with third parties.',
                        style: Fx.label),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Actions
              if (_linked) ...[
                FilledButton.icon(
                  onPressed: _busy ? null : _retryImport,
                  icon: const Icon(Icons.sync_rounded),
                  label: const Text('Sync Now'),
                  style: FilledButton.styleFrom(backgroundColor: Fx.mintDark),
                ),
                const SizedBox(height: 12),
              ],

              // Add Account Buttons
              OutlinedButton.icon(
                onPressed: _busy ? null : _link,
                icon: const Icon(Icons.add_rounded),
                label: const Text('Add Gmail Account'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _busy ? null : _showOutlookInfo,
                icon: const Icon(Icons.mail_outline_rounded),
                label: const Text('Add Outlook Account (Beta)'),
              ),

              if (_linked) ...[
                const SizedBox(height: 24),
                Center(
                  child: TextButton(
                    onPressed: _busy ? null : _disconnect,
                    child: const Text('Unlink all accounts',
                        style: TextStyle(color: Colors.redAccent)),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAccountRow(String email, String provider) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Fx.mint.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: Colors.white,
            radius: 16,
            backgroundImage: provider == 'Gmail'
                ? const NetworkImage(
                    'https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg')
                : null,
            child:
                provider == 'Outlook' ? const Icon(Icons.mail, size: 16) : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(email,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(provider,
                    style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
          ),
          const Icon(Icons.check_circle_rounded, color: Colors.green, size: 20),
        ],
      ),
    );
  }

  void _showOutlookInfo() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Outlook Support'),
        content: const Text(
            'Outlook integration is currently in Beta and free for all users.\n\nTo enable it, we need to register a Microsoft App. This feature will be rolled out in the next update automatically!'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Got it')),
        ],
      ),
    );
  }

  Widget _bg() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.white, Color(0xFFE0F2F1)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
    );
  }
}
