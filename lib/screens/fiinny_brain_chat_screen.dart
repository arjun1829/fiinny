import 'package:flutter/material.dart';
import '../models/ai_message.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/ai/ai_chat_service.dart';
import '../services/fiinny_brain_query_service.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/contact_name_service.dart';
import '../themes/tokens.dart';

class FiinnyBrainChatScreen extends StatefulWidget {
  final String userPhone;

  const FiinnyBrainChatScreen({
    required this.userPhone,
    Key? key,
  }) : super(key: key);

  @override
  State<FiinnyBrainChatScreen> createState() => _FiinnyBrainChatScreenState();
}

class _FiinnyBrainChatScreenState extends State<FiinnyBrainChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final AiChatService _chatService = AiChatService();
  final ExpenseService _expenseService = ExpenseService();
  final IncomeService _incomeService = IncomeService();
  
  bool _isProcessing = false;
  List<ExpenseItem> _expenses = [];
  List<IncomeItem> _incomes = [];
  Map<String, String> _phoneToNameMap = {};

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final expenses = await _expenseService.getExpenses(widget.userPhone);
      final incomes = await _incomeService.getIncomes(widget.userPhone);
      
      // Build phone-to-name map from ContactNameService
      // Note: This is a simplified version - you may need to enhance this
      final phoneToName = <String, String>{};
      // TODO: Populate from ContactNameService or friend list
      
      if (mounted) {
        setState(() {
          _expenses = expenses;
          _incomes = incomes;
          _phoneToNameMap = phoneToName;
        });
      }
    } catch (e) {
      debugPrint('Error loading data: $e');
    }
  }

  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _isProcessing = true;
    });

    try {
      // Send user message
      await _chatService.sendUserMessage(widget.userPhone, text);
      _controller.clear();

      // Scroll to bottom
      _scrollToBottom();

      // Process query
      final response = await FiinnyBrainQueryService.processQuery(
        query: text,
        userPhone: widget.userPhone,
        expenses: _expenses,
        incomes: _incomes,
        friendNames: _phoneToNameMap,
      );

      // Send AI response
      await _chatService.addAiResponse(widget.userPhone, response);

      // Scroll to bottom again
      _scrollToBottom();
    } catch (e) {
      // Send error message
      await _chatService.addAiResponse(
        widget.userPhone,
        "I encountered an error: $e\n\nPlease try again.",
      );
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
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Fx.mintDark,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.psychology_rounded, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            const Text('Fiinny Brain'),
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
                  content: const Text('Are you sure you want to clear all messages?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Clear', style: TextStyle(color: Colors.red)),
                    ),
                  ],
                ),
              );
              if (confirm == true) {
                await _chatService.clearChat(widget.userPhone);
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
            child: StreamBuilder<List<AiMessage>>(
              stream: _chatService.streamMessages(widget.userPhone),
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
                  _controller.text = suggestion;
                  _sendMessage();
                },
                backgroundColor: Fx.mint.withOpacity(0.1),
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
                color: Fx.mint.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(Icons.psychology_rounded, size: 40, color: Fx.mintDark),
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
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Fx.mintDark,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.psychology_rounded, color: Colors.white, size: 18),
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
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
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
                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              ),
              maxLines: null,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _sendMessage(),
              enabled: !_isProcessing,
            ),
          ),
          const SizedBox(width: 12),
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
    );
  }
}
