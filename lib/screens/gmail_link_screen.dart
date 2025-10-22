// lib/screens/gmail_link_screen.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../widgets/gmail_backfill_banner.dart';
import '../services/gmail_service.dart' as OldGmail;

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
    final doc = await FirebaseFirestore.instance.collection('users').doc(widget.userPhone).get();
    final data = doc.data() ?? {};
    setState(() {
      _email = (data['email'] ?? '').toString().trim().isEmpty ? null : (data['email'] as String);
      _linked = _email != null && _email!.isNotEmpty;
    });
  }

  Future<void> _setGmailStatus(String status, {String? error}) async {
    final docRef = FirebaseFirestore.instance.collection('users').doc(widget.userPhone);
    await docRef.set({
      'gmailBackfillStatus': status,
      if (error != null) 'gmailBackfillError': error,
      'gmailBackfillUpdatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> _link() async {
    setState(() => _busy = true);
    try {
      final google = GoogleSignIn(scopes: const ['email', 'https://www.googleapis.com/auth/gmail.readonly']);
      final acc = await google.signIn();
      if (acc == null) {
        setState(() => _busy = false);
        return;
      }

      await FirebaseFirestore.instance.collection('users').doc(widget.userPhone).set({
        'email': acc.email,
        'gmailLinkedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      setState(() {
        _email = acc.email;
        _linked = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gmail linked')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Link failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disconnect() async {
    setState(() => _busy = true);
    try {
      final google = GoogleSignIn();
      await google.disconnect().catchError((_) {});
      await FirebaseFirestore.instance.collection('users').doc(widget.userPhone).set({
        'email': FieldValue.delete(),
        'gmailBackfillStatus': 'idle',
        'gmailBackfillError': FieldValue.delete(),
      }, SetOptions(merge: true));
      setState(() {
        _email = null;
        _linked = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gmail disconnected')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Disconnect failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _retryImport() async {
    if (!_linked) return;
    setState(() => _busy = true);
    try {
      await _setGmailStatus('running');
      await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
      await _setGmailStatus('ok');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Email transactions imported')));
      }
    } catch (e) {
      await _setGmailStatus('error', error: e.toString());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Import failed: $e')));
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
                      Text('Status', style: Fx.title),
                    ]),
                    const SizedBox(height: 6),
                    _linked
                        ? Text('Linked as: ${_email!}', style: Fx.label)
                        : Text('Not linked', style: Fx.label.copyWith(color: Colors.redAccent)),
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
                      const Icon(Icons.info_outline_rounded, color: Fx.mintDark),
                      const SizedBox(width: Fx.s8),
                      Text('What we read', style: Fx.title),
                    ]),
                    const SizedBox(height: 6),
                    Text('Read-only Gmail statements to detect income/expenses (no sending, no deletion).', style: Fx.label),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (!_linked)
                FilledButton.icon(
                  onPressed: _busy ? null : _link,
                  icon: const Icon(Icons.link_rounded),
                  label: const Text('Link Gmail'),
                ),
              if (_linked) ...[
                FilledButton.icon(
                  onPressed: _busy ? null : _retryImport,
                  icon: const Icon(Icons.sync_rounded),
                  label: const Text('Retry Import'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _disconnect,
                  icon: const Icon(Icons.link_off_rounded),
                  label: const Text('Disconnect'),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _bg() => IgnorePointer(
        ignoring: true,
        child: Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              colors: [
                Fx.mint.withOpacity(.10),
                Fx.mintDark.withOpacity(.06),
                Colors.white.withOpacity(.60),
              ],
              center: Alignment.topLeft,
              radius: .9,
            ),
          ),
        ),
      );
}
