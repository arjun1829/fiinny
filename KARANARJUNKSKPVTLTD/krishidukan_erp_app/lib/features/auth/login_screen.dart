import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../widgets/ui.dart';
import 'auth_repository.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on FirebaseAuthException catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Something went wrong. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _message(FirebaseAuthException e) => switch (e.code) {
        'invalid-email' => 'That email address is not valid.',
        'user-disabled' => 'This account has been disabled.',
        'user-not-found' ||
        'wrong-password' ||
        'invalid-credential' =>
          'Incorrect email or password.',
        'too-many-requests' => 'Too many attempts. Try again in a few minutes.',
        'network-request-failed' => 'No internet connection.',
        _ => 'Could not sign in. Please try again.',
      };

  Future<void> _resetPassword() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error =
          'Enter your email or username first, then tap Forgot password.');
      return;
    }
    final resolved = resolveLoginEmail(email);
    // A malformed address is worth telling the user about — that's not an
    // account-existence leak, just a typo they can fix immediately.
    if (!resolved.contains('@') || !resolved.contains('.')) {
      setState(() => _error = 'That email address is not valid.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).sendPasswordReset(email);
    } on FirebaseAuthException catch (e) {
      // 'user-not-found' is deliberately swallowed here, not surfaced as an
      // error: telling an anonymous visitor whether an email is registered is
      // an account-enumeration leak, and Firebase's own email-enumeration
      // protection (when enabled on the project) never throws this code
      // anyway — so treating it as success keeps behaviour identical either
      // way and matches how the reset flow should read regardless.
      if (e.code != 'user-not-found') {
        if (mounted) setState(() => _error = _message(e));
        if (mounted) setState(() => _busy = false);
        return;
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Something went wrong. Please try again.');
        setState(() => _busy = false);
      }
      return;
    }
    if (mounted) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'If an account exists for $resolved, a password reset link has been sent.',
          ),
          duration: const Duration(seconds: 5),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Center(child: BrandLogo(size: 104)),
                      const SizedBox(height: 26),
                      Text(
                        'Welcome back',
                        textAlign: TextAlign.center,
                        style: AppText.title.copyWith(fontSize: 24),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Sign in to see your sales, bills and dues',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 14, color: AppColors.inkDim),
                      ),
                      const SizedBox(height: 28),
                      _FieldLabel('Email or username'),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.username],
                        decoration: const InputDecoration(
                          hintText: 'e.g. ramesh or ramesh@shop.com',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'Enter your email or username'
                            : null,
                      ),
                      const SizedBox(height: 16),
                      _FieldLabel('Password'),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          hintText: 'Enter password',
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          suffixIcon: IconButton(
                            tooltip:
                                _obscure ? 'Show password' : 'Hide password',
                            icon: Icon(_obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: (v) => (v == null || v.isEmpty)
                            ? 'Enter your password'
                            : null,
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _busy ? null : _resetPassword,
                          child: const Text('Forgot password?'),
                        ),
                      ),
                      if (_error != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.critical.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                                color:
                                    AppColors.critical.withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.error_outline_rounded,
                                  size: 18, color: AppColors.critical),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: TextStyle(
                                      color: AppColors.critical, fontSize: 13),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],
                      const SizedBox(height: 4),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 52),
                        ),
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: AppColors.onPrimary),
                              )
                            : const Text('Sign in'),
                      ),
                      // Google sign-in needs a web client ID that only the
                      // mobile builds carry, so it is hidden in the browser.
                      if (!kIsWeb) ...[
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            const Expanded(child: Divider()),
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              child: Text('or', style: AppText.small),
                            ),
                            const Expanded(child: Divider()),
                          ],
                        ),
                        const SizedBox(height: 18),
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 52),
                          ),
                          onPressed: _busy
                              ? null
                              : () => _run(() => ref
                                  .read(authRepositoryProvider)
                                  .signInWithGoogle()),
                          icon:
                              const Icon(Icons.g_mobiledata_rounded, size: 30),
                          label: const Text('Continue with Google'),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Text(
                        'Use the same login as karanarjunerp.com',
                        textAlign: TextAlign.center,
                        style: AppText.small,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _submit() {
    if (_busy || !_formKey.currentState!.validate()) return;
    _run(() => ref
        .read(authRepositoryProvider)
        .signInWithEmail(_email.text, _password.text));
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 7),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
        ),
      ),
    );
  }
}
