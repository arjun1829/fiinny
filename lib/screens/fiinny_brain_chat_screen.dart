import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import '../models/ai_message.dart';

import '../services/ai/ai_chat_service.dart';

import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/subscription_service.dart';
import 'premium/upgrade_screen.dart';
import '../themes/tokens.dart';
import '../fiinny_brain/fiinny_user_snapshot.dart';
import '../fiinny_brain/services/gpt_service.dart';
import '../services/expense_service.dart';
import '../services/goal_service.dart';
import '../services/bank_account_service.dart';
import '../services/credit_card_service.dart';
import '../services/loan_service.dart';
import '../services/asset_service.dart';

class FiinnyBrainChatScreen extends StatefulWidget {
  final String userPhone;

  const FiinnyBrainChatScreen({
    required this.userPhone,
    super.key,
  });

  @override
  State<FiinnyBrainChatScreen> createState() => _FiinnyBrainChatScreenState();
}

class _FiinnyBrainChatScreenState extends State<FiinnyBrainChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final AiChatService _chatService = AiChatService();

  bool _isProcessing = false;
  String? _currentSessionId;

  // Speech to Text
  final SpeechToText _speechToText = SpeechToText();
  bool _speechEnabled = false;
  bool _isListening = false;
  String _lastWords = '';

  @override
  void initState() {
    super.initState();
    _loadData();
    _initSpeech();
  }

  /// This has to happen only once per app
  void _initSpeech() async {
    try {
      _speechEnabled = await _speechToText.initialize(
        onError: (val) => debugPrint('Speech error: $val'),
        onStatus: (val) => debugPrint('Speech status: $val'),
      );
      if (!mounted) return;
      setState(() {});
    } catch (e) {
      debugPrint("Speech initialization error: $e");
    }
  }

  /// Each time to start a speech recognition session
  void _startListening() async {
    await _speechToText.listen(onResult: _onSpeechResult);
    if (!mounted) return;
    setState(() {
      _isListening = true;
    });
  }

  /// Manually stop the active speech recognition session
  void _stopListening() async {
    await _speechToText.stop();
    if (!mounted) return;
    setState(() {
      _isListening = false;
    });
  }

  /// This is the callback that the SpeechToText plugin calls when
  /// the platform returns recognized words.
  void _onSpeechResult(SpeechRecognitionResult result) {
    setState(() {
      _lastWords = result.recognizedWords;
      _controller.text = _lastWords;
      // Cursor to end
      _controller.selection = TextSelection.fromPosition(
          TextPosition(offset: _controller.text.length));
    });

    if (result.finalResult) {
      setState(() {
        _isListening = false;
      });
      // Optional: Auto-send if desired, but user might want to edit.
      // _sendMessage();
    }
  }

  Future<void> _loadData() async {
    try {
      // Get or create session

      // Get or create session
      final sessionId = await _chatService.getOrCreateSession(widget.userPhone);

      if (mounted) {
        setState(() {
          _currentSessionId = sessionId;
        });
      }
    } catch (e) {
      debugPrint('Error loading data: $e');
    }
  }

  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _currentSessionId == null) return;

    // Check Daily Limit
    final allowed = await _checkAndConsumeDailyLimit();
    if (!allowed) return;

    setState(() {
      _isProcessing = true;
    });

    try {
      // Send user message
      await _chatService.sendUserMessage(
          widget.userPhone, _currentSessionId!, text);
      _controller.clear();

      // Scroll to bottom
      _scrollToBottom();

      // RAG Implementation
      final snapshot = await _fetchSnapshot(widget.userPhone);
      final history = await _chatService.getRecentMessages(
          widget.userPhone, _currentSessionId!);

      final response =
          await GptService.chatWithContext(text, snapshot, history);

      if (!mounted) return;

      final aiResponseText = response ??
          "I'm having trouble thinking right now. Please try again.";

      // Send AI response to Firestore
      await _chatService.addAiResponse(
          widget.userPhone, _currentSessionId!, aiResponseText);

      // Scroll to bottom again
      _scrollToBottom();
    } catch (e) {
      // debugPrint('Error sending message: $e');
      if (_currentSessionId != null) {
        await _chatService.addAiResponse(widget.userPhone, _currentSessionId!,
            "Something went wrong. Please try again.");
      }
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
      }
    }
  }

  Future<FiinnyUserSnapshot> _fetchSnapshot(String userPhone) async {
    final expenses = await ExpenseService().getExpenses(userPhone);
    final goals = await GoalService().getGoals(userPhone);

    // Phase 6: Unified Financial Truth (Entity Data)
    final bankAccounts = await BankAccountService().getAccounts(userPhone);
    final creditCards =
        await CreditCardService().getUserCards(userPhone); // Corrected
    final loans = await LoanService().getLoans(userPhone);
    final assets = await AssetService().getAssets(userPhone);

    return FiinnyUserSnapshot.generate(
      transactions: [],
      expenses: expenses,
      goals: goals,
      bankAccounts: bankAccounts,
      creditCards: creditCards,
      loans: loans,
      assets: assets,
    );
  }

  Future<void> _handleGenerateReport() async {
    setState(() {
      _isProcessing = true;
    });

    try {
      final snapshot = await _fetchSnapshot(widget.userPhone);

      // 4. Call GPT
      final report = await GptService.generateMonthlyReport(snapshot);

      if (report == null) {
        throw Exception("Failed to generate report");
      }

      // 5. Send Analysis as AI Message
      if (_currentSessionId != null) {
        final message = "**Monthly Financial Health Check**\n\n"
            "${report.analysis ?? ''}\n\n"
            "**Priority Action:** ${report.priorityAction}\n"
            "**Quick Wins:**\n${report.quickWins.map((w) => '- $w').join('\n')}";

        await _chatService.addAiResponse(
            widget.userPhone, _currentSessionId!, message);
        _scrollToBottom();
      }
    } catch (e) {
      if (_currentSessionId != null) {
        await _chatService.addAiResponse(
          widget.userPhone,
          _currentSessionId!,
          "I couldn't generate the report right now. Please try again later.",
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 🔒 Access Control REMOVED (Replaced by soft limits)

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const _GeminiSparkle(size: 28),
            const SizedBox(width: 10),
            const Text(
              "Fiinny AI",
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Clear Chat'),
                  content: const Text(
                      'Are you sure you want to clear all messages?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Clear',
                          style: TextStyle(color: Colors.red)),
                    ),
                  ],
                ),
              );
              if (confirm == true && _currentSessionId != null) {
                await _chatService.clearChat(
                    widget.userPhone, _currentSessionId!);
                // Create new session immediately so screen doesn't break
                final newId =
                    await _chatService.getOrCreateSession(widget.userPhone);
                if (mounted) setState(() => _currentSessionId = newId);
              }
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Suggestion chips
          _buildSuggestionChips(),

          // Messages
          Expanded(
            child: _currentSessionId == null
                ? const Center(child: CircularProgressIndicator())
                : StreamBuilder<List<AiMessage>>(
                    stream: _chatService.streamMessages(
                        widget.userPhone, _currentSessionId!),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      final messages = snapshot.data ?? [];

                      if (messages.isEmpty) {
                        return _buildEmptyState();
                      }

                      return ListView.builder(
                        controller: _scrollController,
                        reverse: true,
                        padding: const EdgeInsets.all(16),
                        itemCount: messages.length,
                        itemBuilder: (context, index) {
                          final message = messages[index];
                          return _buildMessageBubble(message);
                        },
                      );
                    },
                  ),
          ),

          // Input field
          _buildInputField(),
        ],
      ),
    );
  }

  Widget _buildSuggestionChips() {
    final suggestions = [
      'Generate Monthly Report',
      'How much do I owe?',
      'Show travel expenses',
      'Who should I remind?',
      'Was my flight tracked?',
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: suggestions.map((suggestion) {
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ActionChip(
                label: Text(suggestion, style: const TextStyle(fontSize: 12)),
                onPressed: () {
                  if (suggestion == 'Generate Monthly Report') {
                    _handleGenerateReport();
                  } else {
                    _controller.text = suggestion;
                    _sendMessage();
                  }
                },
                backgroundColor: Fx.mint.withValues(alpha: 0.1),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: Fx.mint.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child:
                  Icon(Icons.psychology_rounded, size: 40, color: Fx.mintDark),
            ),
            const SizedBox(height: 24),
            const Text(
              'Ask me anything!',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            const Text(
              'I can help you with:\n'
              '• Split expenses and friend balances\n'
              '• Travel and category spending\n'
              '• Finding specific expenses\n'
              '• Financial summaries',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(AiMessage message) {
    final isUser = message.isUser;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFE0E0E0)),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 4)
                ],
              ),
              child: const _GeminiSparkle(size: 20), // Smaller animated sparkle
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isUser ? Fx.mintDark : Colors.grey[100],
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                message.text,
                style: TextStyle(
                  color: isUser ? Colors.white : Colors.black87,
                  height: 1.4,
                ),
              ),
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 8),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.person, color: Colors.black54, size: 18),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInputField() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                decoration: InputDecoration(
                  hintText: 'Ask me anything...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: Colors.grey[100],
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                ),
                maxLines: null,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(),
                enabled: !_isProcessing,
              ),
            ),
            const SizedBox(width: 8),

            // Microphone Button
            Container(
              decoration: BoxDecoration(
                color: _isListening ? Colors.redAccent : Colors.grey[200],
                borderRadius: BorderRadius.circular(24),
              ),
              child: IconButton(
                icon: Icon(
                  _isListening ? Icons.mic : Icons.mic_none,
                  color: _isListening ? Colors.white : Colors.black54,
                ),
                onPressed: _speechEnabled
                    ? (_isListening ? _stopListening : _startListening)
                    : null, // Disabled if speech not initialized
              ),
            ),

            const SizedBox(width: 8),
            Container(
              decoration: BoxDecoration(
                color: Fx.mintDark,
                borderRadius: BorderRadius.circular(24),
              ),
              child: IconButton(
                icon: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(Colors.white),
                        ),
                      )
                    : const Icon(Icons.send, color: Colors.white),
                onPressed: _isProcessing ? null : _sendMessage,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<bool> _checkAndConsumeDailyLimit() async {
    final sub = Provider.of<SubscriptionService>(context, listen: false);
    if (sub.isPro) return true; // Unlimited

    final int limit = sub.isPremium ? 20 : 10;

    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.now();
    final key = 'brain_prompts_${now.year}_${now.month}_${now.day}';
    final count = prefs.getInt(key) ?? 0;

    if (count >= limit) {
      _showLimitReachedDialog(limit, sub.isPremium);
      return false;
    }

    await prefs.setInt(key, count + 1);
    return true;
  }

  void _showLimitReachedDialog(int limit, bool isPremium) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Daily Limit Reached'),
        content: Text(
          isPremium
              ? "You've used your $limit daily Premium prompts. Upgrade to Pro for unlimited access!"
              : "You've used your $limit free prompts. Upgrade to Premium for 20 prompts/day or Pro for unlimited!",
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text("OK", style: TextStyle(color: Colors.grey))),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const UpgradeScreen()));
            },
            style: FilledButton.styleFrom(backgroundColor: Fx.mintDark),
            child: const Text("Upgrade"),
          ),
        ],
      ),
    );
  }
}

class _GeminiSparkle extends StatefulWidget {
  final double size;
  const _GeminiSparkle({this.size = 28});

  @override
  State<_GeminiSparkle> createState() => _GeminiSparkleState();
}

class _GeminiSparkleState extends State<_GeminiSparkle>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (bounds) {
            return LinearGradient(
              colors: const [
                Color(0xFF1E88E5), // Blue
                Color(0xFF8E24AA), // Purple
                Color(0xFFE91E63), // Pink
                Color(0xFF1E88E5), // Loop back
              ],
              transform: GradientRotation(_controller.value * 2 * 3.14159),
            ).createShader(bounds);
          },
          child: Icon(
            Icons.auto_awesome,
            size: widget.size,
            color: Colors.white,
          ),
        );
      },
    );
  }
}
