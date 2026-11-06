/// Build-time config, passed with `--dart-define-from-file=config/secrets.json`.
/// The file is gitignored: this repo is public, and the team code is what
/// keeps the team's call data private.
class AppConfig {
  static const firebaseApiKey = String.fromEnvironment('CT_FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('CT_FIREBASE_APP_ID');
  static const firebaseSenderId = String.fromEnvironment('CT_FIREBASE_SENDER_ID');
  static const firebaseProjectId =
      String.fromEnvironment('CT_FIREBASE_PROJECT_ID', defaultValue: 'lifemap-72b21');
  static const firebaseStorageBucket = String.fromEnvironment('CT_FIREBASE_STORAGE_BUCKET');

  /// Separate Firestore database inside the project: nothing shared with
  /// the other apps' (default) database or rules.
  static const firestoreDatabase = 'calltracker';

  /// Long random secret shared by the team's phones. Data lives under
  /// teams/{teamCode}, which cannot be listed, only opened by exact path.
  static const teamCode = String.fromEnvironment('CT_TEAM_CODE');

  static bool get cloudEnabled =>
      firebaseApiKey.isNotEmpty && firebaseAppId.isNotEmpty && teamCode.length >= 16;
}
