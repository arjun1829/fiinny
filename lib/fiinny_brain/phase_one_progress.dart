class PhaseOneProgress {
  static const int TRANSACTION_ENGINE_WEIGHT = 8;
  static const int PATTERN_ENGINE_WEIGHT = 8;
  static const int BEHAVIOR_ENGINE_WEIGHT = 8;
  static const int GOAL_ENGINE_WEIGHT = 8;
  static const int SPLIT_ENGINE_WEIGHT = 8;
  static const int INSIGHT_ENGINE_WEIGHT = 30; 
  static const int GPT_PREP_WEIGHT = 5; 
  static const int GPT_SERVICE_WEIGHT = 10; // Phase 3A
  static const int HISTORICAL_COMPARISON_WEIGHT = 5; // Phase 3B
  static const int FORECASTING_WEIGHT = 5; // Phase 3B
  static const int ADVISORY_WEIGHT = 3; // Phase 3B
  
  static const int PHASE_ONE_COMPLETE = 40;
  static const int PHASE_TWO_COMPLETE = 75;
  static const int PHASE_THREE_A_COMPLETE = 85; // 75 + 10
  static const int PHASE_THREE_B_COMPLETE = 98; // 85 + 5 + 5 + 3

  final int progressPercentage;
  final Map<String, bool> engineStatus;

  const PhaseOneProgress({
    required this.progressPercentage,
    required this.engineStatus,
  });

  Map<String, dynamic> toJson() => {
    'progressPercentage': progressPercentage,
    'engineStatus': engineStatus,
  };

  /// Calculate progress based on which engines are implemented
  /// Deterministic.
  static PhaseOneProgress calculate({
    required bool transactionEngineComplete,
    required bool patternEngineComplete,
    required bool behaviorEngineComplete,
    required bool goalEngineComplete,
    required bool splitEngineComplete,
    required bool insightEngineComplete,
    required bool gptPrepComplete,
    required bool gptServiceComplete,
    required bool historicalComparisonComplete,
    required bool forecastingComplete,
    required bool advisoryComplete,
  }) {
    int progress = 0;
    
    if (transactionEngineComplete) progress += TRANSACTION_ENGINE_WEIGHT;
    if (patternEngineComplete) progress += PATTERN_ENGINE_WEIGHT;
    if (behaviorEngineComplete) progress += BEHAVIOR_ENGINE_WEIGHT;
    if (goalEngineComplete) progress += GOAL_ENGINE_WEIGHT;
    if (splitEngineComplete) progress += SPLIT_ENGINE_WEIGHT;
    if (insightEngineComplete) progress += INSIGHT_ENGINE_WEIGHT;
    if (gptPrepComplete) progress += GPT_PREP_WEIGHT;
    if (gptServiceComplete) progress += GPT_SERVICE_WEIGHT;
    if (historicalComparisonComplete) progress += HISTORICAL_COMPARISON_WEIGHT;
    if (forecastingComplete) progress += FORECASTING_WEIGHT;
    if (advisoryComplete) progress += ADVISORY_WEIGHT;

    return PhaseOneProgress(
      progressPercentage: progress,
      engineStatus: {
        'transactionEngine': transactionEngineComplete,
        'patternEngine': patternEngineComplete,
        'behaviorEngine': behaviorEngineComplete,
        'goalEngine': goalEngineComplete,
        'splitEngine': splitEngineComplete,
        'insightEngine': insightEngineComplete,
        'gptPrep': gptPrepComplete,
        'gptService': gptServiceComplete,
        'historicalComparison': historicalComparisonComplete,
        'forecasting': forecastingComplete,
        'advisory': advisoryComplete,
      },
    );
  }

  /// Get current progress (all engines complete = 98%)
  static PhaseOneProgress current() {
    return calculate(
      transactionEngineComplete: true,
      patternEngineComplete: true,
      behaviorEngineComplete: true,
      goalEngineComplete: true,
      splitEngineComplete: true,
      insightEngineComplete: true,
      gptPrepComplete: true,
      gptServiceComplete: true,
      historicalComparisonComplete: true,
      forecastingComplete: true,
      advisoryComplete: true,
    );
  }
}
