// lib/sharing/screens/partner_dashboard_screen.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/partner_model.dart';
import '../widgets/weekly_partner_rings_widget.dart';
import '../widgets/partner_chat_tab.dart';

class PartnerDashboardScreen extends StatefulWidget {
  final PartnerModel partner;
  final String currentUserId;
  final double credit;
  final double debit;

  const PartnerDashboardScreen({
    Key? key,
    required this.partner,
    required this.currentUserId,
    this.credit = 0.0,
    this.debit = 0.0,
  }) : super(key: key);

  @override
  State<PartnerDashboardScreen> createState() => _PartnerDashboardScreenState();
}

class _PartnerDashboardScreenState extends State<PartnerDashboardScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late Map<String, bool> permissions;

  String? partnerAvatar;
  String partnerName = "";

  DateTime selectedDay = DateTime.now();
  double selCredit = 0.0;
  double selDebit = 0.0;
  int selTxCount = 0;
  double selTxAmount = 0.0;
  List<Map<String, dynamic>> selTxList = [];

  List<double> dailyPercents = List.filled(8, 0.0);
  List<double> dailyCredits = List.filled(8, 0.0);
  List<double> dailyDebits = List.filled(8, 0.0);

  List<DateTime> last8Days = [];

  bool get _canReadTx =>
      (widget.partner.status == 'active') &&
          (permissions['tx'] == true);

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this); // Transactions + Chat
    permissions = widget.partner.permissions;
    _loadAll();
  }

  Future<void> _loadAll() async {
    final db = FirebaseFirestore.instance;
    final partnerId = widget.partner.partnerId;

    // partner profile
    final profileDoc = await db.collection('users').doc(partnerId).get();
    setState(() {
      partnerAvatar = profileDoc.data()?['avatar'] as String?;
      partnerName = (profileDoc.data()?['name'] as String?)?.trim().isNotEmpty == true
          ? profileDoc.data()!['name']
          : widget.partner.partnerName;
    });

    // dates
    final now = DateTime.now();
    last8Days = List.generate(
      8,
          (i) => DateTime(now.year, now.month, now.day).subtract(Duration(days: 7 - i)),
    );

    // if tx not allowed, keep graphs zeroed and bail (no reads)
    if (!_canReadTx) {
      setState(() {
        dailyPercents = List.filled(8, 0.0);
        dailyCredits = List.filled(8, 0.0);
        dailyDebits = List.filled(8, 0.0);
        selCredit = 0.0;
        selDebit = 0.0;
        selTxCount = 0;
        selTxAmount = 0.0;
        selTxList = [];
      });
      return;
    }

    // weekly aggregates
    List<double> percents = [];
    List<double> credits = [];
    List<double> debits = [];
    const double weeklyMax = 1000.0;

    for (var day in last8Days) {
      final dayStart = DateTime(day.year, day.month, day.day);
      final dayEnd = dayStart.add(const Duration(days: 1));

      final incomeSnap = await db
          .collection('users')
          .doc(partnerId)
          .collection('incomes')
          .where('date', isGreaterThanOrEqualTo: dayStart)
          .where('date', isLessThan: dayEnd)
          .get();

      final expenseSnap = await db
          .collection('users')
          .doc(partnerId)
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

    await _loadDayStats(last8Days.last);
  }

  Future<void> _loadDayStats(DateTime day) async {
    final db = FirebaseFirestore.instance;
    final partnerId = widget.partner.partnerId;
    final dayStart = DateTime(day.year, day.month, day.day);
    final dayEnd = dayStart.add(const Duration(days: 1));

    if (!_canReadTx) {
      setState(() {
        selectedDay = day;
        selCredit = 0.0;
        selDebit = 0.0;
        selTxCount = 0;
        selTxAmount = 0.0;
        selTxList = [];
      });
      return;
    }

    final incomeSnap = await db
        .collection('users')
        .doc(partnerId)
        .collection('incomes')
        .where('date', isGreaterThanOrEqualTo: dayStart)
        .where('date', isLessThan: dayEnd)
        .get();

    final expenseSnap = await db
        .collection('users')
        .doc(partnerId)
        .collection('expenses')
        .where('date', isGreaterThanOrEqualTo: dayStart)
        .where('date', isLessThan: dayEnd)
        .get();

    double credit = 0.0, debit = 0.0;
    int count = 0;
    List<Map<String, dynamic>> txs = [];
    for (final doc in incomeSnap.docs) {
      credit += (doc.data()['amount'] as num? ?? 0).toDouble();
      count++;
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
      count++;
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
    if (ringIndex < 0 || ringIndex >= last8Days.length) return;
    await _loadDayStats(last8Days[ringIndex]);
  }

  @override
  Widget build(BuildContext context) {
    final avatar = partnerAvatar ?? "assets/images/profile_default.png";
    String dateStr = "${selectedDay.day}/${selectedDay.month}/${selectedDay.year}";

    return Scaffold(
      appBar: AppBar(
        title: const Text("Partner"),
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      // Removed old Edit FAB (we're not editing permissions anymore)
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          // --- Partner Card ---
          Card(
            margin: const EdgeInsets.fromLTRB(18, 22, 18, 0),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
            elevation: 5,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Image + Name
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundImage: avatar.startsWith('http')
                            ? NetworkImage(avatar)
                            : AssetImage(avatar) as ImageProvider,
                        backgroundColor: Colors.teal.withOpacity(0.13),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          partnerName,
                          style: TextStyle(
                            fontSize: 23,
                            fontWeight: FontWeight.bold,
                            color: Colors.teal[800],
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Ring
                  Center(
                    child: PartnerRingSummary(
                      credit: selCredit,
                      debit: selDebit,
                      ringSize: 140,
                      totalAmount: selTxAmount,
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Credit / Debit
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _StatMini(label: "Credit", value: selCredit, color: Colors.green[700]),
                      const SizedBox(width: 24),
                      _StatMini(label: "Debit", value: selDebit, color: Colors.red[700]),
                    ],
                  ),

                  const SizedBox(height: 14),

                  // Tx count and date
                  Center(
                    child: Text(
                      "Tx: $selTxCount  •  $dateStr",
                      style: TextStyle(fontSize: 14, color: Colors.teal[900]),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // --- Last 8 Days Rings ---
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
                    Text(
                      'Last 8 Days Activity',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.teal[700]),
                    ),
                    const SizedBox(height: 10),
                    if (!_canReadTx)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.orange.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          "Transactions sharing is off for this partner.",
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      )
                    else
                      (dailyCredits.length == 8 && dailyDebits.length == 8)
                          ? WeeklyPartnerRingsWidget(
                        dailyCredits: dailyCredits,
                        dailyDebits: dailyDebits,
                        onRingTap: _onRingTap,
                        dateLabels: last8Days.map((d) => "${d.day}/${d.month}").toList(),
                      )
                          : const Center(child: CircularProgressIndicator()),
                  ],
                ),
              ),
            ),
          ),

          // --- Tabs: Transactions + Chat ---
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
                // Transactions
                if (!_canReadTx)
                  const Center(child: Text("You don't have permission to view transactions."))
                else if (selTxList.isEmpty)
                  const Center(child: Text("No transactions for this day"))
                else
                  ListView.builder(
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

                // Chat
                PartnerChatTab(
                  partnerUserId: widget.partner.partnerId,
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

class PartnerRingSummary extends StatelessWidget {
  final double credit;
  final double debit;
  final double ringSize;
  final double? totalAmount;

  const PartnerRingSummary({
    required this.credit,
    required this.debit,
    this.ringSize = 110,
    this.totalAmount,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final total = totalAmount ?? credit + debit;

    final incomePercent = (total > 0) ? (credit / total) : 0.0;
    final expensePercent = (total > 0) ? (debit / total) : 0.0;

    return SizedBox(
      width: ringSize,
      height: ringSize,
      child: CustomPaint(
        painter: _SplitRingPainter(
          incomePercent: incomePercent,
          expensePercent: expensePercent,
        ),
        child: Center(
          child: Text(
            '₹${total.toStringAsFixed(0)}',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 23,
              color: Colors.black87,
            ),
          ),
        ),
      ),
    );
  }
}

class _SplitRingPainter extends CustomPainter {
  final double incomePercent;
  final double expensePercent;

  _SplitRingPainter({
    required this.incomePercent,
    required this.expensePercent,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const strokeWidth = 15.0;
    final radius = (size.width - strokeWidth) / 2;
    final center = Offset(size.width / 2, size.height / 2);

    final bgPaint = Paint()
      ..color = Colors.grey[300]!
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // background ring
    canvas.drawCircle(center, radius, bgPaint);

    // income arc (green)
    if (incomePercent > 0) {
      final paint = Paint()
        ..color = Colors.green
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      final sweepAngle = 2 * 3.14159265359 * incomePercent;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -3.14159265359 / 2,
        sweepAngle,
        false,
        paint,
      );
    }

    // expense arc (red)
    if (expensePercent > 0) {
      final paint = Paint()
        ..color = Colors.red
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      final sweepAngle = 2 * 3.14159265359 * expensePercent;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -3.14159265359 / 2 + 2 * 3.14159265359 * incomePercent,
        sweepAngle,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
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
              fontWeight: FontWeight.bold, fontSize: 14, color: color ?? Colors.teal[900]),
        ),
      ],
    );
  }
}
