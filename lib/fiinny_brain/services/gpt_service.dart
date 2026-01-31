import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/ai_message.dart';
import '../insight_models.dart';
import '../insight_attributes.dart';
import '../advisory_models.dart';
import '../fiinny_user_snapshot.dart';
import '../prompts/advisor_prompts.dart';

class GptService {
  static const String _kOpenAiBaseUrl =
      'https://api.openai.com/v1/chat/completions';
  static const String _kModel = 'gpt-4o-mini'; // Fixed model as per rules
  static const double _kTemperature = 0.3; // Fixed temp <= 0.3
  static const int _kMaxTokens = 150; // Safe limit

  /// One-shot explanation for a specific insight.
  /// Returns null if call fails, times out, or validation fails.
  /// No retries. No logging.
  static Future<GptOutputSchema?> explainInsight(FiinnyInsight insight) async {
    try {
      final apiKey = await _getApiKey();
      if (apiKey == null || apiKey.isEmpty) {
        return null;
      }

      // 1. Prepare Input
      final input = GptInputSchema(
        verifiedInsight: insight.toJson(),
        rules: [
          "Do not invent numbers",
          "Do not mention goals",
          "Do not give investment advice",
          "Explain only what is present",
          "Keep response under 120 words",
        ],
      );

      // 2. Call OpenAI (Safe & Limited)
      final response = await http
          .post(
            Uri.parse(_kOpenAiBaseUrl),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $apiKey',
            },
            body: jsonEncode({
              'model': _kModel,
              'messages': [
                {
                  'role': 'system',
                  'content':
                      'You are Fiinny, a financial assistant. Return JSON only.'
                },
                {'role': 'user', 'content': jsonEncode(input.toJson())}
              ],
              'temperature': _kTemperature,
              'max_tokens': _kMaxTokens,
              'response_format': {'type': 'json_object'},
            }),
          )
          .timeout(const Duration(seconds: 10)); // Strict timeout

      if (response.statusCode != 200) {
        return null;
      }

      // 3. Parse & Validate
      final data = jsonDecode(response.body);
      final content = data['choices']?[0]?['message']?['content'];
      if (content == null) {
        return null;
      }

      final jsonOutput = jsonDecode(content);
      final result = GptOutputSchema.fromJson(jsonOutput);

      // Validation: Check if explanation references provided values?
      // Hard to do strictly without complex regex.
      // Check length constraints.
      // And strict schema existence.
      if (result.explanation.isEmpty) {
        return null;
      }

      return result;
    } catch (e) {
      // Squelch all errors
      return null;
    }
  }

  static Future<String?> _getApiKey() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('openai_api_key');
  }

  /// Generates a holistic monthly report based on the user's snapshot.
  /// Returns null if call fails.
  static Future<AdvisoryReport?> generateMonthlyReport(
      FiinnyUserSnapshot snapshot) async {
    try {
      final apiKey = await _getApiKey();
      if (apiKey == null || apiKey.isEmpty) {
        return null;
      }

      final systemPrompt = AdvisorPrompts.systemPersona;
      final userPrompt = AdvisorPrompts.buildMonthlyReportPrompt(snapshot);

      final response = await http
          .post(
            Uri.parse(_kOpenAiBaseUrl),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $apiKey',
            },
            body: jsonEncode({
              'model': 'gpt-4o', // Using a smarter model for complex analysis
              'messages': [
                {'role': 'system', 'content': systemPrompt},
                {'role': 'user', 'content': userPrompt}
              ],
              'temperature': 0.4,
              'response_format': {'type': 'json_object'},
            }),
          )
          .timeout(const Duration(seconds: 30));

      if (response.statusCode != 200) {
        return null;
      }

      final data = jsonDecode(response.body);
      final content = data['choices']?[0]?['message']?['content'];
      if (content == null) {
        return null;
      }

      // Parse JSON from LLM
      final jsonOutput = jsonDecode(content);

      // Map JSON to AdvisoryReport
      final recommendations = (jsonOutput['recommendations'] as List)
          .map((r) => Recommendation(
                id: r['id'] ?? DateTime.now().millisecondsSinceEpoch.toString(),
                category: r['category'] ?? 'GENERAL',
                action: r['action'] ?? '',
                impact: (r['impact'] as num?)?.toDouble() ?? 0.0,
                reasoning: r['reasoning'] ?? '',
              ))
          .toList();

      return AdvisoryReport(
        recommendations: recommendations,
        priorityAction: jsonOutput['priorityAction'] ?? '',
        quickWins: List<String>.from(jsonOutput['quickWins'] ?? []),
        potentialMonthlySavings:
            recommendations.fold(0.0, (sum, r) => sum + r.impact),
        analysis: jsonOutput['analysis'],
      );
    } catch (e) {
      // debugPrint('GPT Error: $e');
      return null;
    }
  }

  /// Chat with Fiinny using standard messages + RAG context
  static Future<String?> chatWithContext(String userMessage,
      FiinnyUserSnapshot snapshot, List<AiMessage> history) async {
    try {
      final apiKey = await _getApiKey();
      if (apiKey == null || apiKey.isEmpty) return null;

      final systemPrompt = AdvisorPrompts.chatSystemPersona;
      final contextPrompt = AdvisorPrompts.buildChatContext(snapshot);

      // Construct messages: System + Context + History + User
      final messages = <Map<String, String>>[];

      messages.add({'role': 'system', 'content': systemPrompt});
      messages.add({'role': 'system', 'content': 'CONTEXT:\n$contextPrompt'});

      // Add last 5 messages for conversation flow
      for (final msg in history.take(5)) {
        messages.add(
            {'role': msg.isUser ? 'user' : 'assistant', 'content': msg.text});
      }

      messages.add({'role': 'user', 'content': userMessage});

      final response = await http
          .post(
            Uri.parse(_kOpenAiBaseUrl),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $apiKey',
            },
            body: jsonEncode({
              'model': 'gpt-4o-mini', // Faster model for chat
              'messages': messages,
              'temperature': 0.7, // Slightly creative for chat
              'max_tokens': 300,
            }),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) return null;

      final data = jsonDecode(response.body);
      return data['choices']?[0]?['message']?['content'];
    } catch (e) {
      return null;
    }
  }
}
