import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../data/support_repository.dart';

/// Help & Support hub: quick-contact channels, a ticket form that lands in the
/// admin "Contact Messages" inbox, and a short FAQ.
class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();
  final _repo = SupportRepository();

  static const _subjects = [
    'Order issue',
    'Payment / refund',
    'Product enquiry',
    'Account & login',
    'Seller / subscription',
    'App feedback',
    'Other',
  ];
  String _subject = _subjects.first;

  bool _submitting = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  Future<void> _launch(Uri uri) async {
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _submitting = true);
    final user = ref.read(currentUserProvider).value;
    try {
      await _repo.submitTicket(
        name: _nameCtrl.text,
        email: _emailCtrl.text,
        message: _messageCtrl.text,
        phone: _phoneCtrl.text,
        subject: _subject,
        role: user?.role,
        uid: user?.uid,
      );
      if (!mounted) return;
      _messageCtrl.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Thanks! Your message has been sent to our team.'),
          backgroundColor: AppColors.success,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not send your message. Please try again.'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Prefill the form from the signed-in user once their doc is available.
    final user = ref.watch(currentUserProvider).value;
    if (!_prefilled && user != null) {
      _prefilled = true;
      _nameCtrl.text = user.name;
      _emailCtrl.text = user.email ?? '';
      _phoneCtrl.text = user.phone;
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        titleSpacing: 0,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        flexibleSpace: Container(
          decoration: BoxDecoration(gradient: topBarGradient()),
        ),
        title: Row(
          children: [
            const AppBrandIcon(size: 28),
            const SizedBox(width: 10),
            Text(
              'Help & Support',
              style: AppTextStyles.heading2.copyWith(
                color: Colors.white,
                fontSize: 18,
              ),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Reach us directly', style: AppTextStyles.heading3),
          const SizedBox(height: 4),
          Text(
            'We usually reply within a few hours.',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _ContactCard(
                  icon: Icons.call,
                  label: 'Call',
                  sub: 'Talk to us',
                  color: AppColors.primary,
                  onTap: () => _launch(Uri.parse('tel:${AppConfig.supportPhone}')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ContactCard(
                  icon: Icons.chat,
                  label: 'WhatsApp',
                  sub: 'Chat now',
                  color: const Color(0xFF25D366),
                  onTap: () => _launch(
                    Uri.parse('https://wa.me/${AppConfig.supportWhatsApp}'),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ContactCard(
                  icon: Icons.email_outlined,
                  label: 'Email',
                  sub: 'Write to us',
                  color: AppColors.secondary,
                  onTap: () => _launch(
                    Uri.parse('mailto:${AppConfig.supportEmail}'),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // ── Ticket form ─────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: const [
                BoxShadow(
                  color: AppColors.cardShadow,
                  blurRadius: 6,
                  offset: Offset(0, 2),
                ),
              ],
            ),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Send us a message', style: AppTextStyles.heading3),
                  const SizedBox(height: 4),
                  Text(
                    'Tell us what went wrong and our team will get back to you.',
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _Label('Topic'),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    initialValue: _subject,
                    isExpanded: true,
                    decoration: _inputDecoration(),
                    items: _subjects
                        .map((s) =>
                            DropdownMenuItem(value: s, child: Text(s)))
                        .toList(),
                    onChanged: (v) => setState(() => _subject = v ?? _subject),
                  ),
                  const SizedBox(height: 14),
                  _Label('Your name'),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _nameCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: _inputDecoration(hint: 'Full name'),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'Please enter your name'
                        : null,
                  ),
                  const SizedBox(height: 14),
                  _Label('Email'),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: _inputDecoration(hint: 'you@example.com'),
                    validator: (v) {
                      final t = v?.trim() ?? '';
                      if (t.isEmpty) return 'Please enter your email';
                      if (!t.contains('@') || !t.contains('.')) {
                        return 'Enter a valid email';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  _Label('Phone (optional)'),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: _inputDecoration(hint: 'Contact number'),
                  ),
                  const SizedBox(height: 14),
                  _Label('Message'),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _messageCtrl,
                    maxLines: 5,
                    decoration:
                        _inputDecoration(hint: 'Describe your issue...'),
                    validator: (v) => (v == null || v.trim().length < 10)
                        ? 'Please add a few more details'
                        : null,
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _submitting ? null : _submit,
                      icon: _submitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send, size: 18),
                      label: Text(_submitting ? 'Sending...' : 'Send message'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // ── FAQ ─────────────────────────────────────────────────────
          Text('Frequently asked', style: AppTextStyles.heading3),
          const SizedBox(height: 10),
          ..._faqs.map((f) => _FaqTile(question: f.$1, answer: f.$2)),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  InputDecoration _inputDecoration({String? hint}) => InputDecoration(
        hintText: hint,
        isDense: true,
        filled: true,
        fillColor: AppColors.surfaceVariant,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.divider),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.divider),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
      );

  static const List<(String, String)> _faqs = [
    (
      'How do I track my order?',
      'Open Profile → Order History to see the live status of every order you have placed.'
    ),
    (
      'How are refunds handled?',
      'If a payment fails or an order is cancelled, refunds are processed back to your original payment method within 5–7 business days.'
    ),
    (
      'How do I become a seller?',
      'Sellers need an active subscription. Go to Profile → Seller Dashboard to subscribe and start listing your inventory.'
    ),
    (
      'A store near me is out of stock. What can I do?',
      'On the product page you can compare every store that stocks the item — pick another nearby store, or contact the seller directly from the store details.'
    ),
  ];
}

class _ContactCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String sub;
  final Color color;
  final VoidCallback onTap;

  const _ContactCard({
    required this.icon,
    required this.label,
    required this.sub,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                sub,
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTextStyles.caption.copyWith(
        fontWeight: FontWeight.w700,
        color: AppColors.onSurface,
      ),
    );
  }
}

class _FaqTile extends StatelessWidget {
  final String question;
  final String answer;
  const _FaqTile({required this.question, required this.answer});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          shape: const Border(),
          tilePadding: const EdgeInsets.symmetric(horizontal: 14),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          title: Text(
            question,
            style: AppTextStyles.bodyMedium.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          iconColor: AppColors.primary,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                answer,
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
