import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/widgets/app_top_bar.dart';

/// Handles `https://krishidukan.com/invoice/{orderId}` links shared with
/// customers over WhatsApp (see functions/src/wa/templateResolver.ts and
/// app/utils/invoice-generator.ts).
///
/// The PDF itself is already served correctly by the web route
/// (app/invoice/[orderId]/route.ts), which proxies it from Firebase Storage.
/// The bug this screen fixes: krishidukan.com is registered as a verified
/// Android App Link / iOS Universal Link (AndroidManifest.xml, host
/// krishidukan.com), so tapping that WhatsApp link opens THIS APP instead of
/// a browser — and until now the app's go_router had no `/invoice/:orderId`
/// route at all, so it crashed with "GoException: no routes for location"
/// and stranded the customer on a blank error screen with just a Home link.
///
/// Fix: rather than re-implement PDF rendering/Storage access in Flutter,
/// this screen opens the SAME already-working web URL in an embedded browser
/// tab (Android Custom Tabs / iOS SFSafariViewController via
/// LaunchMode.inAppBrowserView). That mode deliberately does NOT go through
/// OS-level App Link/Universal Link resolution, so it renders the real page
/// directly instead of looping back into this same app link handler.
class InvoiceScreen extends StatefulWidget {
  final String orderId;
  const InvoiceScreen({super.key, required this.orderId});

  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  bool _launching = false;
  bool _launchFailed = false;

  Uri get _invoiceUri =>
      Uri.parse('${AppConfig.apiBaseUrl}/invoice/${widget.orderId}');

  @override
  void initState() {
    super.initState();
    // Open automatically on arrival — the manual button below is only a
    // fallback for when the embedded browser can't be launched.
    WidgetsBinding.instance.addPostFrameCallback((_) => _open());
  }

  /// Orders placed in the app (and ones rebuilt by the payment webhook) had no
  /// invoice PDF — only the website built one, in the buyer's browser. Ask the
  /// server to generate it now; it is idempotent, so an order that already has
  /// one is left alone. Best effort: a signed-out visitor from a WhatsApp link,
  /// or an older server, just proceeds to the page as before.
  Future<void> _ensureInvoice() async {
    try {
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (token == null) return;
      await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/orders/invoice'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({'orderId': widget.orderId}),
          )
          .timeout(const Duration(seconds: 20));
    } catch (_) {
      /* the invoice page reports "not generated yet" if it truly is not */
    }
  }

  Future<void> _open() async {
    setState(() {
      _launching = true;
      _launchFailed = false;
    });
    try {
      await _ensureInvoice();
      final ok = await launchUrl(
        _invoiceUri,
        mode: LaunchMode.inAppBrowserView,
      );
      if (!ok) throw Exception('launchUrl returned false');
    } catch (_) {
      if (mounted) setState(() => _launchFailed = true);
    } finally {
      if (mounted) setState(() => _launching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.orderId.isEmpty) {
      return Scaffold(
        appBar: const AppTopBar(title: 'Invoice'),
        body: _Message(
          icon: Icons.receipt_long_outlined,
          title: 'Invoice link is missing an order number.',
        ),
      );
    }

    return Scaffold(
      appBar: const AppTopBar(title: 'Invoice'),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_launching) ...[
                const CircularProgressIndicator(),
                const SizedBox(height: 16),
                Text('Opening your invoice…', style: AppTextStyles.body),
              ] else if (_launchFailed) ...[
                const Icon(Icons.error_outline,
                    size: 48, color: AppColors.error),
                const SizedBox(height: 16),
                Text(
                  "Couldn't open the invoice automatically.",
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body,
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _open,
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Try Again'),
                ),
              ] else ...[
                const Icon(Icons.check_circle_outline,
                    size: 48, color: AppColors.success),
                const SizedBox(height: 16),
                Text('Invoice opened.', style: AppTextStyles.body),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _open,
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Open Again'),
                ),
              ],
              const SizedBox(height: 24),
              TextButton(
                onPressed: () => context.go('/'),
                child: const Text('Home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final IconData icon;
  final String title;
  const _Message({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppColors.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(title, textAlign: TextAlign.center, style: AppTextStyles.body),
          ],
        ),
      ),
    );
  }
}
