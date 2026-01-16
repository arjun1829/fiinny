/// Target screen for the insight card
enum InsightTarget {
  expenses,
  friends,
  monthly,
}

/// Mapped UI model for an insight (No logic, just display data)
class InsightUiModel {
  final String title;
  final String subtitle;
  final InsightTarget target;

  const InsightUiModel({
    required this.title,
    required this.subtitle,
    required this.target,
  });
}

class InsightUiMapper {
  /// Static mapping of Insight ID -> UI Model
  static InsightUiModel? map(String insightId) {
    switch (insightId) {
      case 'LOW_SAVINGS':
        return const InsightUiModel(
          title: 'Low Savings',
          subtitle: 'Your savings are low this month',
          target: InsightTarget.expenses,
        );
      case 'HIGH_SPENDING':
        return const InsightUiModel(
          title: 'High Spending',
          subtitle: 'You are spending more than usual',
          target: InsightTarget.expenses,
        );
      case 'HIGH_FOOD_SPEND':
        return const InsightUiModel(
          title: 'High Food Spend',
          subtitle: 'Food expenses are eating into your budget',
          target: InsightTarget.expenses,
        );
      case 'UNPLANNED_SHOPPING_SPIKE':
        return const InsightUiModel(
          title: 'Shopping Spike',
          subtitle: 'Unplanned shopping detected',
          target: InsightTarget.expenses,
        );
      case 'PAYCHECK_TO_PAYCHECK':
        return const InsightUiModel(
          title: 'Tight Budget',
          subtitle: 'You are living paycheck to paycheck',
          target: InsightTarget.monthly,
        );
      case 'UNSETTLED_SPLITS':
        return const InsightUiModel(
          title: 'Unsettled Splits',
          subtitle: 'You have pending splits to settle',
          target: InsightTarget.friends,
        );
      case 'FRIENDS_PENDING_HIGH':
        return const InsightUiModel(
          title: 'High Pending Amount',
          subtitle: 'Significant amount pending with friends',
          target: InsightTarget.friends,
        );
      default:
        return null; // Unknown or unmapped insights (like goals) won't show in MVP UI
    }
  }
}

// ----------------------
// PART 3: GPT PREP (Safe Schema)
// ----------------------

/// Input schema for GPT (Model only, no execution)
class GptInputSchema {
  final String persona;
  final String scope;
  final Map<String, dynamic> verifiedInsight;
  final List<String> rules;

  const GptInputSchema({
    this.persona = "Fiinny",
    this.scope = "expenses_and_splits_only",
    required this.verifiedInsight,
    this.rules = const [
      "Do not invent numbers",
      "Do not give investment advice",
      "Do not mention goals",
      "Explain only what is present"
    ],
  });

  Map<String, dynamic> toJson() => {
        'persona': persona,
        'scope': scope,
        'verified_insight': verifiedInsight,
        'rules': rules,
      };
}

/// Expected Output Schema from GPT
class GptOutputSchema {
  final String explanation;
  final List<String> suggestions;

  const GptOutputSchema({
    required this.explanation,
    required this.suggestions,
  });

  factory GptOutputSchema.fromJson(Map<String, dynamic> json) {
    return GptOutputSchema(
      explanation: json['explanation'] as String? ?? '',
      suggestions:
          (json['suggestions'] as List?)?.map((e) => e.toString()).toList() ??
              [],
    );
  }
}
