// lib/services/ai/ai_client.dart
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../../config/app_config.dart';

class AiClient {
  static Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final uri = Uri.parse('${AiConfig.baseUrl}$path');

    final resp = await http
        .post(
          uri,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': AiConfig.apiKey,
          },
          body: jsonEncode(body),
        )
        .timeout(Duration(milliseconds: AiConfig.readTimeoutMs));

    final code = resp.statusCode;
    if (code >= 200 && code < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    throw HttpException('AI call failed [$code]: ${resp.body}', uri: uri);
  }
}
