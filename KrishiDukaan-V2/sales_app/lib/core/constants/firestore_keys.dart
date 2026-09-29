/// Collection names. These are shared with the Next.js web app — the sales web
/// route (app/sales) writes the same documents — so they must not drift.
class Collections {
  Collections._();

  /// One doc per rep per working day. Written by web + this app.
  static const daySessions = 'daySessions';

  /// Shared dealer master (retailers / distributors / manufacturers).
  static const dealers = 'dealers';

  /// One doc per logged visit.
  static const dealerVisits = 'dealerVisits';

  /// One doc per rep per calendar day — id is `{uid}_{date}` so a day can only
  /// ever be marked once. New in this app.
  static const salesAttendance = 'salesAttendance';

  /// Field expense claims. New in this app.
  static const salesExpenses = 'salesExpenses';

  /// One doc per free-text note a rep leaves against a dealer. New in this app.
  static const dealerNotes = 'dealerNotes';

  static const users = 'users';
  static const uidIndex = 'uidIndex';
}
