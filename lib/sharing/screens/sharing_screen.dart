import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:lifemap/core/ads/ads_banner_card.dart';

import '../models/partner_model.dart';
import '../services/partner_service.dart';
import '../widgets/sharing_hero_card.dart';
import '../screens/partner_dashboard_screen.dart';
import 'add_partner_dialog.dart';
import '../../widgets/animated_slide_fade.dart';
import '../../widgets/animated_mint_background.dart';
import '../utils/sharing_permissions.dart';

/// --- Edit Permissions dialog (phone-based & labeled) ---
Future<bool?> showEditPermissionsDialog(
    BuildContext context, {
      required String currentUserPhone,
      required PartnerModel partner,
    }) async {
  final Map<String, bool> permissions = {
    for (final k in SharingPermissions.allKeys()) k: false,
    ...partner.permissions,
  };

  final saved = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      return StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: Text('Edit Permissions — ${partner.partnerName}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: SharingPermissions
                  .allKeys()
                  .map((key) => CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(SharingPermissions.label(key)),
                value: permissions[key] ?? false,
                onChanged: (val) => setSt(() => permissions[key] = val ?? false),
              ))
                  .toList(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Save'),
            ),
          ],
        ),
      );
    },
  );

  if (saved == true) {
    // NOTE: Your code comments say partnerId is "phone-first id".
    // If you actually carry a separate phone field, pass that instead.
    await PartnerService().updatePartnerPermissions(
      currentUserPhone: currentUserPhone,
      partnerPhone: partner.partnerId,
      permissions: permissions,
    );
    return true;
  }
  return false;
}

Future<bool?> showConfirmRemoveDialog(BuildContext context, PartnerModel partner) {
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Remove Partner?'),
      content: Text('Are you sure you want to remove ${partner.partnerName}?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
      ],
    ),
  );
}

/// Relation emoji mapping — keys are lowercase for robust matching.
const Map<String, String> relationEmojis = {
  'partner': '❤️',
  'spouse': '💍',
  'brother': '👨‍👦',
  'child': '👶',
  'friend': '🤝',
  'other': '🌟',
};

class SharingScreen extends StatefulWidget {
  final String currentUserPhone; // phone-based doc id
  const SharingScreen({Key? key, required this.currentUserPhone}) : super(key: key);

  @override
  State<SharingScreen> createState() => _SharingScreenState();
}

class _SharingScreenState extends State<SharingScreen> {
  late Future<List<PartnerModel>> _partnersFuture;

  String? userName;
  String? userAvatar;
  int _todayTxCount = 0;
  double _todayTxAmount = 0.0;
  double _todayCredit = 0.0;
  double _todayDebit = 0.0;

  PartnerModel? _selectedPartner; // For edit/delete buttons

  @override
  void initState() {
    super.initState();
    _refreshAll();
  }

  void _refreshAll() {
    setState(() {
      _partnersFuture = PartnerService().fetchSharedPartnersWithStats(widget.currentUserPhone);
      _selectedPartner = null;
    });
    _fetchMyProfileAndTodayStats();
  }

  Future<void> _fetchMyProfileAndTodayStats() async {
    // My profile
    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(widget.currentUserPhone)
        .get();

    final data = userDoc.data() ?? {};
    setState(() {
      final n = (data['name'] as String?)?.trim();
      userName = (n != null && n.isNotEmpty) ? n : 'You';
      final avatar = (data['avatar'] as String?)?.trim() ?? '';
      userAvatar = avatar.isNotEmpty ? avatar : 'assets/images/profile_default.png';
    });

    // Today's stats
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day);

    final incomesSnap = await FirebaseFirestore.instance
        .collection('users')
        .doc(widget.currentUserPhone)
        .collection('incomes')
        .where('date', isGreaterThanOrEqualTo: start)
        .get();

    final expensesSnap = await FirebaseFirestore.instance
        .collection('users')
        .doc(widget.currentUserPhone)
        .collection('expenses')
        .where('date', isGreaterThanOrEqualTo: start)
        .get();

    double credit = 0.0, debit = 0.0;
    int count = 0;

    for (final doc in incomesSnap.docs) {
      credit += (doc.data()['amount'] as num? ?? 0).toDouble();
      count++;
    }
    for (final doc in expensesSnap.docs) {
      debit += (doc.data()['amount'] as num? ?? 0).toDouble();
      count++;
    }

    if (!mounted) return;
    setState(() {
      _todayTxCount = count;
      _todayTxAmount = credit + debit;
      _todayCredit = credit;
      _todayDebit = debit;
    });
  }

  Future<void> _showAddPartnerDialog() async {
    final refresh = await showDialog(
      context: context,
      // Keep prop name as-is to avoid breaking your existing dialog API.
      builder: (ctx) => AddPartnerDialog(currentUserId: widget.currentUserPhone),
    );
    if (refresh == true) {
      _refreshAll();
    }
  }

  Future<void> _onEditPermissions() async {
    if (_selectedPartner == null) return;
    final saved = await showEditPermissionsDialog(
      context,
      currentUserPhone: widget.currentUserPhone,
      partner: _selectedPartner!,
    );
    if (saved == true) {
      _refreshAll();
    }
  }

  Future<void> _onRemovePartner() async {
    if (_selectedPartner == null) return;
    final confirm = await showConfirmRemoveDialog(context, _selectedPartner!);
    if (confirm == true) {
      await PartnerService().removePartner(
        currentUserPhone: widget.currentUserPhone,
        partnerPhone: _selectedPartner!.partnerId,
      );
      _refreshAll();
    }
  }

  Widget _buildPartnerCard(PartnerModel partner, int index) {
    final relationKey = (partner.relation ?? 'other').toLowerCase().trim();
    final relationEmoji = relationEmojis[relationKey] ?? '🌟';

    return AnimatedSlideFade(
      delayMilliseconds: 170 + 60 * index,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 14, 10, 18),
        child: SharingHeroCard(
          userName: "$relationEmoji ${partner.partnerName}",
          avatar: partner.avatar?.trim().isNotEmpty == true ? partner.avatar : null,
          credit: partner.todayCredit ?? 0.0,
          debit: partner.todayDebit ?? 0.0,
          txCount: partner.todayTxCount ?? 0,
          txAmount: partner.todayTxAmount ?? 0.0,
          isMe: false,
          cardScale: 1.1,
          glossy: true,
          onTap: () {
            setState(() => _selectedPartner = partner);
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => PartnerDashboardScreen(
                  partner: partner,
                  // PartnerDashboardScreen expects `currentUserId`
                  currentUserId: widget.currentUserPhone,
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildPartnerAd(int batchIndex) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 18),
      child: AdsBannerCard(
        placement: 'sharing_partner_batch_$batchIndex',
        inline: true,
        inlineMaxHeight: 110,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        minHeight: 88,
      ),
    );
  }

  Widget _buildHeaderAd() {
    return const AdsBannerCard(
      placement: 'sharing_screen_header',
      inline: true,
      inlineMaxHeight: 120,
      margin: EdgeInsets.fromLTRB(14, 0, 14, 18),
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      minHeight: 92,
    );
  }

  // ---- Incoming (to me) requests ----
  Widget _buildIncomingPendingSection() {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: PartnerService().streamIncomingPending(widget.currentUserPhone),
      builder: (context, snap) {
        if (!snap.hasData || snap.data!.docs.isEmpty) return const SizedBox.shrink();

        final items = snap.data!.docs;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 6),
              child: Text(
                "Incoming Requests",
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: Colors.green[700],
                ),
              ),
            ),
            ...items.map((doc) {
              final data = doc.data();
              final fromPhone = (data['fromUserPhone'] ?? '').toString();
              final relation = (data['relation'] ?? '').toString();
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.person)),
                  title: Text(fromPhone, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(relation.isNotEmpty ? "Relation: $relation" : "Pending"),
                  trailing: Wrap(
                    spacing: 8,
                    children: [
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                        onPressed: () async {
                          await PartnerService().approveRequest(
                            requestId: doc.id,
                            approverPhone: widget.currentUserPhone,
                          );
                          _refreshAll();
                        },
                        child: const Text('Approve'),
                      ),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                        ),
                        onPressed: () async {
                          await PartnerService().rejectRequest(
                            requestId: doc.id,
                            approverPhone: widget.currentUserPhone,
                          );
                        },
                        child: const Text('Reject'),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        );
      },
    );
  }

  // ---- Sent (by me) requests ----
  Widget _buildSentPendingSection() {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: PartnerService().streamSentPending(widget.currentUserPhone),
      builder: (context, snap) {
        if (!snap.hasData || snap.data!.docs.isEmpty) return const SizedBox.shrink();

        final items = snap.data!.docs;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
              child: Text(
                "Sent Requests",
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: Colors.orange[800],
                ),
              ),
            ),
            ...items.map((doc) {
              final data = doc.data();
              final toPhone = (data['toUserPhone'] ?? '').toString();
              final relation = (data['relation'] ?? '').toString();
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.schedule)),
                  title: Text(toPhone, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(relation.isNotEmpty ? "Relation: $relation" : "Pending"),
                  trailing: OutlinedButton(
                    onPressed: () async {
                      await PartnerService().cancelRequest(
                        requestId: doc.id,
                        senderPhone: widget.currentUserPhone,
                      );
                    },
                    child: const Text('Cancel'),
                  ),
                ),
              );
            }),
          ],
        );
      },
    );
  }

  Widget _buildMyCard() {
    return AnimatedSlideFade(
      delayMilliseconds: 60,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 35, 10, 18),
        child: SharingHeroCard(
          userName: userName ?? "You",
          avatar: userAvatar,
          credit: _todayCredit,
          debit: _todayDebit,
          txCount: _todayTxCount,
          txAmount: _todayTxAmount,
          isMe: true,
          cardScale: 1.1,
          glossy: true,
          onTap: () {
            // Optional: open your own dashboard
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selectedPartner != null;

    return Stack(
      children: [
        const AnimatedMintBackground(),
        Scaffold(
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            backgroundColor: Colors.white.withOpacity(0.93),
            elevation: 0,
            title: const Text(
              'Sharing',
              style: TextStyle(
                color: Color(0xFF09857a),
                fontWeight: FontWeight.bold,
                fontSize: 22,
                letterSpacing: 0.6,
              ),
            ),
            actions: [
              IconButton(
                icon: Icon(Icons.settings,
                    color: selected ? const Color(0xFF09857a) : Colors.grey),
                tooltip: 'Edit Permissions',
                onPressed: selected ? _onEditPermissions : null,
              ),
              IconButton(
                icon: Icon(Icons.delete_forever,
                    color: selected ? Colors.red[700] : Colors.grey),
                tooltip: 'Remove Partner',
                onPressed: selected ? _onRemovePartner : null,
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton(
            heroTag: "add-partner-fab",
            backgroundColor: const Color(0xFF09857a),
            elevation: 13,
            onPressed: _showAddPartnerDialog,
            child: const Icon(Icons.person_add, size: 28, color: Colors.white),
          ),
          body: Column(
            children: [
              Expanded(
                child: FutureBuilder<List<PartnerModel>>(
                  future: _partnersFuture,
                  builder: (context, snapshot) {
                    final partnerCards = <Widget>[];

                    // 1) My Card
                    partnerCards.add(_buildMyCard());

                    // Header ad placement (always visible when ads enabled)
                    partnerCards.add(_buildHeaderAd());

                    // 2) Incoming + Sent requests (from partner_requests)
                    partnerCards.add(_buildIncomingPendingSection());
                    partnerCards.add(_buildSentPendingSection());

                    // 3) Active partners
                    if (snapshot.hasData && snapshot.data!.isNotEmpty) {
                      int i = 0;
                      for (final partner
                          in snapshot.data!.where((p) => p.status == 'active')) {
                        partnerCards.add(_buildPartnerCard(partner, i));
                        i++;
                        if (i % 2 == 0) {
                          partnerCards.add(_buildPartnerAd(i ~/ 2));
                        }
                      }
                    } else if (snapshot.connectionState == ConnectionState.done &&
                        (snapshot.data == null || snapshot.data!.isEmpty)) {
                      partnerCards.add(
                        AnimatedSlideFade(
                          delayMilliseconds: 280,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 60),
                            child: Center(
                              child: Text(
                                "No partners added yet.\nTap '+' to add your first partner.",
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 18, color: Colors.grey[600]),
                              ),
                            ),
                          ),
                        ),
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: () async {
                        _refreshAll();
                      },
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        children: partnerCards,
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
