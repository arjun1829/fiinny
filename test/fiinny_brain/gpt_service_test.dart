import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lifemap/fiinny_brain/services/gpt_service.dart'; // We'll need to mock the http call differently since GptService uses static http.post
// Since GptService uses http.post directly, we can't easily mock it without dependency injection or http overrides.
// Flutter's http package allows global overrides using HttpOverrides but that's for dart:io HttpClient.
// The http package client is usually mocked by passing a client.
// I'll refactor GptService slightly to allow client injection for testing, OR use `http_mock_adapter` logic if I had it.
// Standard way: Add `http.Client? client` parameter to method or use a setter.

import 'package:lifemap/fiinny_brain/insight_models.dart';
import 'package:lifemap/fiinny_brain/insight_attributes.dart';

// REFACTOR GptService to accept client? 
// Or I can use runWithClient from http package if on new version? 
// Current environment sdk is >=3.2.0. http package 1.2.0. 
// runWithClient is available.

void main() {
  group('GptService', () {
    late FiinnyInsight testInsight;

    setUp(() {
      SharedPreferences.setMockInitialValues({'openai_api_key': 'test-key'});
      testInsight = const FiinnyInsight(
        id: 'LOW_SAVINGS',
        category: InsightCategory.RISK,
        severity: InsightSeverity.MEDIUM,
        factsUsed: ['behavior.savingsRate'],
        values: {'savingsRate': 10.0},
        actionable: true,
      );
    });

    test('Returns parsed output on success', () async {
      final mockResponse = {
        'choices': [
          {
            'message': {
              'content': jsonEncode({
                'explanation': 'Your savings rate is 10%, which is low.',
                'suggestions': ['Reduce spending', 'Track expenses']
              })
            }
          }
        ]
      };

      // Mock the HTTP client
      await http.runWithClient(() async {
        final result = await GptService.explainInsight(testInsight);
        
        expect(result, isNotNull);
        expect(result!.explanation, contains('10%'));
        expect(result.suggestions.length, 2);
      }, () => MockClient((request) async {
         expect(request.url.toString(), 'https://api.openai.com/v1/chat/completions');
         expect(request.headers['Authorization'], 'Bearer test-key');
         
         // Verify body structure
         final body = jsonDecode(request.body);
         expect(body['model'], 'gpt-4o-mini');
         expect(body['temperature'], 0.3);
         expect(body['max_tokens'], 150);
         
         return http.Response(jsonEncode(mockResponse), 200);
      }));
    });

    test('Returns null on API failure', () async {
      await http.runWithClient(() async {
        final result = await GptService.explainInsight(testInsight);
        expect(result, isNull);
      }, () => MockClient((request) async {
        return http.Response('Server Error', 500);
      }));
    });

    test('Returns null on invalid JSON schema', () async {
       final mockResponse = {
        'choices': [
          {
            'message': {
              'content': 'Not JSON'
            }
          }
        ]
      };

      await http.runWithClient(() async {
        final result = await GptService.explainInsight(testInsight);
        expect(result, isNull);
      }, () => MockClient((request) async {
        return http.Response(jsonEncode(mockResponse), 200);
      }));
    });
    
    test('Returns null if API Key is missing', () async {
      SharedPreferences.setMockInitialValues({}); // No key
      
      // Client shouldn't even be called
      await http.runWithClient(() async {
        final result = await GptService.explainInsight(testInsight);
        expect(result, isNull);
      }, () => MockClient((request) async {
        fail('Http client should not be called without API key');
        return http.Response('', 500);
      }));
    });
  });
}
