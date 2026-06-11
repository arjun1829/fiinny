import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/widgets/loading_overlay.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../data/auth_repository.dart';
import '../../manufacturer/data/manufacturer_repository.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  final String? inviteCode;

  const OnboardingScreen({super.key, this.inviteCode});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _repo = AuthRepository();

  String _role = 'consumer'; // 'consumer', 'retailer', 'manufacturer'
  bool _isLoading = false;
  String? _error;

  // Invite state
  bool _inviteLoading = false;
  Map<String, dynamic>? _inviteDetails;

  @override
  void initState() {
    super.initState();
    if (widget.inviteCode != null && widget.inviteCode!.trim().isNotEmpty) {
      _loadInviteDetails(widget.inviteCode!.trim());
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _loadInviteDetails(String code) async {
    setState(() {
      _inviteLoading = true;
      _error = null;
    });

    try {
      final details = await ManufacturerRepository().fetchInviteDetails(code);
      if (details != null && mounted) {
        setState(() {
          _inviteDetails = details;
          final isClaimable = details['claimable'] == true || details['status'] == 'invited';
          if (isClaimable) {
            _role = 'retailer';
          }
        });
      }
    } catch (e) {
      // Non-blocking error
    } finally {
      if (mounted) {
        setState(() => _inviteLoading = false);
      }
    }
  }

  Future<void> _createProfile() async {
    if (!_formKey.currentState!.validate()) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      context.go('/login');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final phone = user.phoneNumber ?? '';
      await _repo.createUser(
        uid: user.uid,
        phone: phone,
        name: _nameController.text.trim(),
        role: _role,
      );

      // Claim invite if present (Phase 5)
      if (widget.inviteCode != null && widget.inviteCode!.isNotEmpty) {
        await ManufacturerRepository()
            .claimInvite(widget.inviteCode!, phone);
      }

      if (!mounted) return;
      context.go('/');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = 'Failed to create profile. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final showInviteBanner = widget.inviteCode != null && widget.inviteCode!.trim().isNotEmpty;
    final manufacturerName = _inviteDetails?['manufacturerName'] as String? ?? 'Manufacturer';

    return LoadingOverlay(
      isLoading: _isLoading || _inviteLoading,
      message: _inviteLoading ? 'Loading invite details...' : 'Creating your profile...',
      child: Scaffold(
        backgroundColor: AppColors.surface,
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 32),
                  Center(
                    child: Column(
                      children: [
                        const AppBrandIcon(size: 80, elevated: true),
                        const SizedBox(height: 16),
                        Text('Welcome!', style: AppTextStyles.heading1),
                        const SizedBox(height: 4),
                        Text(
                          'Let\'s set up your profile',
                          style: AppTextStyles.body
                              .copyWith(color: AppColors.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 40),

                  // Invite Banner
                  if (showInviteBanner) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.primary.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.mail_outline, color: AppColors.primary, size: 20),
                              const SizedBox(width: 8),
                              Text(
                                'Manufacturer Invite',
                                style: AppTextStyles.bodyMedium.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.primary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'You have been invited by $manufacturerName to join their network as a retailer.',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Your account type must be Retailer.',
                            style: AppTextStyles.caption.copyWith(
                              fontWeight: FontWeight.bold,
                              color: AppColors.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],

                  // Role Selection Header
                  Text(
                    'I am a…',
                    style: AppTextStyles.caption.copyWith(
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Role Cards Row
                  Row(
                    children: [
                      _RoleCard(
                        title: 'Farmer',
                        subtitle: 'Buy products',
                        icon: Icons.agriculture_outlined,
                        isSelected: _role == 'consumer',
                        onTap: showInviteBanner ? () {} : () => setState(() => _role = 'consumer'),
                      ),
                      const SizedBox(width: 8),
                      _RoleCard(
                        title: 'Retailer',
                        subtitle: 'Run a shop',
                        icon: Icons.storefront_outlined,
                        isSelected: _role == 'retailer',
                        onTap: showInviteBanner ? () {} : () => setState(() => _role = 'retailer'),
                      ),
                      const SizedBox(width: 8),
                      _RoleCard(
                        title: 'Manufacturer',
                        subtitle: 'Supply items',
                        icon: Icons.factory_outlined,
                        isSelected: _role == 'manufacturer',
                        onTap: showInviteBanner ? () {} : () => setState(() => _role = 'manufacturer'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  Text('Your name', style: AppTextStyles.heading3),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _nameController,
                    keyboardType: TextInputType.name,
                    textCapitalization: TextCapitalization.words,
                    style: AppTextStyles.body,
                    decoration: InputDecoration(
                      hintText: 'Enter your full name',
                      prefixIcon: const Icon(Icons.person_outline),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppColors.primary,
                          width: 2,
                        ),
                      ),
                      filled: true,
                      fillColor: Colors.white,
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Please enter your name';
                      }
                      if (value.trim().length < 2) {
                        return 'Name must be at least 2 characters';
                      }
                      return null;
                    },
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _error!,
                        style: AppTextStyles.bodySmall
                            .copyWith(color: AppColors.error),
                      ),
                    ),
                  ],
                  const SizedBox(height: 40),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton(
                      onPressed: _isLoading ? null : _createProfile,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Get Started',
                        style: AppTextStyles.button,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  const _RoleCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final activeBg = isSelected
        ? AppColors.primary.withValues(alpha: 0.1)
        : Colors.white;
    final activeBorder = isSelected
        ? AppColors.primary
        : AppColors.divider;
    final activeIconColor = isSelected
        ? AppColors.primary
        : AppColors.onSurfaceVariant;

    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 4),
          decoration: BoxDecoration(
            color: activeBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: activeBorder,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 28,
                color: activeIconColor,
              ),
              const SizedBox(height: 8),
              Text(
                title,
                style: AppTextStyles.bodySmall.copyWith(
                  fontWeight: FontWeight.bold,
                  color: isSelected ? AppColors.primary : AppColors.onSurface,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: AppTextStyles.caption.copyWith(
                  fontSize: 9,
                  color: AppColors.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
