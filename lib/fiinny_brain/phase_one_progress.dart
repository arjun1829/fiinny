class PhaseOneProgress {
  static const int transactionEngineWeight = 8;
  static const int patternEngineWeight = 8;
  static const int behaviorEngineWeight = 8;
  static const int goalEngineWeight = 8;
  static const int splitEngineWeight = 8;
  static const int insightEngineWeight = 30;
  static const int gptPrepWeight = 5;
  static const int gptServiceWeight = 10; // Phase 3A
  static const int historicalComparisonWeight = 5; // Phase 3B
  static const int forecastingWeight = 5; // Phase 3B
  static const int advisoryWeight = 3; // Phase 3B

  static const int phaseOneComplete = 40;
  static const int phaseTwoComplete = 75;
  static const int phaseThreeAComplete = 85; // 75 + 10
  static const int phaseThreeBComplete = 98; // 85 + 5 + 5 + 3

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

    if (transactionEngineComplete) {
      progress += transactionEngineWeight;
    }
    if (patternEngineComplete) {
      progress += patternEngineWeight;
    }
    if (behaviorEngineComplete) {
      progress += behaviorEngineWeight;
    }
    if (goalEngineComplete) {
      progress += goalEngineWeight;
    }
    if (splitEngineComplete) {
      progress += splitEngineWeight;
    }
    if (insightEngineComplete) {
      progress += insightEngineWeight;
    }
    if (gptPrepComplete) {
      progress += gptPrepWeight;
    }
    if (gptServiceComplete) {
      progress += gptServiceWeight;
    }
    if (historicalComparisonComplete) {
      progress += historicalComparisonWeight;
    }
    if (forecastingComplete) {
      progress += forecastingWeight;
    }
    if (advisoryComplete) {
      progress += advisoryWeight;
    }

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
