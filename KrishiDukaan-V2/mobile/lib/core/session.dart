import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'constants.dart';

/// Firebase auth state — recomputes whenever the user signs in / out.
final firebaseUserProvider = StreamProvider<User?>(
  (ref) => FirebaseAuth.instance.authStateChanges(),
);

class Session {
  Session({
    this.isAuthenticated = false,
    this.uid,
    this.phone,
    this.role,
    this.onboardingDone = false,
    this.isSubscribed = false,
  });

  final bool isAuthenticated;
  final String? uid;
  final String? phone;
  final UserRole? role;
  final bool onboardingDone;
  final bool isSubscribed;

  Session copyWith({
    bool? isAuthenticated,
    String? uid,
    String? phone,
    UserRole? role,
    bool? onboardingDone,
    bool? isSubscribed,
  }) {
    return Session(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      uid: uid ?? this.uid,
      phone: phone ?? this.phone,
      role: role ?? this.role,
      onboardingDone: onboardingDone ?? this.onboardingDone,
      isSubscribed: isSubscribed ?? this.isSubscribed,
    );
  }
}

class SessionController extends StateNotifier<Session> {
  SessionController(this._ref) : super(Session()) {
    _init();
  }

  final Ref _ref;
  static const _kRole = 'auth.role';
  static const _kOnboarded = 'auth.onboarded';
  static const _kSubscribed = 'auth.subscribed';

  Future<void> _init() async {
    final p = await SharedPreferences.getInstance();
    // Hydrate role/onboarding flags from disk.
    final role = UserRoleX.tryParse(p.getString(_kRole));
    final onboarded = p.getBool(_kOnboarded) ?? false;
    final subscribed = p.getBool(_kSubscribed) ?? false;

    // React to Firebase auth changes.
    _ref.listen<AsyncValue<User?>>(firebaseUserProvider, (_, next) {
      next.whenData((user) {
        if (user == null) {
          state = Session(
            onboardingDone: onboarded,
            isSubscribed: subscribed,
            role: role,
          );
        } else {
          state = state.copyWith(
            isAuthenticated: true,
            uid: user.uid,
            phone: user.phoneNumber,
          );
        }
      });
    }, fireImmediately: true);
  }

  Future<void> setRole(UserRole role) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kRole, role.name);
    state = state.copyWith(role: role);
  }

  Future<void> completeOnboarding() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_kOnboarded, true);
    state = state.copyWith(onboardingDone: true);
  }

  Future<void> setSubscribed(bool v) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_kSubscribed, v);
    state = state.copyWith(isSubscribed: v);
  }

  Future<void> signOut() async {
    await FirebaseAuth.instance.signOut();
    final p = await SharedPreferences.getInstance();
    await p.remove(_kRole);
    await p.remove(_kOnboarded);
    await p.remove(_kSubscribed);
    state = Session();
  }
}

final sessionProvider =
    StateNotifierProvider<SessionController, Session>((ref) {
  return SessionController(ref);
});
