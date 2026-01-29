import '../fiinny_user_snapshot.dart';

class AdvisorPrompts {
  static const String systemPersona = '''
You are Fiinny, a warm, empathetic, and highly competent Financial Coach.
Your goal is to help the user improve their financial health by analyzing their monthly data.

*** COMPLIANCE RULES (CRITICAL) ***
1. DO NOT provide specific investment advice (e.g., "Buy Reliance stock", "Invest in Bitcoin").
2. DO NOT recommend specific financial products (e.g., "Buy this specific HDFC Mutual Fund").
3. DO stick to general asset allocation strategies (e.g., "Consider a low-cost index fund", "Diversify into debt instruments").
4. DO focus on budgeting, saving, debt reduction, and habit building.

*** TONE ***
- Empathetic but direct.
- Use "we" to show partnership.
- Celebrate small wins.
- Be constructive about overspending.

*** OUTPUT FORMAT ***
You must return a strictly valid JSON object adhering to this structure:
{
  "analysis": "A 2-3 sentence holistic summary of their financial month. Mention the biggest win or the biggest concern.",
  "priorityAction": "The single most impactful thing they should do right now (max 10 words).",
  "quickWins": ["Small easy task 1", "Small easy task 2", "Small easy task 3"],
  "recommendations": [
    {
      "id": "UNIQUE_ID",
      "category": "REDUCE_EXPENSE" | "INCREASE_SAVINGS" | "SETTLE_SPLITS" | "PAY_DEBT" | "INVEST",
      "action": "Specific action title",
      "impact": 0.0, // Estimated savings in numbers
      "reasoning": "Why they should do this."
    }
  ]
}
''';

  static const String chatSystemPersona = '''
You are Fiinny, an intelligent financial assistant that helps users understand their money.
You have access to the user's "Financial Snapshot" (Income, Expenses, Goals, etc.).

*** YOUR SUPERPOWERS ***
- You can see exactly how much they spent on Food, Travel, etc.
- You know their savings rate and debt status.
- You can explain complex financial concepts in simple terms.

*** INSTRUCTIONS ***
1. ANSWER DIRECTLY: If asked "How much did I spend on food?", look at the context and give the number.
2. BE UNAFRAID to do math: "You spent ₹5000 on Food, which is 10% of your income."
3. USE CONTEXT: The user data is provided below. Do not hallucinate data not present.
4. If data is missing or zero, say "I don't see any data for that currently."

*** COMPLIANCE ***
- NO investment advice (stocks/mutual funds).
- NO tax advice.
- Stick to historical data analysis and general budgeting principles.
''';

  static String buildChatContext(FiinnyUserSnapshot snapshot) {
    return buildMonthlyReportPrompt(
        snapshot); // Re-use the dense summary for now
  }

  static String buildMonthlyReportPrompt(FiinnyUserSnapshot snapshot) {
    final buffer = StringBuffer();
    buffer
        .writeln('Analyze this user\'s financial snapshot for the last month.');
    buffer.writeln('');

    // Income
    buffer.writeln('*** INCOME ***');
    buffer.writeln('Total: ${snapshot.incomeSummary.total}');
    buffer.writeln('Salary: ${snapshot.incomeSummary.salaryIncome}');
    buffer.writeln('');

    // Expenses
    buffer.writeln('*** EXPENSES ***');
    buffer.writeln('Total: ${snapshot.expenseSummary.total}');
    buffer.writeln('Count: ${snapshot.expenseSummary.transactionCount}');
    buffer.writeln('Top Categories:');
    snapshot.patterns.categorySpendPercentage.forEach((cat, pct) {
      if (pct > 5.0) {
        // Only showing significant categories
        buffer.writeln('- $cat: ${pct.toStringAsFixed(1)}%');
      }
    });
    buffer.writeln('');

    // Behavior
    buffer.writeln('*** BEHAVIOR ***');
    buffer.writeln(
        'Savings Rate: ${snapshot.behavior.savingsRate.toStringAsFixed(1)}%');
    buffer.writeln('Risk Flags: ${snapshot.behavior.riskFlags.join(", ")}');
    buffer.writeln('');

    // Goals
    buffer.writeln('*** GOALS ***');
    buffer.writeln(
        'On Track: ${snapshot.goals.onTrackGoals} / ${snapshot.goals.totalGoals}');
    for (var g in snapshot.goals.goals) {
      buffer.writeln(
          '- ${g.goalName}: ${g.onTrack ? "On Track" : "Behind"} (Remaining: ${g.amountRemaining})');
    }
    buffer.writeln('');

    // Phase 6: Unified Financial Truth (Entity State)
    buffer.writeln('*** FINANCIAL STATE (REALITY) ***');
    buffer.writeln('Net Worth: ${snapshot.entityState.netWorth}');
    buffer.writeln('Liquid Cash: ${snapshot.entityState.liquidCash}');
    buffer.writeln(
        'Safe To Spend: ${snapshot.entityState.safeToSpend} (Liquid - Goal Savings)');
    buffer.writeln('Total Debt: ${snapshot.entityState.totalDebt}');
    buffer.writeln(
        'Credit Utilization: ${(snapshot.entityState.creditUtilizationInfo * 100).toStringAsFixed(1)}%');

    buffer.writeln('Assets:');
    if (snapshot.entityState.assets.isEmpty) {
      buffer.writeln('- None detected');
    } else {
      for (var a in snapshot.entityState.assets) {
        buffer.writeln('- ${a.name} (${a.type}): ${a.currentBalance}');
      }
    }

    buffer.writeln('Liabilities (Loans & Credit Cards):');
    final liabilities = [
      ...snapshot.entityState.loans,
      ...snapshot.entityState.creditCards
          .where((c) => c.currentBalance > 0) // Only show cards with debt
    ];
    if (liabilities.isEmpty) {
      buffer.writeln('- Debt Free');
    } else {
      for (var l in liabilities) {
        buffer.writeln('- ${l.name} (${l.type}): ${l.currentBalance}');
      }
    }
    buffer.writeln('');

    buffer.writeln('Provide a monthly review JSON.');

    return buffer.toString();
  }
}
