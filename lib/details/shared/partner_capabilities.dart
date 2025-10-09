// lib/details/shared/partner_capabilities.dart
class PartnerCapabilities {
  final bool recurring;
  final bool subscriptions;
  final bool emis;
  final bool goals;

  const PartnerCapabilities({
    this.recurring = false,
    this.subscriptions = false,
    this.emis = false,
    this.goals = false,
  });

  factory PartnerCapabilities.fromJson(Map<String, dynamic>? j) => PartnerCapabilities(
    recurring: (j?['recurring'] ?? false) as bool,
    subscriptions: (j?['subscriptions'] ?? false) as bool,
    emis: (j?['emis'] ?? false) as bool,
    goals: (j?['goals'] ?? false) as bool,
  );

  Map<String, dynamic> toJson() => {
    'recurring': recurring,
    'subscriptions': subscriptions,
    'emis': emis,
    'goals': goals,
  };
}
