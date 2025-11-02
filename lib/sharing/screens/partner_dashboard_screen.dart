// lib/sharing/screens/partner_dashboard_screen.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/ads/ads_banner_card.dart';
import '../../core/ads/ads_shell.dart';
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
      (widget.partner.status == 'active') && (permissions['tx'] == true);

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this); // Transactions + Chat
    _tabController.addListener(() {
      if (mounted) setState(() {}); // so the expand icon shows only on Chat tab
    });
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
      partnerName =
      (profileDoc.data()?['name'] as String?)?.trim().isNotEmpty == true
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

    // weekly aggregates (simple cap for ring fill)
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
      final d = doc.data();
      final amt = (d['amount'] as num? ?? 0).toDouble();
      credit += amt;
      count++;
      txs.add({
        'type': 'income',
        'amount': amt,
        'category': d['type'],
        'note': d['note'],
        'date': d['date'],
      });
    }
    for (final doc in expenseSnap.docs) {
      final d = doc.data();
      final amt = (d['amount'] as num? ?? 0).toDouble();
      debit += amt;
      count++;
      txs.add({
        'type': 'expense',
        'amount': amt,
        'category': d['type'],
        'note': d['note'],
        'date': d['date'],
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

  // ---------- Tx details bottom sheet ----------
  void _showTxDetails(Map<String, dynamic> tx) {
    final isIncome = (tx['type']?.toString() ?? '') == 'income';
    final amount = (tx['amount'] as num? ?? 0).toDouble();
    final category = (tx['category'] as String?)?.trim() ?? 'General';
    final note = (tx['note'] as String?)?.trim() ?? '';
    final ts = tx['date'] as Timestamp?;
    final d = ts?.toDate();
    final timeStr = d == null
        ? ''
        : "${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}";

    showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 4,
              width: 44,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _TxIconBubble(isIncome: isIncome),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    isIncome ? "Income" : "Expense",
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  "₹${amount.toStringAsFixed(0)}",
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: isIncome ? const Color(0xFF1DB954) : Colors.red[700],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerLeft,
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _chip(
                    text: isIncome ? "Income" : "Expense",
                    icon: isIncome
                        ? Icons.arrow_downward_rounded
                        : Icons.arrow_upward_rounded,
                    fg: isIncome ? const Color(0xFF1DB954) : Colors.red[700]!,
                    bg: (isIncome ? const Color(0xFF1DB954) : Colors.red[700]!)
                        .withOpacity(.10),
                  ),
                  _chip(
                    text: category,
                    icon: Icons.category_rounded,
                    fg: Colors.indigo.shade900,
                    bg: Colors.indigo.withOpacity(.08),
                  ),
                  if (timeStr.isNotEmpty)
                    _chip(
                      text: timeStr,
                      icon: Icons.schedule_rounded,
                      fg: Colors.grey.shade900,
                      bg: Colors.grey.withOpacity(.12),
                    ),
                ],
              ),
            ),
            if (note.isNotEmpty) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  note,
                  style: const TextStyle(fontSize: 14.5),
                  textAlign: TextAlign.left,
                ),
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ---------- Full-screen Chat ----------
  void _openFullScreenChat() {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _PartnerChatFullScreen(
          partnerName: partnerName.isNotEmpty ? partnerName : "Partner",
          partnerUserId: widget.partner.partnerId,
          currentUserId: widget.currentUserId,
          partnerAvatar: partnerAvatar,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = context.adsBottomPadding();
    final avatar = (partnerAvatar != null && partnerAvatar!.isNotEmpty)
        ? partnerAvatar!
        : "assets/images/profile_default.png";
    String dateStr = "${selectedDay.day}/${selectedDay.month}/${selectedDay.year}";
    final bool isChatTab = _tabController.index == 1;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Partner"),
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          // Show expand icon ONLY on Chat tab
          if (isChatTab)
            IconButton(
              tooltip: 'Open chat full screen',
              icon: const Icon(Icons.open_in_full_rounded),
              onPressed: _openFullScreenChat,
            ),
        ],
      ),
      // Rings untouched per your request
      body: ListView(
        padding: EdgeInsets.fromLTRB(0, 0, 0, safeBottom + 16),
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

                  // Ring (unchanged)
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
          const AdsBannerCard(
            placement: 'partner_dashboard_summary',
            inline: true,
            inlineMaxHeight: 120,
            margin: EdgeInsets.fromLTRB(18, 16, 18, 4),
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            minHeight: 92,
          ),

          // --- Last 8 Days Rings (unchanged) ---
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
            height: 360, // keep your compact area; full screen is a separate route now
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: TabBarView(
              controller: _tabController,
              children: [
                // ---------------- Transactions (Unified, tappable) ----------------
                if (!_canReadTx)
                  const Center(child: Text("You don't have permission to view transactions."))
                else if (selTxList.isEmpty)
                  const Center(child: Text("No transactions for this day"))
                else
                  ListView.separated(
                    padding: EdgeInsets.fromLTRB(4, 10, 4, safeBottom + 16),
                    itemCount: selTxList.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (ctx, i) {
                      final tx = selTxList[i];
                      final isIncome = (tx['type']?.toString() ?? '') == 'income';
                      final amount = (tx['amount'] as num? ?? 0).toDouble();
                      final category = (tx['category'] as String?)?.trim() ?? 'General';
                      final note = (tx['note'] as String?)?.trim() ?? '';
                      final ts = tx['date'] as Timestamp?;
                      final dt = ts?.toDate();
                      final time = dt == null
                          ? ''
                          : "${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}";

                      return _UnifiedTxTile(
                        isIncome: isIncome,
                        amount: amount,
                        category: category,
                        note: note,
                        time: time,
                        onTap: () => _showTxDetails(tx),
                      );
                    },
                  ),

                // ---------------- Chat (compact) ----------------
                SafeArea(
                  top: false,
                  bottom: false,
                  child: Padding(
                    padding: EdgeInsets.only(bottom: safeBottom),
                    child: PartnerChatTab(
                      partnerUserId: widget.partner.partnerId,
                      currentUserId: widget.currentUserId,
                    ),
                  ),
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

  Widget _chip({
    required String text,
    required IconData icon,
    required Color fg,
    required Color bg,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
        ],
      ),
    );
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

// ---------------- Unified Transaction Tile (tappable & glossy) ----------------

class _UnifiedTxTile extends StatelessWidget {
  final bool isIncome;
  final double amount;
  final String category;
  final String note;
  final String time;
  final VoidCallback? onTap;

  const _UnifiedTxTile({
    required this.isIncome,
    required this.amount,
    required this.category,
    required this.note,
    required this.time,
    this.onTap,
  });

  Color get _side => isIncome ? const Color(0xFF1DB954) : const Color(0xFFE53935);
  Color get _iconBg => isIncome ? const Color(0x221DB954) : const Color(0x22E53935);
  IconData get _icon => isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded;

  String _money(double v) => "₹${v.toStringAsFixed(0)}";

  @override
  Widget build(BuildContext context) {
    final textPrimary = Theme.of(context).textTheme.bodyLarge?.color ?? Colors.black87;
    final textMuted = Colors.black.withOpacity(.55);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Colors.white, Colors.white.withOpacity(.96)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.black.withOpacity(.05)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(.05),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              // Colored side bar
              Container(
                width: 6,
                height: 68,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [_side.withOpacity(.95), _side.withOpacity(.7)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(18),
                    bottomLeft: Radius.circular(18),
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Icon bubble
              Container(
                width: 44,
                height: 44,
                margin: const EdgeInsets.only(left: 2),
                decoration: BoxDecoration(
                  color: _iconBg,
                  shape: BoxShape.circle,
                ),
                child: Icon(_icon, color: _side),
              ),
              const SizedBox(width: 10),

              // Content
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Amount + time
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _money(amount),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 17.5,
                                fontWeight: FontWeight.w900,
                                color: isIncome ? _side : const Color(0xFFB71C1C),
                                letterSpacing: .2,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (time.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.grey.withOpacity(.14),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(time, style: TextStyle(fontSize: 11.5, color: textMuted)),
                            ),
                          const SizedBox(width: 10),
                          Icon(Icons.chevron_right_rounded, size: 18, color: Colors.grey[500]),
                          const SizedBox(width: 6),
                        ],
                      ),
                      const SizedBox(height: 5),

                      // Category • Note
                      Text(
                        note.isNotEmpty ? "$category  •  $note" : category,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TxIconBubble extends StatelessWidget {
  final bool isIncome;
  const _TxIconBubble({required this.isIncome});
  @override
  Widget build(BuildContext context) {
    final color = isIncome ? const Color(0xFF1DB954) : const Color(0xFFE53935);
    final bg = isIncome ? const Color(0x221DB954) : const Color(0x22E53935);
    final icon = isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded;
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Icon(icon, color: color),
    );
  }
}

// ---------------- Fullscreen chat route ----------------

class _PartnerChatFullScreen extends StatelessWidget {
  final String partnerName;
  final String partnerUserId;
  final String currentUserId;
  final String? partnerAvatar;

  const _PartnerChatFullScreen({
    Key? key,
    required this.partnerName,
    required this.partnerUserId,
    required this.currentUserId,
    this.partnerAvatar,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final avatar = (partnerAvatar != null && partnerAvatar!.isNotEmpty)
        ? partnerAvatar!
        : "assets/images/profile_default.png";
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundImage: avatar.startsWith('http')
                  ? NetworkImage(avatar)
                  : AssetImage(avatar) as ImageProvider,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                partnerName,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: PartnerChatTab(
          partnerUserId: partnerUserId,
          currentUserId: currentUserId,
        ),
      ),
    );
  }
}
