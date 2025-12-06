import 'dart:io';
import 'package:google_generative_ai/google_generative_ai.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class GeminiService {
  GenerativeModel? _model;
  GenerativeModel? _visionModel;

  /// Fetch API Key dynamically
  Future<String?> _getApiKey() async {
     final prefs = await SharedPreferences.getInstance();
     return prefs.getString('gemini_api_key');
  }

  Future<void> _init() async {
    final apiKey = await _getApiKey();
    if (apiKey == null || apiKey.isEmpty) return;

    // Define Tools (The Agent's Hands)
    final expenseTool = FunctionDeclaration(
      'addExpense',
      'Add a new financial transaction or expense.',
      Schema(SchemaType.object, properties: {
        'amount': Schema(SchemaType.number, description: 'The numeric amount of the expense.'),
        'note': Schema(SchemaType.string, description: 'A brief description or merchant name.'),
        'category': Schema(SchemaType.string, description: 'Category (Food, Travel, Bills, etc.). Guess if not provided.'),
        'date': Schema(SchemaType.string, description: 'Date in YYYY-MM-DD format. Default to today if not specified.'),
      }, requiredProperties: ['amount']),
    );

    final friendTool = FunctionDeclaration(
      'manageSocial',
      'Manage friends and groups.',
      Schema(SchemaType.object, properties: {
        'action': Schema(SchemaType.string, description: 'One of: "add_friend", "create_group", "add_to_group".'),
        'name': Schema(SchemaType.string, description: 'Name of the friend or group.'),
        'entity': Schema(SchemaType.string, description: 'Target entity name (e.g. friend name to add to group).'),
      }, requiredProperties: ['action', 'name']),
    );

    final tools = [Tool(functionDeclarations: [expenseTool, friendTool])];

    _model ??= GenerativeModel(
      model: 'gemini-1.5-flash', 
      apiKey: apiKey,
      tools: tools, // Give the brain hands!
      generationConfig: GenerationConfig(
        temperature: 0.5, 
        maxOutputTokens: 500,
      ),
    );

    _visionModel ??= GenerativeModel(
      model: 'gemini-1.5-flash', 
      apiKey: apiKey,
    );
  }

  /// Handles "Thinking" & "Action" queries
  /// Returns a Map: {'type': 'text'|'function', 'content': ...}
  Future<Map<String, dynamic>> routeIntent(String prompt, String userContext) async {
    await _init();
    if (_model == null) return {'type': 'text', 'content': "Missing API Key."};

    // Inject Persona
    final systemPrompt = '''
You are Fiinny, a witty financial agent.
$userContext
Task: Identify the user's intent.
- If they want to perform an action (expense, friend), CALL THE FUNCTION.
- If they are asking advice/analysis, respond with TEXT.
- Fix typos implicitly (e.g., "expnse" -> addExpense).
''';

    try {
      final chat = _model!.startChat(history: [Content.text(systemPrompt)]);
      final response = await chat.sendMessage(Content.text(prompt));
      
      final fc = response.functionCalls.firstOrNull;
      if (fc != null) {
        return {
          'type': 'function',
          'name': fc.name,
          'args': fc.args,
        };
      }

      return {'type': 'text', 'content': response.text ?? "I didn't understand that."};
    } catch (e) {
      if (kDebugMode) print("Gemini Error: $e");
      return {'type': 'text', 'content': "Optimizing backend... (Error: $e)"};
    }
  }

  /// Handles "Thinking" queries (Old method, kept for reference/fallback)
  Future<String> chat(String prompt, String userContext) async {

    try {
      final content = [Content.text(systemPrompt)];
      final response = await _model.generateContent(content);
      return response.text ?? "My brain froze. Try again?";
    } catch (e) {
      if (kDebugMode) print("Gemini Error: $e");
      return "I'm having trouble connecting to the cloud right now. (Check API Key)";
    }
  }

  /// Smart Receipt Parsing (Multimodal)
  Future<String> analyzeReceipt(String imagePath) async {
    await _init();
    if (_visionModel == null) return "Missing API Key. Please add it in AI Settings.";

    try {
      final file = File(imagePath);
      final bytes = await file.readAsBytes();
      
      final prompt = textPart("Extract the Merchant Name, Total Amount, Date, and a list of items from this receipt. Return ONLY valid JSON format: {merchant: str, total: double, date: 'YYYY-MM-DD', items: [{name: str, price: double}]}");
      final image = DataPart('image/jpeg', bytes); // Assuming JPEG for now

      final response = await _visionModel.generateContent([
        Content.multi([prompt, image])
      ]);

      return response.text ?? "Could not read the receipt.";
    } catch (e) {
       return "Error parsing receipt: $e";
    }
  }
}

// Helper to create parts
Part textPart(String text) => TextPart(text);
