import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../support/data/support_repository.dart';
import '../widgets/about_network_sections.dart';

/// Static "About Krishidukan" page — mirrors web's AboutView.tsx (hero,
/// stats, mission, values, contact form). Content and copy (English/Hindi)
/// are lifted directly from app/i18n/translations.ts's `about*` keys so the
/// story told matches web word for word; the contact form reuses
/// SupportRepository, which already writes to the same `contactMessages`
/// collection web's saveContactMessage does.
class AboutScreen extends ConsumerStatefulWidget {
  const AboutScreen({super.key});

  @override
  ConsumerState<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends ConsumerState<AboutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();
  final _repo = SupportRepository();
  bool _submitting = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _submitting = true);
    try {
      await _repo.submitTicket(
        name: _nameCtrl.text,
        email: _emailCtrl.text,
        message: _messageCtrl.text,
        subject: 'About page contact form',
      );
      if (mounted) {
        _nameCtrl.clear();
        _emailCtrl.clear();
        _messageCtrl.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Message sent. We will get back to you soon.'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not send message: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isHindi = ref.watch(localeProvider).languageCode == 'hi';
    // Admin > About page content; both blocks stay hidden while loading or
    // if the read fails, so the rest of the page never waits on it.
    final content = ref.watch(aboutContentProvider).value;

    final stats = [
      ('2,800+', isHindi ? 'पंजीकृत उपयोगकर्ता' : 'Registered Users'),
      ('275+', isHindi ? 'कृषि दुकानें' : 'Retail Stores'),
      ('35+', isHindi ? 'निर्माता कंपनियाँ' : 'Manufacturers'),
      ('145+', isHindi ? 'सूचीबद्ध उत्पाद' : 'Products Listed'),
    ];

    final values = [
      (
        Icons.verified_user_outlined,
        isHindi ? 'स्थानीय विश्वास' : 'Local Trust',
        isHindi
            ? 'हम आपके क्षेत्र की सत्यापित, सरकार-पंजीकृत कृषि दुकानों के साथ ही साझेदारी करते हैं। गुणवत्ता और प्रामाणिकता सुनिश्चित करने के लिए हर विक्रेता की जांच की जाती है।'
            : 'We partner exclusively with verified, government-registered agricultural stores in your area. Every seller is vetted to ensure quality and authenticity.',
      ),
      (
        Icons.bolt_outlined,
        isHindi ? 'डिजिटल दक्षता' : 'Digital Efficiency',
        isHindi
            ? 'ब्राउज़िंग से लेकर चेकआउट और डिलीवरी ट्रैकिंग तक — हर कदम चलते-फिरते किसान के लिए डिज़ाइन किया गया है। तेज़, आसान, और कम बैंडविड्थ वाले माहौल के लिए बनाया गया।'
            : 'From browsing to checkout to delivery tracking — every step is designed for the farmer on the go. Fast, frictionless, and built for low-bandwidth environments.',
      ),
      (
        Icons.grass_outlined,
        isHindi ? 'किसान पहले' : 'Farmer First',
        isHindi
            ? 'कृषीदुकान किसानों द्वारा, किसानों के लिए बनाया गया है। हमारी कीमतें पारदर्शी हैं, हमारी जानकारी ईमानदार है, और हमारा सपोर्ट आपकी स्थानीय भाषा में है।'
            : 'Krishidukan was built by farmers, for farmers. Our pricing is transparent, our information is honest, and our support is in your local language.',
      ),
      (
        Icons.science_outlined,
        isHindi ? 'गुणवत्ता सुनिश्चित' : 'Quality Assured',
        isHindi
            ? 'कृषीदुकान पर सूचीबद्ध हर उत्पाद हमारी गुणवत्ता जांच से गुजरता है। हम प्रमाणित आपूर्तिकर्ताओं के साथ काम करते हैं और हर लिस्टिंग पर लैब-सत्यापित संरचना डेटा दिखाते हैं।'
            : 'Every product listed on Krishidukan passes our quality checks. We work with certified suppliers and display lab-verified composition data on every listing.',
      ),
    ];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppTopBar(title: isHindi ? 'हमारे बारे में' : 'About'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Hero ─────────────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isHindi ? 'हमारी कहानी' : 'Our Story',
                  style: AppTextStyles.caption.copyWith(
                    color: Colors.white70,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  isHindi
                      ? 'किसानों को आधुनिक कृषि रिटेल से जोड़ते हुए'
                      : 'Bridging Farmers with Modern Agri Retail',
                  style: AppTextStyles.heading1.copyWith(color: Colors.white),
                ),
                const SizedBox(height: 12),
                Text(
                  isHindi
                      ? 'कृषीदुकान की शुरुआत एक सरल विचार से हुई — हर किसान को अपने इलाके में उचित कीमत पर गुणवत्ता वाले कृषि इनपुट्स तक पारदर्शी पहुँच मिलनी चाहिए।'
                      : 'Krishidukan was born from a simple idea — every farmer deserves transparent access to quality agricultural supplies at fair prices, right in their local area.',
                  style: AppTextStyles.body.copyWith(color: Colors.white.withValues(alpha: 0.9)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // ── Stats ────────────────────────────────────────────────────────
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.8,
            children: [
              for (final (value, label) in stats)
                Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(value,
                          style: AppTextStyles.heading1.copyWith(color: AppColors.primary)),
                      const SizedBox(height: 4),
                      Text(label,
                          textAlign: TextAlign.center,
                          style: AppTextStyles.caption.copyWith(color: AppColors.onSurfaceVariant)),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 24),

          // ── Brands connected with us (Admin > About page) ────────────────
          if (content != null && content.showPartners) ...[
            AboutPartnersOrbit(
              label: isHindi ? 'हमारा नेटवर्क' : 'Our Network',
              title: content.partnersTitle ??
                  (isHindi ? 'हमसे जुड़े ब्रांड और कंपनियाँ' : 'Brands & Companies Connected with Us'),
              subtitle: content.partnersSubtitle,
              partners: content.partners,
              centerLogoUrl: content.centerLogoUrl,
            ),
            const SizedBox(height: 24),
          ],

          // ── Mission ──────────────────────────────────────────────────────
          Text(isHindi ? 'हमारा लक्ष्य' : 'Our Mission',
              style: AppTextStyles.caption.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.2,
              )),
          const SizedBox(height: 6),
          Text(
            isHindi
                ? 'हर किसान को सही उपकरण देना'
                : 'Empowering Every Farmer with the Right Tools',
            style: AppTextStyles.heading2,
          ),
          const SizedBox(height: 24),

          // ── Presence across India (Admin > About page) ───────────────────
          if (content != null && content.showPresence) ...[
            AboutPresenceCard(
              label: isHindi ? 'हमारी उपस्थिति' : 'Our Presence',
              title: content.presenceTitle ??
                  (isHindi
                      ? 'पूरे भारत में किसानों और कृषि व्यवसायों का भरोसा।'
                      : 'Trusted by farmers and agri businesses across India.'),
              subtitle: content.presenceSubtitle,
              mapLabel: isHindi
                  ? 'पूरे भारत में कृषीदुकान की उपस्थिति दिखाने वाला नक्शा'
                  : "Map showing KrishiDukan's presence across India",
            ),
            const SizedBox(height: 24),
          ],

          // ── Values ───────────────────────────────────────────────────────
          for (final (icon, title, desc) in values) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
                ],
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, color: AppColors.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: AppTextStyles.bodyMedium),
                        const SizedBox(height: 4),
                        Text(desc, style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),

          // ── Contact form ─────────────────────────────────────────────────
          Text(isHindi ? 'हमसे संपर्क करें' : 'Get in Touch', style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          Form(
            key: _formKey,
            child: Column(
              children: [
                TextFormField(
                  controller: _nameCtrl,
                  decoration: InputDecoration(
                    labelText: isHindi ? 'नाम' : 'Name',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? (isHindi ? 'आवश्यक' : 'Required') : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    labelText: isHindi ? 'ईमेल' : 'Email',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.isEmpty) return isHindi ? 'आवश्यक' : 'Required';
                    if (!value.contains('@')) return isHindi ? 'मान्य ईमेल दर्ज करें' : 'Enter a valid email';
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _messageCtrl,
                  maxLines: 4,
                  decoration: InputDecoration(
                    labelText: isHindi ? 'संदेश' : 'Message',
                    alignLabelWithHint: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? (isHindi ? 'आवश्यक' : 'Required') : null,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(double.infinity, 48),
                    backgroundColor: AppColors.primary,
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(isHindi ? 'संदेश भेजें' : 'Send Message'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
