import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/data/sales_auth_repository.dart';
import '../../features/auth/data/sales_user.dart';

final salesAuthRepositoryProvider = Provider<SalesAuthRepository>(
  (ref) => SalesAuthRepository(),
);

/// Raw Firebase auth state.
final firebaseUserProvider = StreamProvider<User?>((ref) {
  return ref.watch(salesAuthRepositoryProvider).authStateChanges();
});

/// Where the app is in the sign-in flow. The router keys off this, so it has to
/// distinguish "still checking" from "checked, not allowed" — collapsing those
/// two flashes the login screen at every cold start.
enum SessionStatus { loading, signedOut, unauthorized, ready }

class SessionState {
  final SessionStatus status;
  final SalesUser? user;
  const SessionState(this.status, [this.user]);
}

/// Resolves the Firebase user into an authorised [SalesUser], or reports why not.
final sessionProvider = FutureProvider<SessionState>((ref) async {
  // `.future` rather than `.when` so the role lookup can be awaited inline;
  // it re-runs whenever the auth stream emits (sign in / sign out).
  final User? user;
  try {
    user = await ref.watch(firebaseUserProvider.future);
  } catch (_) {
    return const SessionState(SessionStatus.signedOut);
  }

  if (user == null) return const SessionState(SessionStatus.signedOut);

  try {
    final salesUser = await ref
        .read(salesAuthRepositoryProvider)
        .resolveSalesUser(user);
    if (salesUser == null) {
      return const SessionState(SessionStatus.unauthorized);
    }
    return SessionState(SessionStatus.ready, salesUser);
  } catch (_) {
    // Fail closed: a failed role lookup must not open the dashboard.
    return const SessionState(SessionStatus.unauthorized);
  }
});

/// The authorised rep, or null. Convenience for screens that already know they
/// are behind the router's auth guard.
final currentSalesUserProvider = Provider<SalesUser?>((ref) {
  return ref.watch(sessionProvider).value?.user;
});

/// The rep's uid — every Firestore query in this app is scoped by it.
final currentUidProvider = Provider<String?>(
  (ref) => ref.watch(currentSalesUserProvider)?.uid,
);
