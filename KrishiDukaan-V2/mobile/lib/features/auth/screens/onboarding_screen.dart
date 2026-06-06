import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/widgets/loading_overlay.dart';
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

  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
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
    return LoadingOverlay(
      isLoading: _isLoading,
      message: 'Creating your profile...',
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
                  const SizedBox(height: 48),
                  Center(
                    child: Column(
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Icon(
                            Icons.person_add,
                            size: 44,
                            color: AppColors.primary,
                          ),
                        ),
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
                  const SizedBox(height: 56),
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
                  if (widget.inviteCode != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: AppColors.primary.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle,
                              color: AppColors.primary, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Invite code applied — you\'ll be added as a retailer',
                              style: AppTextStyles.bodySmall
                                  .copyWith(color: AppColors.onPrimaryContainer),
                            ),
                          ),
                        ],
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
