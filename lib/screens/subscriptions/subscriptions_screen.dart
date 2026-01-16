import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lifemap/models/subscription_item.dart';
import 'package:lifemap/services/subscription_service.dart';
import 'add_subscription_screen.dart';

class SubscriptionsScreen extends StatefulWidget {
  final String userId;
  const SubscriptionsScreen({super.key, required this.userId});

  @override
  State<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends State<SubscriptionsScreen> {
  final SubscriptionService _service = SubscriptionService();

  // View mode: 0 = All, 1 = Subscriptions, 2 = Bills, 3 = Trials
  int _selectedFilterIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212), // Dark theme base
      appBar: AppBar(
        title: Text(
          'Commitments',
          style: GoogleFonts.outfit(fontWeight: FontWeight.w600),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) =>
                        AddSubscriptionScreen(userId: widget.userId)),
              );
            },
          ),
        ],
      ),
      body: StreamBuilder<List<SubscriptionItem>>(
        stream: _service.streamSubscriptions(widget.userId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final items = snapshot.data ?? [];
          final filteredItems = _filterItems(items);
          final totalMonthly = _calculateMonthlyTotal(items);

          return Column(
            children: [
              // 1. Header Card
              _buildSummaryCard(totalMonthly, items.length),

              // 2. Timeline Strip (Upcoming)
              _buildTimelineStrip(items),

              const SizedBox(height: 16),

              // 3. Filters
              _buildFilterTabs(),

              const SizedBox(height: 16),

              // 4. List
              Expanded(
                child: filteredItems.isEmpty
                    ? _buildEmptyState()
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: filteredItems.length,
                        itemBuilder: (context, index) {
                          return _buildSubscriptionTile(filteredItems[index]);
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  List<SubscriptionItem> _filterItems(List<SubscriptionItem> items) {
    switch (_selectedFilterIndex) {
      case 1:
        return items.where((i) => i.type == 'subscription').toList();
      case 2:
        return items.where((i) => i.type == 'bill').toList();
      case 3:
        return items.where((i) => i.type == 'trial').toList();
      default:
        return items;
    }
  }

  double _calculateMonthlyTotal(List<SubscriptionItem> items) {
    double total = 0;
    for (var item in items) {
      // Normalize to monthly.
      // If yearly, divide by 12. If weekly, multiply by 4.33.
      if (item.isPaused) continue;

      double monthlyAmount = item.amount;
      if (item.frequency == 'yearly') monthlyAmount = item.amount / 12;
      if (item.frequency == 'weekly') monthlyAmount = item.amount * 4.33;
      if (item.frequency == 'daily') monthlyAmount = item.amount * 30; // approx

      total += monthlyAmount;
    }
    return total;
  }

  Widget _buildSummaryCard(double total, int count) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.blueGrey.shade900, Colors.black87],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white10),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.5),
              blurRadius: 10,
              offset: const Offset(0, 4),
            )
          ]),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Total Monthly Burn',
                style: GoogleFonts.outfit(
                  color: Colors.white70,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                NumberFormat.currency(symbol: '₹', decimalDigits: 0)
                    .format(total),
                style: GoogleFonts.outfit(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '$count active commitments',
                style: GoogleFonts.outfit(
                  color: Colors.greenAccent,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          // Circular Progress or Chart could go here
          Container(
            height: 50,
            width: 50,
            decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.1)),
            child: const Icon(Icons.analytics, color: Colors.white70),
          )
        ],
      ),
    );
  }

  Widget _buildTimelineStrip(List<SubscriptionItem> items) {
    // Sort by next due
    final sorted = List<SubscriptionItem>.from(items)
      ..sort((a, b) => (a.nextDueAt ?? DateTime(2100))
          .compareTo(b.nextDueAt ?? DateTime(2100)));

    // Take next 5
    final upcoming = sorted.take(5).toList();

    if (upcoming.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
          child: Text(
            'Timeline',
            style: GoogleFonts.outfit(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 16,
            ),
          ),
        ),
        SizedBox(
          height: 100, // Reduced height
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            scrollDirection: Axis.horizontal,
            itemCount: upcoming.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final item = upcoming[index];
              return _buildTimelineItem(item);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildTimelineItem(SubscriptionItem item) {
    final nextDue = item.nextDueAt;
    if (nextDue == null) return const SizedBox.shrink();

    final isToday = nextDue.day == DateTime.now().day &&
        nextDue.month == DateTime.now().month;

    return Container(
      width: 80,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(16),
        border: isToday ? Border.all(color: Colors.redAccent) : null,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            DateFormat('MMM').format(nextDue).toUpperCase(),
            style: GoogleFonts.outfit(
              color: Colors.white54,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
          Text(
            '${nextDue.day}',
            style: GoogleFonts.outfit(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _getTypeColor(item.type),
            ),
          )
        ],
      ),
    );
  }

  Widget _buildFilterTabs() {
    final tabs = ['All', 'Subs', 'Bills', 'Trials'];
    return SizedBox(
      height: 40,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final isSelected = _selectedFilterIndex == index;
          return GestureDetector(
            onTap: () => setState(() => _selectedFilterIndex = index),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? Colors.white : Colors.white10,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                tabs[index],
                style: GoogleFonts.outfit(
                  color: isSelected ? Colors.black : Colors.white70,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSubscriptionTile(SubscriptionItem item) {
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AddSubscriptionScreen(
                userId: widget.userId, existingItem: item),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E1E),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            // Icon Placeholder (Logo)
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: _getTypeColor(item.type).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Text(
                  item.title.substring(0, 1).toUpperCase(),
                  style: GoogleFonts.outfit(
                      color: _getTypeColor(item.type),
                      fontWeight: FontWeight.bold,
                      fontSize: 20),
                ),
              ),
            ),
            const SizedBox(width: 16),
            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: GoogleFonts.outfit(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    '${item.frequency} • Next: ${item.nextDueAt != null ? DateFormat('MMM d').format(item.nextDueAt!) : "Unknown"}',
                    style: GoogleFonts.outfit(
                      color: Colors.white54,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            // Amount
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  NumberFormat.currency(symbol: '₹', decimalDigits: 0)
                      .format(item.amount),
                  style: GoogleFonts.outfit(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                if (item.type == 'trial')
                  Text(
                    'Trial',
                    style: GoogleFonts.outfit(
                      color: Colors.orangeAccent,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.subscriptions_outlined, size: 64, color: Colors.white10),
          const SizedBox(height: 16),
          Text(
            'No subscriptions found',
            style: GoogleFonts.outfit(color: Colors.white38),
          ),
        ],
      ),
    );
  }

  Color _getTypeColor(String type) {
    switch (type.toLowerCase()) {
      case 'bill':
        return Colors.blueAccent;
      case 'trial':
        return Colors.orangeAccent;
      default:
        return Colors.purpleAccent;
    }
  }
}
