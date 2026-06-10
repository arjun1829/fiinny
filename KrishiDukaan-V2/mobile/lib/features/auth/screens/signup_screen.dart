import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/utils/phone_utils.dart';
import '../../../core/widgets/loading_overlay.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../data/auth_repository.dart';
import '../../manufacturer/data/manufacturer_repository.dart';

class SignupScreen extends ConsumerStatefulWidget {
  final String? inviteCode;

  const SignupScreen({super.key, this.inviteCode});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _repo = AuthRepository();

  String _role = 'consumer'; // 'consumer', 'retailer', 'manufacturer'
  bool _isLoading = false;
  String? _error;

  // Invite state
  bool _inviteLoading = false;
  Map<String, dynamic>? _inviteDetails;
  bool _isInvitePhonePrefilled = false;

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
    _phoneController.dispose();
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
            final prefilledPhone = details['retailerPhone'] as String? ?? '';
            if (prefilledPhone.isNotEmpty) {
              final digits = prefilledPhone.replaceAll(RegExp(r'\D'), '');
              final tenDigit = (digits.length == 12 && digits.startsWith('91'))
                  ? digits.substring(2)
                  : digits;
              _phoneController.text = tenDigit;
              _isInvitePhonePrefilled = true;
            }
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

  Future<void> _sendOtp() async {
    if (!_formKey.currentState!.validate()) return;

    final name = _nameController.text.trim();
    final rawPhone = _phoneController.text.trim();
    late final String phone;
    try {
      phone = PhoneUtils.normalize(rawPhone);
    } on FormatException {
      setState(() => _error = 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    await _repo.sendOtp(
      phone: phone,
      onCodeSent: (verificationId, resendToken) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        context.go('/login/otp', extra: {
          'phone': phone,
          'verificationId': verificationId,
          'redirect': '/',
          'isSignup': true,
          'signupName': name,
          'signupRole': _role,
          'inviteCode': widget.inviteCode,
        });
      },
      onError: (msg) {
        if (!mounted) return;
        setState(() {
          _isLoading = false;
          _error = msg;
        });
      },
      onAutoVerified: (credential) async {
        if (!mounted) return;
        try {
          final cred = await _repo.signInWithCredential(credential);
          final user = cred.user;
          if (user != null) {
            await _repo.createUser(
              uid: user.uid,
              phone: phone,
              name: name,
              role: _role,
            );
            if (widget.inviteCode != null && widget.inviteCode!.isNotEmpty) {
              await ManufacturerRepository().claimInvite(widget.inviteCode!, phone);
            }
          }
        } catch (_) {
          setState(() {
            _isLoading = false;
            _error = 'Auto-verification failed. Please enter OTP manually.';
          });
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final showInviteBanner = widget.inviteCode != null && widget.inviteCode!.trim().isNotEmpty;
    final manufacturerName = _inviteDetails?['manufacturerName'] as String? ?? 'Manufacturer';

    return LoadingOverlay(
      isLoading: _isLoading || _inviteLoading,
      message: _inviteLoading ? 'Loading invite details...' : 'Sending OTP...',
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
                  const SizedBox(height: 16),
                  // Back to Store link
                  TextButton.icon(
                    onPressed: () => context.go('/'),
                    icon: const Icon(Icons.arrow_back, size: 16, color: AppColors.primary),
                    label: const Text(
                      'Back to Store',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                  const SizedBox(height: 24),
                  // Logo / Brand
                  Center(
                    child: Column(
                      children: [
                        const AppBrandIcon(size: 70, elevated: true),
                        const SizedBox(height: 12),
                        Text('KrishiDukaan', style: AppTextStyles.heading1),
                        const SizedBox(height: 4),
                        Text(
                          'Agri Commerce Platform',
                          style: AppTextStyles.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  Text('Create Account', style: AppTextStyles.heading2),
                  const SizedBox(height: 4),
                  Text(
                    'Join KrishiDukan to manage your agricultural business.',
                    style: AppTextStyles.body.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 20),

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
                  const SizedBox(height: 20),

                  // Name field
                  TextFormField(
                    controller: _nameController,
                    keyboardType: TextInputType.name,
                    textCapitalization: TextCapitalization.words,
                    style: AppTextStyles.body,
                    decoration: InputDecoration(
                      labelText: 'Full Name',
                      hintText: 'Your full name',
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
                  const SizedBox(height: 16),

                  // Phone field
                  TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    readOnly: _isInvitePhonePrefilled,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(10),
                    ],
                    style: AppTextStyles.heading3,
                    decoration: InputDecoration(
                      labelText: 'Mobile Number',
                      prefixIcon: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text('🇮🇳', style: TextStyle(fontSize: 20)),
                            const SizedBox(width: 8),
                            Text(
                              '+91',
                              style: AppTextStyles.bodyMedium.copyWith(
                                color: AppColors.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              width: 1,
                              height: 24,
                              color: AppColors.divider,
                            ),
                          ],
                        ),
                      ),
                      hintText: '10-digit mobile number',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: AppColors.divider),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppColors.primary,
                          width: 2,
                        ),
                      ),
                      filled: true,
                      fillColor: _isInvitePhonePrefilled
                          ? AppColors.surfaceVariant
                          : Colors.white,
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter your mobile number';
                      }
                      if (!PhoneUtils.isValid(value)) {
                        return 'Enter a valid 10-digit mobile number';
                      }
                      return null;
                    },
                  ),
                  if (_isInvitePhonePrefilled) ...[
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.only(left: 4.0),
                      child: Text(
                        'This number was pre-registered by the manufacturer.',
                        style: AppTextStyles.caption.copyWith(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],

                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: AppColors.error.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline,
                              color: AppColors.error, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _error!,
                              style: AppTextStyles.bodySmall.copyWith(
                                color: AppColors.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton(
                      onPressed: _isLoading ? null : _sendOtp,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Send OTP',
                        style: AppTextStyles.button,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  // Link to Login Screen
                  Center(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'Already have an account? ',
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                        GestureDetector(
                          onTap: () => context.go('/login'),
                          child: Text(
                            'Sign In',
                            style: AppTextStyles.bodyMedium.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
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
