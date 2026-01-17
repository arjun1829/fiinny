import 'package:flutter/material.dart';
import '../services/fiinny_brain_service.dart';
import '../models/insight_model.dart';
import '../services/user_data.dart';
import '../services/ai/ai_chat_service.dart';
import '../models/ai_message.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../services/ai/action_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image_picker/image_picker.dart';
import 'premium/subscription_screen.dart';

class InsightFeedScreen extends StatefulWidget {
  final String userId;
  final UserData userData;

  const InsightFeedScreen({
    super.key,
    required this.userId,
    required this.userData,
  });

  @override
  State<InsightFeedScreen> createState() => _InsightFeedScreenState();
}

class _InsightFeedScreenState extends State<InsightFeedScreen>
    with SingleTickerProviderStateMixin {
  final _chatService = AiChatService();
  final _inputController = TextEditingController();
  late TabController _tabController;
  final ScrollController _scrollController = ScrollController();

  List<InsightModel> _insights = [];
  bool _loadingInsights = true;

  String? _currentSessionId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetchInsights();
    _initSession();
  }

  @override
  void dispose() {
    _inputController.dispose();
    _tabController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _initSession() async {
    final sessionId = await _chatService.getOrCreateSession(widget.userId);
    if (mounted) setState(() => _currentSessionId = sessionId);
  }

  Future<void> _fetchInsights() async {
    setState(() => _loadingInsights = true);
    try {
      final insights = FiinnyBrainService.generateInsights(
        widget.userData,
        userId: widget.userId,
      );
      setState(() {
        _insights = insights;
        _loadingInsights = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingInsights = false);
    }
  }

  final _router = ActionRouter();
  final _picker = ImagePicker();

  void _openSettings() {
    final keyController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("AI Settings"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text("Enter Google Gemini API Key (Free):"),
            TextField(
              controller: keyController,
              decoration: const InputDecoration(hintText: "Paste Key Here"),
            ),
            const SizedBox(height: 10),
            const Text("Get one at aistudio.google.com",
                style: TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              if (keyController.text.isNotEmpty) {
                final prefs = await SharedPreferences.getInstance();
                await prefs.setString(
                    'gemini_api_key', keyController.text.trim());
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("Key Saved!")));
                }
              }
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text("Save"),
          )
        ],
      ),
    );
  }

  void _onCameraTap() async {
    final XFile? image =
        await _picker.pickImage(source: ImageSource.camera, imageQuality: 50);
    if (image == null) return;

    // Show preview or just send? For now, sending directly.
    if (_currentSessionId != null) {
      _chatService.sendUserMessage(
          widget.userId, _currentSessionId!, "[Sent a Receipt Image]");
    }

    // Simulate thinking
    await Future.delayed(const Duration(milliseconds: 600));

    // Call ActionRouter with special "scan receipt" intent + image path
    try {
      // We need to modify ActionRouter to accept image path or handle this manually here.
      // For Phase 3, we call the service directly via a specific router intent convention.
      if (_currentSessionId != null) {
        final response = await _router.route(
            "scan receipt ${image.path}", widget.userId, widget.userData);
        await _chatService.addAiResponse(
            widget.userId, _currentSessionId!, response);
      }
    } catch (e) {
      if (_currentSessionId != null) {
        await _chatService.addAiResponse(
            widget.userId, _currentSessionId!, "Error scanning receipt: $e");
      }
    }
  }

  void _sendMessage() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    if (_currentSessionId != null) {
      _chatService.sendUserMessage(widget.userId, _currentSessionId!, text);
    }
    _inputController.clear();

    // Scroll to bottom
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });

    // Simulate "Thinking"
    await Future.delayed(const Duration(milliseconds: 600));

    // Execute Action via Router (Phase 9)
    try {
      if (_currentSessionId != null) {
        final response =
            await _router.route(text, widget.userId, widget.userData);
        await _chatService.addAiResponse(
            widget.userId, _currentSessionId!, response);
      }
    } catch (e) {
      if (_currentSessionId != null) {
        await _chatService.addAiResponse(widget.userId, _currentSessionId!,
            "I encountered an error trying to do that: $e");
      }
    }
  }

  final _speech = stt.SpeechToText();
  bool _isListening = false;
  bool _sttAvailable = false;

  void _onMicTap() async {
    if (_isListening) {
      _speech.stop();
      setState(() => _isListening = false);
      return;
    }

    if (!_sttAvailable) {
      _sttAvailable = await _speech.initialize(
        onStatus: (status) {
          if (status == 'done' || status == 'notListening') {
            if (mounted) setState(() => _isListening = false);
          }
        },
        onError: (e) => ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Mic Error: $e'))),
      );
    }

    if (!mounted) return;

    if (_sttAvailable) {
      setState(() => _isListening = true);
      _speech.listen(
        onResult: (result) {
          setState(() {
            _inputController.text = result.recognizedWords;
          });
        },
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text("Microphone permission denied or not available.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("🧠 Fiinny AI"),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context)
              .pop(), // Explicit pop to fix 'cannot go back'
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.teal,
          unselectedLabelColor: Colors.grey,
          indicatorColor: Colors.teal,
          tabs: const [
            Tab(text: "Chat", icon: Icon(Icons.chat_bubble_outline)),
            Tab(text: "Insights", icon: Icon(Icons.lightbulb_outline)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.diamond_outlined, color: Colors.amber),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: _openSettings,
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildChatTab(),
          _buildInsightsTab(),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.auto_awesome,
              size: 48, color: Colors.teal.withValues(alpha: 0.3)),
          const SizedBox(height: 16),
          Text(
            "Start a conversation with Fiinny",
            style: TextStyle(color: Colors.grey.shade600),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              _SuggestionChip(
                  label: "Analyze my spending",
                  onTap: () => _updateInput("Analyze my spending")),
              _SuggestionChip(
                  label: "Add expense 500",
                  onTap: () => _updateInput("Add expense 500 for lunch")),
            ],
          )
        ],
      ),
    );
  }

  void _updateInput(String text) {
    _inputController.text = text;
  }

  Widget _buildMessageBubble(AiMessage msg) {
    final isUser = msg.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isUser ? Colors.teal : Colors.grey.shade200,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft:
                isUser ? const Radius.circular(16) : const Radius.circular(0),
            bottomRight:
                isUser ? const Radius.circular(0) : const Radius.circular(16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              msg.text,
              style: TextStyle(
                color: isUser ? Colors.white : Colors.black87,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              timeago.format(msg.timestamp),
              style: TextStyle(
                color: isUser ? Colors.white70 : Colors.grey.shade600,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInsightsTab() {
    if (_loadingInsights) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_insights.isEmpty) {
      return const Center(child: Text("No insights available."));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _insights.length,
      separatorBuilder: (_, __) => const Divider(),
      itemBuilder: (context, index) {
        final insight = _insights[index];
        return ListTile(
          leading: Icon(_iconForType(insight.type),
              color: _colorForType(insight.type)),
          title: Text(insight.title,
              style: const TextStyle(fontWeight: FontWeight.bold)),
          subtitle: Text(insight.description),
        );
      },
    );
  }

  IconData _iconForType(InsightType type) {
    switch (type) {
      case InsightType.critical:
        return Icons.warning_amber_rounded;
      case InsightType.warning:
        return Icons.report_problem_outlined;
      case InsightType.positive:
        return Icons.check_circle_outline;
      default:
        return Icons.info_outline;
    }
  }

  Color _colorForType(InsightType type) {
    switch (type) {
      case InsightType.critical:
        return Colors.red.shade700;
      case InsightType.warning:
        return Colors.orange.shade800;
      case InsightType.positive:
        return Colors.teal.shade800;
      default:
        return Colors.blueGrey.shade600;
    }
  }

  Widget _buildChatTab() {
    return Column(
      children: [
        Expanded(
          child: _currentSessionId == null
              ? const Center(child: CircularProgressIndicator())
              : StreamBuilder<List<AiMessage>>(
                  stream: _chatService.streamMessages(
                      widget.userId, _currentSessionId!),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    final messages = snapshot.data ?? [];
                    if (messages.isEmpty) return _buildEmptyState();

                    return ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: messages.length,
                      itemBuilder: (context, index) =>
                          _buildMessageBubble(messages[index]),
                    );
                  },
                ),
        ),
        _buildInputArea(),
      ],
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 4,
              offset: const Offset(0, -2)),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.camera_alt_outlined),
              color: Colors.grey.shade600,
              onPressed: _onCameraTap,
            ),
            IconButton(
              icon: Icon(_isListening ? Icons.mic : Icons.mic_none),
              color: _isListening ? Colors.red : Colors.grey.shade600,
              onPressed: _onMicTap,
            ),
            Expanded(
              child: TextField(
                controller: _inputController,
                decoration: InputDecoration(
                  hintText: "Ask Fiinny...",
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  filled: true,
                  fillColor: Colors.grey.shade100,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide.none),
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
            const SizedBox(width: 8),
            CircleAvatar(
              backgroundColor: Colors.teal,
              child: IconButton(
                icon: const Icon(Icons.send, color: Colors.white, size: 20),
                onPressed: _sendMessage,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuggestionChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _SuggestionChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label),
      onPressed: onTap,
      backgroundColor: Colors.teal.shade50,
      labelStyle: TextStyle(color: Colors.teal.shade800, fontSize: 12),
    );
  }
}
