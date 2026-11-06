import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/widgets/back_or_home_button.dart';

/// Opens a brand page from its website address, krishidukan.com/brand/{slug}
/// (the brand page's own link, e.g. shared from a browser): finds the
/// manufacturer with that slug and replaces itself with /brand/{phone}.
/// Shared links by phone (/brand/+91…) go straight to the brand screen.
class BrandLinkScreen extends StatefulWidget {
  final String slug;
  const BrandLinkScreen({super.key, required this.slug});

  @override
  State<BrandLinkScreen> createState() => _BrandLinkScreenState();
}

class _BrandLinkScreenState extends State<BrandLinkScreen> {
  bool _notFound = false;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('manufacturers')
          .where('slug', isEqualTo: widget.slug)
          .limit(1)
          .get();
      if (!mounted) return;
      if (snap.docs.isNotEmpty) {
        // Replace only this page, keeping whatever was underneath.
        context.pushReplacement('/brand/${snap.docs.first.id}');
        return;
      }
    } catch (_) {
      // Offline or refused: show the message below.
    }
    if (mounted) setState(() => _notFound = true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(leading: const BackOrHomeButton(fallback: '/')),
      body: Center(
        child: _notFound
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.storefront_outlined, size: 48, color: AppColors.primary),
                    const SizedBox(height: 12),
                    const Text('This brand page could not be found.', textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => context.go('/'),
                      child: const Text('Go to Home'),
                    ),
                  ],
                ),
              )
            : const CircularProgressIndicator(),
      ),
    );
  }
}
