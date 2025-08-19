import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../widgets/weekly_partner_rings_widget.dart';
import '../widgets/partner_chat_tab.dart';

class UserDashboardScreen extends StatefulWidget {
  final String currentUserId;
  final double ringSize;

  /// Optional: pass a partner phone (docId) to enable chat right here.
  /// If null, the Chat tab shows a placeholder until a partner is chosen elsewhere.
  final String? chatPeerUserId;

  const UserDashboardScreen({
    Key? key,
    required this.currentUserId,
    this.ringSize = 110,
    this.chatPeerUserId,
  }) : super(key: key);

  @override
  State<UserDashboardScreen> createState() => _UserDashboardScreenState();
}

class _UserDashboardScreenState extends State<UserDashboardScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // User info
  String? userAvatar;
  String userName = "";

  // Selected day stats
  DateTime selectedDay = DateTime.now();
  double selCredit = 0.0;
  double selDebit = 0.0;
  int selTxCount = 0;
  double selTxAmount = 0.0;
  List<Map<String, dynamic>> selTxList = [];

  // Weekly stats
  List<double> dailyPercents = List.filled(7, 0.0);
  List<double> dailyCredits = List.filled(7, 0.0);
  List<double> dailyDebits = List.filled(7, 0.0);

  List<DateTime> last7Days = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this); // Transactions + Chat
    _loadAll();
  }

  Future<void> _loadAll() async {
    final db = FirebaseFirestore.instance;
    final userId = widget.currentUserId;

    // Fetch user profile
    final profileDoc = await db.collection('users').doc(userId).get();
    setState(() {
      userAvatar = profileDoc.data()?['avatar'] as String?;
      userName = profileDoc.data()?['name'] ?? "You";
    });

    // Prepare last 7 days list
    final now = DateTime.now();
    last7Days = List.generate(
      7,
          (i) => DateTime(now.year, now.month, now.day).subtract(Duration(days: 6 - i)),
    );

    List<double> percents = [];
    List<double> credits = [];
    List<double> debits = [];
    double weeklyMax = 1000.0; // Adjust target as needed

    for (var day in last7Days) {
      final dayStart = DateTime(day.year, day.month, day.day);
      final dayEnd = dayStart.add(const Duration(days: 1));

      final incomeSnap = await db
          .collection('users')
          .doc(userId)
          .collection('incomes')
          .where('date', isGreaterThanOrEqualTo: dayStart)
          .where('date', isLessThan: dayEnd)
          .get();

      final expenseSnap = await db
          .collection('users')
          .doc(userId)
          .collection('expenses')
          .where('date', isGreaterThanOrEqualTo: dayStart)
          .where('date', isLessThan: dayEnd)
          .get();

      double dayCredit = 0.0, dayDebit = 0.0;
      for (final doc in incomeSnap.docs) {
        dayCredit += (doc.data()['amount'] as num? ?? 0).toDouble();
      }
      for (final doc in expenseSnap.docs) {
        dayDebit += (doc.data()['amount'] as num? ?? 0).toDouble();
      }
      percents.add(((dayCredit + dayDebit) / weeklyMax).clamp(0.0, 1.0));
      credits.add(dayCredit);
      debits.add(dayDebit);
    }

    setState(() {
      dailyPercents = percents;
      dailyCredits = credits;
      dailyDebits = debits;
    });

    await _loadDayStats(last7Days.last);
  }

  Future<void> _loadDayStats(DateTime day) async {
    final db = FirebaseFirestore.instance;
    final userId = widget.currentUserId;
    final dayStart = DateTime(day.year, day.month, day.day);
    final dayEnd = dayStart.add(const Duration(days: 1));

    final incomeSnap = await db
        .collection('users')
        .doc(userId)
        .collection('incomes')
        .where('date', isGreaterThanOrEqualTo: dayStart)
        .where('date', isLessThan: dayEnd)
        .get();

    final expenseSnap = await db
        .collection('users')
        .doc(userId)
        .collection('expenses')
        .where('date', isGreaterThanOrEqualTo: dayStart)
        .where('date', isLessThan: dayEnd)
        .get();

    double credit = 0.0, debit = 0.0;
    int count = 0;
    List<Map<String, dynamic>> txs = [];
    for (final doc in incomeSnap.docs) {
      credit += (doc.data()['amount'] as num? ?? 0).toDouble();
      count += 1;
      txs.add({
        'type': 'income',
        'amount': doc.data()['amount'],
        'category': doc.data()['type'],
        'note': doc.data()['note'],
        'date': doc.data()['date'],
      });
    }
    for (final doc in expenseSnap.docs) {
      debit += (doc.data()['amount'] as num? ?? 0).toDouble();
      count += 1;
      txs.add({
        'type': 'expense',
        'amount': doc.data()['amount'],
        'category': doc.data()['type'],
        'note': doc.data()['note'],
        'date': doc.data()['date'],
      });
    }
    txs.sort((a, b) => (b['date'] as Timestamp).compareTo(a['date'] as Timestamp));

    setState(() {
      selectedDay = day;
      selCredit = credit;
      selDebit = debit;
      selTxCount = count;
      selTxAmount = credit + debit;
      selTxList = txs;
    });
  }

  void _onRingTap(int ringIndex) async {
    if (ringIndex < 0 || ringIndex >= last7Days.length) return;
    await _loadDayStats(last7Days[ringIndex]);
  }

  @override
  Widget build(BuildContext context) {
    final avatar = userAvatar ?? "assets/images/profile_default.png";
    String dateStr = "${selectedDay.day}/${selectedDay.month}/${selectedDay.year}";

    return Scaffold(
      appBar: AppBar(
        title: const Text("Your Dashboard"),
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Card(
            margin: const EdgeInsets.fromLTRB(18, 22, 18, 0),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
            elevation: 5,
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        userName,
                        style: TextStyle(fontSize: 23, fontWeight: FontWeight.bold, color: Colors.teal[800]),
                      ),
                      const SizedBox(height: 12),
                      CircleAvatar(
                        radius: 37,
                        backgroundImage: avatar.startsWith('http')
                            ? NetworkImage(avatar)
                            : AssetImage(avatar) as ImageProvider,
                        backgroundColor: Colors.teal.withOpacity(0.13),
                      ),
                    ],
                  ),
                  const SizedBox(width: 20),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          height: widget.ringSize,
                          width: widget.ringSize,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              CircularProgressIndicator(
                                value: ((selCredit + selDebit) / 1000.0).clamp(0.0, 1.0),
                                strokeWidth: 13,
                                backgroundColor: Colors.grey[300],
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  ((selCredit + selDebit) / 1000.0) >= 1.0 ? Colors.green : Colors.teal,
                                ),
                              ),
                              Text(
                                '₹${selTxAmount.toStringAsFixed(0)}',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 22),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _StatMini(label: "Credit", value: selCredit, color: Colors.green[700]),
                            _StatMini(label: "Debit", value: selDebit, color: Colors.red[700]),
                          ],
                        ),
                        const SizedBox(height: 7),
                        Text(
                          "Tx: $selTxCount  •  $dateStr",
                          style: TextStyle(fontSize: 14, color: Colors.teal[900]),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 10),
            child: Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 18.0, horizontal: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Last 7 Days Activity',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.teal[700])),
                    const SizedBox(height: 10),
                    (dailyPercents.length == 7 && last7Days.length == 7)
                        ? WeeklyPartnerRingsWidget(
                      dailyCredits: dailyCredits,
                      dailyDebits: dailyDebits,
                      onRingTap: _onRingTap,
                      dateLabels: last7Days.map((d) => "${d.day}/${d.month}").toList(),
                    )
                        : const Center(child: CircularProgressIndicator()),
                  ],
                ),
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
            child: TabBar(
              controller: _tabController,
              labelColor: Colors.teal[800],
              unselectedLabelColor: Colors.grey,
              indicatorColor: Colors.teal[700],
              tabs: const [
                Tab(text: "Transactions"),
                Tab(text: "Chat"),
              ],
            ),
          ),

          Container(
            height: 360,
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: TabBarView(
              controller: _tabController,
              children: [
                // Transactions tab
                selTxList.isEmpty
                    ? const Center(child: Text("No transactions for this day"))
                    : ListView.builder(
                  itemCount: selTxList.length,
                  itemBuilder: (ctx, i) {
                    final tx = selTxList[i];
                    return ListTile(
                      leading: Icon(
                        tx['type'] == 'income' ? Icons.arrow_downward : Icons.arrow_upward,
                        color: tx['type'] == 'income' ? Colors.green : Colors.red,
                      ),
                      title: Text(
                        "₹${tx['amount']}",
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: Text("${tx['category']}  •  ${tx['note'] ?? ''}"),
                      trailing: Text(
                        _formatDate(tx['date']),
                        style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                      ),
                    );
                  },
                ),

                // Chat tab
                if (widget.chatPeerUserId == null)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        "Select a partner to chat from the Sharing screen, or pass chatPeerUserId to UserDashboardScreen.",
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                else
                  PartnerChatTab(
                    partnerUserId: widget.chatPeerUserId!,
                    currentUserId: widget.currentUserId,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(dynamic date) {
    if (date == null) return "";
    if (date is Timestamp) {
      final d = date.toDate();
      return "${d.hour}:${d.minute.toString().padLeft(2, '0')}";
    }
    if (date is DateTime) {
      return "${date.hour}:${date.minute.toString().padLeft(2, '0')}";
    }
    return date.toString();
  }
}

class _StatMini extends StatelessWidget {
  final String label;
  final double value;
  final Color? color;
  const _StatMini({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 11, color: color ?? Colors.teal),
        ),
        Text(
          "₹${value.toStringAsFixed(0)}",
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: color ?? Colors.teal[900],
          ),
        ),
      ],
    );
  }
}
