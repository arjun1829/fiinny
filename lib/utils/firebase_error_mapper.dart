import 'package:firebase_core/firebase_core.dart';

/// Returns a user-friendly description for a [FirebaseException].
///
/// Falls back to [fallback] when the error is not Firebase-related or when the
/// exception does not contain actionable information.
String mapFirebaseError(
  Object error, {
  String fallback = 'Something went wrong. Please try again.',
}) {
  if (error is FirebaseException) {
    final message = (error.message ?? '').trim();
    switch (error.code) {
      case 'unavailable':
        return 'Fiinny can\'t reach Firebase right now. Check your internet connection.';
      case 'permission-denied':
        return 'Fiinny does not have permission to access Firebase. Verify your Firestore rules and configuration.';
      case 'failed-precondition':
        return 'Firebase is missing required configuration. Make sure Google services files are bundled with the app.';
      case 'unauthenticated':
        return 'Your session expired. Please sign in again and retry.';
      default:
        if (message.isNotEmpty) return message;
        return 'Firebase error (${error.code}). Please try again.';
    }
  }
  return fallback;
}
