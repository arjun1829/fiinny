import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';
import 'auth_repository.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneCtl = TextEditingController();
  bool _valid = false;
  bool _busy = false;

  @override
  void dispose() {
    _phoneCtl.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    if (!_valid || _busy) return;
    setState(() => _busy = true);
    final phone = '+91${_phoneCtl.text}';
    final repo = ref.read(authRepositoryProvider);
    final handle = await repo.sendOtp(
      phoneE164: phone,
      onError: (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_friendly(e))),
        );
      },
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (handle != null) {
      context.push(
        '/otp?phone=${_phoneCtl.text}&vid=${Uri.encodeComponent(handle.verificationId)}',
      );
    }
  }

  String _friendly(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-phone-number':
        return 'That phone number looks invalid.';
      case 'too-many-requests':
        return 'Too many attempts. Try again later.';
      case 'network-request-failed':
        return 'Network error. Check your connection.';
      default:
        return e.message ?? 'Could not send OTP (${e.code}).';
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = ref.watch(localeProvider);
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                Strings.t('login_title', loc),
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'We will send a one-time password to verify your number.',
                style: TextStyle(color: AppColors.muted),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _phoneCtl,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (v) => setState(() => _valid = v.length == 10),
                decoration: InputDecoration(
                  prefixIcon: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    alignment: Alignment.center,
                    width: 64,
                    child: const Text(
                      '+91',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  prefixIconConstraints: const BoxConstraints(minWidth: 64),
                  hintText: '10-digit mobile number',
                  labelText: Strings.t('phone_label', loc),
                  counterText: '',
                ),
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: (_valid && !_busy) ? _sendOtp : null,
                child: _busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : Text(Strings.t('send_otp', loc)),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
