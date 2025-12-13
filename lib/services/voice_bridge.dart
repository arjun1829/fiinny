import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';
import 'package:lifemap/main.dart'; // ✅ Import main.dart for rootNavigatorKey

/// 🎙️ VoiceBridge
/// Handles commands from Siri and Google Assistant via Deep Links.
class VoiceBridge {
  static final VoiceBridge _instance = VoiceBridge._internal();
  factory VoiceBridge() => _instance;
  VoiceBridge._internal();

  late AppLinks _appLinks;
  StreamSubscription<Uri>? _sub;

  /// Start listening for voice commands
  void initialize() {
    debugPrint("🎙️ VoiceBridge Initializing...");
    _appLinks = AppLinks();

    // Handle links (both initial and subsequent)
    // app_links emits the initial link on subscription if available
    _sub = _appLinks.uriLinkStream.listen((Uri uri) {
      _handleLink(uri);
    }, onError: (err) {
      debugPrint('VoiceBridge Error: $err');
    });
  }

  void _handleLink(Uri uri) {
    debugPrint("🎙️ Voice Command Received: $uri");
    
    if (uri.scheme == 'fiinny') {
      if (uri.host == 'add-expense') {
        _handleAddExpense(uri.queryParameters);
      } else if (uri.host == 'ask') {
        _handleAsk(uri.queryParameters);
      }
    }
  }

  void _handleAddExpense(Map<String, String> params) {
    debugPrint("Processing Add Expense: $params");
    // e.g. /add?amount=50&category=Food
    // We navigate to /add route (AddTransactionScreen) which accepts userId
    // Ideally we pass arguments. For now let's just open the screen.
    // final userId = params['userId'] ?? ""; 
    
    // Better: Navigate to /add and maybe pass pre-filled data via a wrapper or simply let user finish
    rootNavigatorKey.currentState?.pushNamed('/add', arguments: "voice_user");
  }
  
  void _handleAsk(Map<String, String> params) {
     final query = params['q'] ?? "";
     debugPrint("Processing AI Question: $query");
     // Future: Open AI Chat Overlay
  }

  void dispose() {
    _sub?.cancel();
  }
}
