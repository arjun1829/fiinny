import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/utils/phone_utils.dart';
import '../../../core/widgets/loading_overlay.dart';
import '../data/auth_repository.dart';
import '../../manufacturer/data/manufacturer_repository.dart';

class OtpVerificationScreen extends ConsumerStatefulWidget {
  final String phone;
  final String verificationId;
  final String? redirectAfterLogin;
  final bool isSignup;
  final String? signupName;
  final String? signupRole;
  final String? inviteCode;

  const OtpVerificationScreen({
    super.key,
    required this.phone,
    required this.verificationId,
    this.redirectAfterLogin,
    this.isSignup = false,
    this.signupName,
    this.signupRole,
    this.inviteCode,
  });

  @override
  ConsumerState<OtpVerificationScreen> createState() =>
      _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends ConsumerState<OtpVerificationScreen> {
  final _otpController = TextEditingController();
  final _repo = AuthRepository();

  bool _isLoading = false;
  String? _error;
  int _resendSeconds = 30;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startResendTimer();
  }

  @override
  void dispose() {
    _otpController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _startResendTimer() {
    _resendSeconds = 30;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_resendSeconds == 0) {
        timer.cancel();
      } else {
        setState(() => _resendSeconds--);
      }
    });
  }

  Future<void> _verify() async {
    final otp = _otpController.text.trim();
    if (otp.length != 6) {
      setState(() => _error = 'Please enter the 6-digit OTP.');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final credential = await _repo.verifyOtp(
        verificationId: widget.verificationId,
        smsCode: otp,
      );

      if (!mounted) return;

      final user = credential.user!;
      final phone = user.phoneNumber ?? widget.phone;

      if (widget.isSignup) {
        // Create user profile immediately
        await _repo.createUser(
          uid: user.uid,
          phone: phone,
          name: widget.signupName ?? '',
          role: widget.signupRole ?? 'consumer',
        );
        // Claim invite if present
        if (widget.inviteCode != null && widget.inviteCode!.isNotEmpty) {
          await ManufacturerRepository().claimInvite(widget.inviteCode!, phone);
        }
        if (!mounted) return;
        context.go(widget.redirectAfterLogin ?? '/');
      } else {
        // Check if user profile exists
        final exists = await _repo.userExists(phone);
        if (!mounted) return;

        if (!exists) {
          context.go('/onboarding');
        } else {
          // Ensure uidIndex entry exists so myPhone()-based security rules work
          // for users who registered on the web app before the Flutter app existed.
          await _repo.ensureUidIndex(user.uid, phone);
          if (!mounted) return;
          context.go(widget.redirectAfterLogin ?? '/');
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = _parseError(e.toString());
      });
    }
  }

  String _parseError(String error) {
    if (error.contains('invalid-verification-code')) {
      return 'Incorrect OTP. Please check and try again.';
    }
    if (error.contains('session-expired')) {
      return 'OTP expired. Please go back and request a new one.';
    }
    return 'Verification failed. Please try again.';
  }

  @override
  Widget build(BuildContext context) {
    return LoadingOverlay(
      isLoading: _isLoading,
      message: 'Verifying...',
      child: Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          backgroundColor: AppColors.surface,
          elevation: 0,
          leading: BackButton(
            onPressed: () => context.go('/login'),
          ),
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 24),
                Text('Enter OTP', style: AppTextStyles.heading1),
                const SizedBox(height: 8),
                RichText(
                  text: TextSpan(
                    style: AppTextStyles.body.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                    children: [
                      const TextSpan(text: 'OTP sent to '),
                      TextSpan(
                        text: PhoneUtils.toDisplay(widget.phone),
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 40),
                // OTP input
                TextFormField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  textAlign: TextAlign.center,
                  style: AppTextStyles.heading1.copyWith(
                    letterSpacing: 12,
                    color: AppColors.primary,
                  ),
                  decoration: InputDecoration(
                    hintText: '------',
                    hintStyle: AppTextStyles.heading1.copyWith(
                      letterSpacing: 12,
                      color: AppColors.divider,
                    ),
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
                  onChanged: (value) {
                    if (value.length == 6) _verify();
                  },
                ),
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
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.error),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _isLoading ? null : _verify,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Verify OTP', style: AppTextStyles.button),
                  ),
                ),
                const SizedBox(height: 24),
                Center(
                  child: _resendSeconds > 0
                      ? Text(
                          'Resend OTP in ${_resendSeconds}s',
                          style: AppTextStyles.body.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        )
                      : TextButton(
                          onPressed: () {
                            _startResendTimer();
                            context.go('/login');
                          },
                          child: const Text(
                            'Resend OTP',
                            style: TextStyle(color: AppColors.primary),
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
