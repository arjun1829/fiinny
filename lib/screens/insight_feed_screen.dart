import 'package:flutter/material.dart';
import '../services/fiinny_brain_service.dart';
import '../models/insight_model.dart';
import '../services/user_data.dart';

class InsightFeedScreen extends StatefulWidget {
  final String userId;
  final UserData userData;

  const InsightFeedScreen({
    Key? key,
    required this.userId,
    required this.userData,
  }) : super(key: key);

  @override
  State<InsightFeedScreen> createState() => _InsightFeedScreenState();
}

class _InsightFeedScreenState extends State<InsightFeedScreen> {
  List<InsightModel> _insights = [];
  bool _loading = true;
  bool _showOnlyUnread = false;

  @override
  void initState() {
    super.initState();
    _fetchInsights();
  }

  Future<void> _fetchInsights() async {
    setState(() => _loading = true);
    try {
      // This can be replaced by DB fetch if using Firebase
      final insights = FiinnyBrainService.generateInsights(
        widget.userData,
        userId: widget.userId,
      );
      setState(() {
        _insights = insights;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Error loading insights: $e")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final displayList = _showOnlyUnread
        ? _insights.where((i) => i.isRead != true).toList()
        : _insights;

    return Scaffold(
      appBar: AppBar(
        title: const Text("📊 Fiinny Brain Insights"),
        actions: [
          if (_insights.any((i) => i.isRead != true))
            IconButton(
              icon: Icon(
                _showOnlyUnread
                    ? Icons.mark_email_read_rounded
                    : Icons.mark_email_unread_rounded,
                color: Colors.teal,
              ),
              tooltip: _showOnlyUnread ? "Show All" : "Show Unread Only",
              onPressed: () => setState(() => _showOnlyUnread = !_showOnlyUnread),
            )
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
        onRefresh: _fetchInsights,
        child: displayList.isEmpty
            ? const Center(
          child: Text("No insights to show! 🎉", style: TextStyle(color: Colors.teal)),
        )
            : ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: displayList.length,
          separatorBuilder: (_, __) => const Divider(),
          itemBuilder: (context, index) {
            final insight = displayList[index];
            return ListTile(
              leading: Icon(_iconForType(insight.type), size: 28),
              title: Text(
                insight.title,
                style: TextStyle(
                  fontWeight: insight.severity != null && insight.severity! >= 2
                      ? FontWeight.w700
                      : FontWeight.w500,
                  color: _colorForType(insight.type),
                ),
              ),
              subtitle: Text(
                insight.description,
                style: TextStyle(
                  color: Colors.grey[800],
                  fontStyle: insight.type == InsightType.critical ? FontStyle.italic : FontStyle.normal,
                ),
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    "${insight.timestamp.day}/${insight.timestamp.month}",
                    style: const TextStyle(fontSize: 12),
                  ),
                  if (insight.isRead == true)
                    const Icon(Icons.done_all_rounded, color: Colors.teal, size: 18),
                ],
              ),
            );
          },
        ),
      ),
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
      case InsightType.info:
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
      case InsightType.info:
      default:
        return Colors.blueGrey.shade600;
    }
  }
}
