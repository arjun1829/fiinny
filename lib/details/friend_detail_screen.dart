// lib/details/friend_detail_screen.dart
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:characters/characters.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:firebase_storage/firebase_storage.dart' as fb_storage;
import 'package:intl/intl.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/screens/subs_bills/widgets/brand_avatar_registry.dart';

import 'recurring/friend_recurring_screen.dart';
import 'recurring/add_choice_sheet.dart';
import 'recurring/add_recurring_basic_screen.dart';
import 'recurring/add_subscription_screen.dart';
import 'recurring/add_emi_link_sheet.dart';
import 'recurring/add_custom_reminder_sheet.dart';
import 'models/shared_item.dart';
import 'models/recurring_scope.dart';
import 'services/recurring_service.dart';

import '../models/friend_model.dart';
import '../models/expense_item.dart';
import '../models/group_model.dart';
import '../models/loan_model.dart';
import '../services/expense_service.dart';
import '../services/group_service.dart';
import '../core/flags/fx_flags.dart';
import '../services/loan_service.dart';
import '../core/ads/ads_shell.dart';
import '../screens/edit_expense_screen.dart';
import '../services/notification_service.dart';
import '../services/push/push_service.dart';

import '../widgets/add_friend_expense_dialog.dart';
import '../widgets/settleup_dialog.dart';
import '../widgets/expense_list_widget.dart';
import '../settleup_v2/index.dart';
import 'analytics/friend_analytics_tab.dart';
import 'dart:math' as math;

import '../widgets/ads/sleek_ad_card.dart';
import '../ui/comp/glass_card.dart' as detail;
import '../ui/comp/pill_chip.dart';
import '../ui/fx/motion.dart';
import '../ui/typography/amount_text.dart';
import '../widgets/charts/category_legend_row.dart';
import '../widgets/charts/pie_touch_chart.dart';
import '../widgets/unified_transaction_list.dart';

// Chat tab
import 'package:lifemap/sharing/widgets/partner_chat_tab.dart';

// Shared split logic
import '../group/group_balance_math.dart' show computeSplits;
import '../group/ledger_math.dart' as ledger;

class FriendDetailScreen extends StatefulWidget {
  final String userPhone; // current user
  final String userName;
  final String? userAvatar;
  final FriendModel friend;

  const FriendDetailScreen({
    Key? key,
    required this.userPhone,
    required this.userName,
    this.userAvatar,
    required this.friend,
  }) : super(key: key);

  @override
  State<FriendDetailScreen> createState() => _FriendDetailScreenState();
}

class _FriendDetailScreenState extends State<FriendDetailScreen>
    with SingleTickerProviderStateMixin {
  // Keep tab indices centralized so adding/removing tabs doesn’t break deep-links
  static const int _TAB_HISTORY = 0;
  static const int _TAB_CHART = 1;
  static const int _TAB_ANALYTICS = 2;
  static const int _TAB_CHAT = 3;

  Map<String, double>? _lastCustomSplit;
  late TabController _tabController;
  bool _breakdownExpanded = false;

  PieSlice? _selectedCategorySlice;
  final GlobalKey _chartListAnchorKey = GlobalKey();

  String? _friendAvatarUrl;
  String? _friendDisplayName;

  final RecurringService _recurringSvc = RecurringService();
  final NumberFormat _compactInr =
  NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  final DateFormat _dueFormat = DateFormat('d MMM');

  String _fmtShort(DateTime dt) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${dt.day} ${months[dt.month - 1]}';
  }

  String _formatDue(DateTime? due) {
    if (due == null) return 'Due —';
    return 'Due ${_dueFormat.format(due)}';
  }

  String _formatShareSummary(SharedItem item) {
    final total = (item.rule.amount ?? item.amount)?.toDouble();
    final share = item.amountShareForUser(widget.userPhone);
    if (share == null) {
      return 'Your share · -- · —';
    }
    final safeShare = share <= 0 ? 0 : share;
    final pct = total == null || total <= 0
        ? '--'
        : _formatPercent((safeShare / total) * 100);
    final amtLabel = safeShare <= 0 ? '₹0' : _compactInr.format(safeShare);
    return 'Your share · $pct · $amtLabel';
  }

  String _formatPercent(double value) {
    if (value.isNaN) return '--';
    if (value >= 100) return '100%';
    if (value >= 10) return '${value.round()}%';
    if (value <= 0) return '0%';
    return '${value.toStringAsFixed(1)}%';
  }

  void _onSliceSelected(PieSlice? slice) {
    setState(() => _selectedCategorySlice = slice);
    if (slice != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _chartListAnchorKey.currentContext;
        if (ctx != null) {
          Scrollable.ensureVisible(
            ctx,
            duration: kMed,
            curve: kEase,
            alignment: 0.1,
          );
        }
      });
    }
  }


  String _nameFor(String phone) => phone == widget.userPhone ? 'You' : _displayName;

  FriendModel get _selfFriendModel => FriendModel(
        phone: widget.userPhone,
        name: widget.userName,
        avatar: widget.userAvatar ?? '👤',
      );

  String _categoryLabelForExpense(ExpenseItem expense) {
    if (expense.category != null && expense.category!.trim().isNotEmpty) {
      return expense.category!.trim();
    }
    if (expense.label != null && expense.label!.trim().isNotEmpty) {
      return expense.label!.trim();
    }
    if (expense.type != null && expense.type!.trim().isNotEmpty) {
      return expense.type!.trim();
    }
    return 'General';
  }

  // ===== Attachments helpers =====
  // Try to read attachments from common fields without changing your model.
  // If your model has a known field (e.g. attachmentUrls), use that directly.
  // ===== Super-robust attachments extractor =====
  List<String> _attachmentsOf(ExpenseItem e) {
    final out = <String>{};

    void addOne(dynamic v) {
      if (v is String && v.trim().isNotEmpty) {
        out.add(v.trim());
      } else if (v is Map) {
        // common keys in map item
        for (final k in ['url','downloadURL','downloadUrl','href','link','gsUrl','path']) {
          final s = v[k];
          if (s is String && s.trim().isNotEmpty) out.add(s.trim());
        }
        // sometimes maps nested like {'file': {'url': ...}}
        for (final v2 in v.values) {
          if (v2 is String && v2.trim().isNotEmpty) out.add(v2.trim());
          if (v2 is Map) {
            for (final k in ['url','downloadURL','downloadUrl','href','link','gsUrl','path']) {
              final s = v2[k];
              if (s is String && s.trim().isNotEmpty) out.add(s.trim());
            }
          }
        }
      }
    }

    void addList(dynamic list) {
      if (list is List) {
        for (final x in list) addOne(x);
      } else if (list is Map) {
        // Map<String, String> ya Map<id, url>
        for (final v in list.values) addOne(v);
      } else {
        addOne(list);
      }
    }

    // 1) Typical list fields
    try { addList((e as dynamic).attachmentUrls); } catch (_) {}
    try { addList((e as dynamic).receiptUrls); }   catch (_) {}
    try { addList((e as dynamic).attachments); }   catch (_) {}
    try { addList((e as dynamic).receipts); }      catch (_) {}
    try { addList((e as dynamic).files); }         catch (_) {}
    try { addList((e as dynamic).images); }        catch (_) {}
    try { addList((e as dynamic).photos); }        catch (_) {}

    // 2) Single string fields
    try { addOne((e as dynamic).attachmentUrl); } catch (_) {}
    try { addOne((e as dynamic).receiptUrl);    } catch (_) {}
    try { addOne((e as dynamic).fileUrl);       } catch (_) {}
    try { addOne((e as dynamic).imageUrl);      } catch (_) {}
    try { addOne((e as dynamic).photoUrl);      } catch (_) {}

    // 3) from toJson() map (Firestore snapshot → model me reh gaya ho)
    try {
      final m = (e as dynamic).toJson?.call();
      if (m is Map) {
        for (final k in [
          'attachmentUrls','attachments','receiptUrls','receipts','files','images','photos',
          'attachmentsMap','filesMap'
        ]) {
          addList(m[k]);
        }
        for (final k in [
          'attachmentUrl','receiptUrl','fileUrl','imageUrl','photoUrl'
        ]) {
          addOne(m[k]);
        }
      }
    } catch (_) {}

    // 4) URLs embedded in note text
    try {
      final note = (e as dynamic).note;
      if (note is String && note.isNotEmpty) {
        final rx = RegExp(r'(https?|gs):\/\/[^\s)]+', caseSensitive: false);
        for (final m in rx.allMatches(note)) {
          out.add(m.group(0)!.trim());
        }
      }
    } catch (_) {}

    return out.where((u) => u.isNotEmpty).toList();
  }


  bool _isImageUrl(String u) {
    final s = u.toLowerCase();
    return s.endsWith('.jpg') ||
        s.endsWith('.jpeg') ||
        s.endsWith('.png') ||
        s.endsWith('.webp') ||
        s.endsWith('.gif');
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadFriendProfile();
  }

  void _goDiscussExpense(ExpenseItem e) {
    final title = (e.label?.isNotEmpty == true)
        ? e.label!
        : ((e.category?.isNotEmpty == true) ? e.category! : 'Expense');
    final msg = "Discussing: $title • ₹${e.amount.toStringAsFixed(0)} • ${_fmtShort(e.date)}";
    _tabController.animateTo(_TAB_CHAT); // Chat tab
    Clipboard.setData(ClipboardData(text: msg));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Context copied — paste in chat')),
    );
  }

  void _openRecurringFullScreen() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FriendRecurringScreen(
          userPhone: widget.userPhone,
          friendId: widget.friend.phone,
          friendName: _displayName,
        ),
      ),
    );
  }

  Future<void> _openRecurringAddSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetCtx) => AddChoiceSheet(
        onPick: (key) {
          Navigator.pop(sheetCtx);
          Future.microtask(() => _routeRecurringChoice(key));
        },
      ),
    );
  }

  Future<void> _routeRecurringChoice(String key) async {
    final scope = RecurringScope.friend(widget.userPhone, widget.friend.phone);
    dynamic res;
    switch (key) {
      case 'recurring':
        res = await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AddRecurringBasicScreen(
              userPhone: widget.userPhone,
              scope: scope,
            ),
          ),
        );
        break;
      case 'subscription':
        res = await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AddSubscriptionScreen(
              userPhone: widget.userPhone,
              scope: scope,
            ),
          ),
        );
        break;
      case 'emi':
        res = await showModalBottomSheet(
          context: context,
          useSafeArea: true,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (_) => AddEmiLinkSheet(
            scope: scope,
            currentUserId: widget.userPhone,
          ),
        );
        break;
      case 'custom':
        res = await showModalBottomSheet(
          context: context,
          useSafeArea: true,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (_) => AddCustomReminderSheet(
            userPhone: widget.userPhone,
            scope: scope,
          ),
        );
        break;
    }
    await _handleRecurringAddResult(res);
  }

  Future<void> _handleRecurringAddResult(dynamic res) async {
    if (res == null) return;

    bool changed = false;

    if (res is String) {
      try {
        final LoanModel? loan = await LoanService().getById(res);
        if (loan != null) {
          await _recurringSvc.attachLoanToFriend(
            userPhone: widget.userPhone,
            friendId: widget.friend.phone,
            loan: loan,
          );
          changed = true;
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Couldn't link loan: $e")),
          );
        }
      }
    } else if (res is SharedItem || res == true) {
      changed = true;
    }

    if (!mounted) return;
    if (changed) {
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved!')),
      );
    }
  }

  Widget _buildRecurringPeekCard() {
    return _card(
      context,
      child: StreamBuilder<List<SharedItem>>(
        stream: _recurringSvc.streamByFriend(
          widget.userPhone,
          widget.friend.phone,
        ),
        builder: (context, snapshot) {
          final loading = snapshot.connectionState == ConnectionState.waiting &&
              (snapshot.data == null || snapshot.data!.isEmpty);
          final items = snapshot.data ?? const <SharedItem>[];
          final top = items.take(3).toList();

          final children = <Widget>[
            InkWell(
              onTap: _openRecurringFullScreen,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Container(
                      height: 40,
                      width: 40,
                      decoration: BoxDecoration(
                        color: AppColors.mint.withOpacity(.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.repeat_rounded,
                          color: AppColors.mint),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'Recurring',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _openRecurringFullScreen,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        foregroundColor: AppColors.mint,
                      ),
                      child: const Text('View all >',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ];

          if (loading) {
            children.add(
              SizedBox(
                height: 60,
                child: Center(
                  child: SizedBox(
                    width: 22,
                    height: 22,
                    child: const CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(AppColors.mint),
                    ),
                  ),
                ),
              ),
            );
          } else if (items.isEmpty) {
            children.add(
              Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(.08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      height: 36,
                      width: 36,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.hourglass_empty,
                          color: Colors.black54),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'No shared recurring items yet. Start one to split bills effortlessly.',
                        style: TextStyle(
                          color: Colors.black.withOpacity(0.65),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          } else {
            for (int i = 0; i < top.length; i++) {
              if (i > 0) {
                children.add(
                  Divider(
                    height: 1,
                    thickness: 1,
                    color: Colors.black.withOpacity(0.05),
                  ),
                );
              }
              children.add(_recurringPeekRow(top[i]));
            }
            if (items.length > top.length) {
              final remaining = items.length - top.length;
              children.add(const SizedBox(height: 8));
              children.add(
                Text(
                  '+$remaining more shared item${remaining == 1 ? '' : 's'}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.black.withOpacity(0.6),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              );
            }
          }

          children.add(const SizedBox(height: 12));
          children.add(
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _openRecurringAddSheet,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: AppColors.mint,
                ),
                icon: const Icon(Icons.add_circle_outline, size: 18),
                label: const Text('Add recurring',
                    style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: children,
          );
        },
      ),
    );
  }

  Widget _recurringPeekRow(SharedItem item) {
    final title = item.safeTitle;
    final brandKey = (item.provider?.isNotEmpty == true)
        ? item.provider!
        : title;
    final asset = BrandAvatarRegistry.assetFor(brandKey);
    final share = item.amountShareForUser(widget.userPhone);
    final due = item.nextDueAt;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final isOverdue =
        due != null && DateTime(due.year, due.month, due.day).isBefore(today);
    Widget? statusChip;
    if (isOverdue) {
      statusChip = const _StatusChip('Overdue', AppColors.bad);
    }
    Widget? shareChip;
    if (share != null) {
      final safeShare = share <= 0 ? 0 : share;
      shareChip = _Pill(
        safeShare <= 0 ? '₹0' : _compactInr.format(safeShare),
        base: AppColors.mint,
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: SizedBox(
        height: 60,
        child: Row(
          children: [
            BrandAvatar(
              assetPath: asset,
              label: brandKey,
              size: 44,
              radius: 12,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _formatShareSummary(item),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.black.withOpacity(0.65),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (shareChip != null) ...[
                  shareChip!,
                  const SizedBox(height: 6),
                ],
                if (statusChip != null) ...[
                  statusChip!,
                  const SizedBox(height: 6),
                ],
                Text(
                  _formatDue(due),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.black.withOpacity(0.55),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  double _yourImpact(ExpenseItem e) {
    final splits = computeSplits(e);
    if (widget.userPhone == e.payerId) {
      double others = 0;
      splits.forEach((k, v) {
        if (k != e.payerId) others += v;
      });
      return others; // they owe you
    }
    final yourShare = splits[widget.userPhone] ?? 0;
    return -yourShare; // you owe
  }

  // ======================= DETAILS SHEET (BIG) =======================
  void _showExpenseDetailsFriend(BuildContext context, ExpenseItem e) {
    final cs = Theme.of(context).colorScheme;
    final splits = computeSplits(e);

    final title = (e.label?.isNotEmpty == true)
        ? e.label!
        : ((e.category?.isNotEmpty == true) ? e.category! : 'Expense');

    // keep note as plain text only
    final cleanNote = e.note.trim();

    final youDelta = _yourImpact(e); // + => owed to you, - => you owe
    final detailFiles = _attachmentsOf(e);

    showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        final h = MediaQuery.of(ctx).size.height * 0.92;
        return SizedBox(
          height: h,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              children: [
                // grabber
                Container(
                  height: 4,
                  width: 44,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(3)),
                ),

                // header
                Row(
                  children: [
                    const Icon(Icons.receipt_long_rounded),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      "₹${e.amount.toStringAsFixed(2)}",
                      style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: cs.primary),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // avatars row
                _participantsHeader(e),
                const SizedBox(height: 12),

                // meta chips
                Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _chip(
                        text: "Paid by ${_nameFor(e.payerId)}",
                        fg: Colors.teal.shade900,
                        bg: Colors.teal.withOpacity(.10),
                        icon: Icons.person,
                      ),
                      _chip(
                        text:
                        "${_fmtShort(e.date)} ${e.date.year} ${e.date.hour.toString().padLeft(2, '0')}:${e.date.minute.toString().padLeft(2, '0')}",
                        fg: Colors.grey.shade900,
                        bg: Colors.grey.withOpacity(.12),
                        icon: Icons.calendar_month_rounded,
                      ),
                      if ((e.category ?? '').isNotEmpty)
                        _chip(
                          text: e.category!,
                          fg: Colors.indigo.shade900,
                          bg: Colors.indigo.withOpacity(.08),
                          icon: Icons.category_rounded,
                        ),
                      if ((e.groupId ?? '').isNotEmpty)
                        _chip(
                          text: "Group expense",
                          fg: Colors.blueGrey.shade900,
                          bg: Colors.blueGrey.withOpacity(.10),
                          icon: Icons.groups_rounded,
                        ),
                      _chip(
                        text: youDelta >= 0
                            ? "Owed to you ₹${youDelta.toStringAsFixed(0)}"
                            : "You owe ₹${youDelta.abs().toStringAsFixed(0)}",
                        fg: youDelta >= 0
                            ? Colors.green.shade800
                            : Colors.redAccent,
                        bg: youDelta >= 0
                            ? Colors.green.withOpacity(.10)
                            : Colors.red.withOpacity(.08),
                        icon: youDelta >= 0
                            ? Icons.trending_up_rounded
                            : Icons.trending_down_rounded,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 10),

                // scrollable content
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      children: [
                        if (cleanNote.isNotEmpty)
                          _section(
                            title: "Note",
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: Text(cleanNote),
                            ),
                          ),

                        // ===== Attachments in details sheet =====
                        // ===== Attachments in details sheet =====
                        if (detailFiles.isNotEmpty)
                          _section(
                            title: "Attachments",
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: detailFiles.map((url) {
                                final isImg = _isImageUrl(url);
                                return GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => _openAttachment(url),
                                  child: isImg
                                      ? ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: SizedBox(
                                      height: 88,
                                      width: 88,
                                      child: Image.network(url, fit: BoxFit.cover),
                                    ),
                                  )
                                      : Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.blueGrey.withOpacity(0.10),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: const [
                                        Icon(Icons.attach_file, size: 14, color: Colors.blueGrey),
                                        SizedBox(width: 4),
                                        Text(
                                          "File",
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                            color: Colors.blueGrey,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );

                              }).toList(),
                            ),
                          ),


                        _section(
                          title: "Split",
                          child: Column(
                            children: [
                              ...splits.entries
                                  .where((s) =>
                              s.key == widget.userPhone ||
                                  s.key == widget.friend.phone)
                                  .map((s) {
                                final isYou = s.key == widget.userPhone;
                                final owes =
                                    s.key != e.payerId; // payer "paid", others "owe"
                                final who = isYou ? "You" : _displayName;
                                final subtitle = owes
                                    ? (isYou ? "You owe" : "Owes")
                                    : (isYou ? "You paid" : "Paid");
                                final amtColor =
                                owes ? cs.error : Colors.green.shade700;
                                final avatar = isYou
                                    ? widget.userAvatar
                                    : (_friendAvatarUrl ?? widget.friend.avatar);

                                return ListTile(
                                  dense: true,
                                  contentPadding: EdgeInsets.zero,
                                  leading: CircleAvatar(
                                    backgroundColor: Colors.grey.shade200,
                                    backgroundImage: (avatar != null &&
                                        avatar.trim().startsWith('http'))
                                        ? NetworkImage(avatar.trim())
                                        : null,
                                    child: (avatar == null ||
                                        !avatar.trim().startsWith('http'))
                                        ? Text(who.characters.first.toUpperCase())
                                        : null,
                                  ),
                                  title: Text(who,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600)),
                                  subtitle: Text(
                                      "$subtitle ₹${s.value.toStringAsFixed(2)}"),
                                  trailing: Text(
                                    "₹${s.value.toStringAsFixed(2)}",
                                    style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: amtColor),
                                  ),
                                );
                              }),
                            ],
                          ),
                        ),

                        const SizedBox(height: 6),
                      ],
                    ),
                  ),
                ),

                // actions
                Row(
                  children: [
                    OutlinedButton.icon(
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: const Text('Discuss'),
                      onPressed: () {
                        Navigator.pop(context);
                        _goDiscussExpense(e);
                      },
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.edit),
                      label: const Text('Edit'),
                      onPressed: () {
                        Navigator.pop(context);
                        Future.delayed(
                          Duration.zero,
                              () => _editEntry(e),
                        );
                      },
                    ),
                    const SizedBox(width: 8),
                    TextButton.icon(
                      icon: const Icon(Icons.delete_outline,
                          color: Colors.redAccent),
                      label: const Text('Delete',
                          style: TextStyle(color: Colors.redAccent)),
                      onPressed: () {
                        Navigator.pop(context);
                        _deleteEntry(e);
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
  Future<void> _openAttachment(String url) async {
    var u = url.trim();

    // A) Firebase Storage: gs:// → https
    try {
      if (u.startsWith('gs://')) {
        final ref = fb_storage.FirebaseStorage.instance.refFromURL(u);
        u = await ref.getDownloadURL();
      }
    } catch (_) {}

    // B) Plain storage path (e.g. "receipts/uid/file.jpg")
    try {
      if (!u.startsWith('http') && !u.startsWith('gs://') && !u.contains('://')) {
        final ref = fb_storage.FirebaseStorage.instance.ref(u);
        u = await ref.getDownloadURL();
      }
    } catch (_) {}

    final uri = Uri.tryParse(u);
    if (uri == null || (uri.scheme != 'http' && uri.scheme != 'https')) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No attachment found for this entry')),
      );
      return;
    }

    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Couldn’t open attachment')),
      );
    }
  }




  // ======================= PROFILE / REFRESH =======================
  Future<void> _loadFriendProfile() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.friend.phone)
          .get();
      if (!mounted) return;
      if (doc.exists) {
        final data = doc.data();
        if (data != null) {
          setState(() {
            _friendAvatarUrl = (data['avatar'] as String?)?.trim();
            final n = (data['name'] as String?)?.trim();
            if (n != null && n.isNotEmpty) _friendDisplayName = n;
          });
        }
      }
    } catch (_) {/* fallback to FriendModel */}
  }

  Future<void> _handleEditFriend() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit display name'),
                onTap: () => Navigator.pop(ctx, 'edit'),
              ),
              ListTile(
                leading: const Icon(Icons.travel_explore_outlined),
                title: const Text('Search web'),
                onTap: () => Navigator.pop(ctx, 'search'),
              ),
              ListTile(
                leading: const Icon(Icons.copy_outlined),
                title: const Text('Copy phone number'),
                onTap: () => Navigator.pop(ctx, 'copy'),
              ),
              const SizedBox(height: 4),
            ],
          ),
        );
      },
    );

    switch (action) {
      case 'edit':
        final controller = TextEditingController(text: _displayName);
        final name = await showDialog<String>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Edit Name'),
            content: TextField(controller: controller, autofocus: true),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, controller.text.trim()),
                child: const Text('Save'),
              ),
            ],
          ),
        );
        if (name != null && name.isNotEmpty) {
          setState(() => _friendDisplayName = name);
        }
        break;
      case 'search':
        final query = _displayName.trim().isNotEmpty ? _displayName.trim() : widget.friend.phone;
        final searchUrl = Uri.parse('https://www.google.com/search?q=${Uri.encodeComponent(query)}');
        if (!await launchUrl(searchUrl, mode: LaunchMode.externalApplication)) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not open search')),
          );
        }
        break;
      case 'copy':
        await Clipboard.setData(ClipboardData(text: widget.friend.phone));
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Phone number copied')),
        );
        break;
      default:
        break;
    }
  }

  Future<void> _refreshAll() async {
    await _loadFriendProfile();
    if (mounted) setState(() {});
  }

  // ======================= UI HELPERS =======================
  BoxDecoration _cardDeco(BuildContext context) {
    return BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      boxShadow: [
        BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 16,
            offset: const Offset(0, 8))
      ],
      border: Border.all(color: Colors.grey.shade200),
    );
  }

  Widget _card(BuildContext context,
      {required Widget child, EdgeInsets? padding}) {
    return Container(
      decoration: _cardDeco(context),
      child: Padding(padding: padding ?? const EdgeInsets.all(16), child: child),
    );
  }

  Widget _friendSummaryCard({
    required double owe,
    required double owed,
    required int txCount,
    required int bucketCount,
  }) {
    final theme = Theme.of(context);
    final net = double.parse((owed - owe).toStringAsFixed(2));
    final settled = owe.abs() < 0.01 && owed.abs() < 0.01;
    final netColor = net > 0.01
        ? Colors.teal.shade700
        : net < -0.01
            ? Colors.redAccent
            : theme.colorScheme.onSurface.withOpacity(.64);
    final phone = widget.friend.phone;
    final email = widget.friend.email;
    final subtitleParts = <String>[];
    if (phone.isNotEmpty) subtitleParts.add(phone);
    if (email != null && email.isNotEmpty) subtitleParts.add(email);

    final oweLabel = owe <= 0.01
        ? 'You owe ₹0.00'
        : 'You owe ₹${owe.toStringAsFixed(2)}';
    final owedLabel = owed <= 0.01
        ? 'No dues for you'
        : 'Owes you ₹${owed.toStringAsFixed(2)}';

    final chipTextStyle = theme.textTheme.labelLarge?.copyWith(
      fontFeatures: const [ui.FontFeature.tabularFigures()],
    );

    Widget amountChip(String label, double amount,
        {Color? color, IconData? icon}) {
      final chipColor = color ??
          (amount >= 0 ? Colors.teal.shade700 : Colors.redAccent);
      return PillChip(
        label,
        icon: icon,
        fg: chipColor,
        bg: chipColor.withOpacity(0.15),
        textStyle: chipTextStyle,
      );
    }

    final netLabel = net.abs() < 0.01
        ? 'Settled'
        : net > 0
            ? '+ ₹${net.toStringAsFixed(2)}'
            : '- ₹${(-net).toStringAsFixed(2)}';

    return detail.GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Hero(
                tag: 'friend:${widget.friend.phone}',
                child: _buildAvatar(radius: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (subtitleParts.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          subtitleParts.join(' • '),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.textTheme.bodySmall?.color
                                ?.withOpacity(.74),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              AnimatedSwitcher(
                duration: kMed,
                switchInCurve: kEase,
                switchOutCurve: kEase,
                child: PillChip(
                  netLabel,
                  key: ValueKey(netLabel),
                  fg: netColor,
                  bg: netColor.withOpacity(0.18),
                  textStyle: theme.textTheme.labelLarge?.copyWith(
                    fontFeatures: const [ui.FontFeature.tabularFigures()],
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              amountChip(
                oweLabel,
                -owe,
                icon: Icons.call_made_rounded,
                color: Colors.redAccent,
              ),
              amountChip(
                owedLabel,
                owed,
                icon: Icons.call_received_rounded,
                color: Colors.teal.shade700,
              ),
              if (settled)
                PillChip(
                  'All settled',
                  icon: Icons.check_circle,
                  fg: theme.colorScheme.onSurface.withOpacity(.72),
                  bg: theme.colorScheme.onSurface.withOpacity(.08),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              PillChip(
                'Transactions: $txCount',
                icon: Icons.receipt_long_rounded,
                textStyle: theme.textTheme.labelLarge,
              ),
              if (bucketCount > 0)
                PillChip(
                  'Shared groups: $bucketCount',
                  icon: Icons.layers_rounded,
                  textStyle: theme.textTheme.labelLarge,
                ),
            ],
          ),
        ],
      ),
    );
  }
  Widget _buildAvatar({double radius = 36}) {
    final raw = (_friendAvatarUrl?.trim().isNotEmpty == true)
        ? _friendAvatarUrl!.trim()
        : widget.friend.avatar.trim();

    if (raw.isNotEmpty &&
        (raw.startsWith('http://') || raw.startsWith('https://'))) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: Colors.white,
        foregroundImage: NetworkImage(raw),
      );
    }

    if (raw.isNotEmpty && raw.startsWith('assets/')) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: Colors.white,
        foregroundImage: AssetImage(raw),
      );
    }

    final initial = widget.friend.name.isNotEmpty
        ? widget.friend.name.characters.first.toUpperCase()
        : '👤';
    return CircleAvatar(
      radius: radius,
      backgroundColor: Colors.white,
      child: Text(
        initial,
        style: TextStyle(fontSize: radius * 1.4, fontWeight: FontWeight.w700),
      ),
    );
  }

  String get _displayName =>
      (_friendDisplayName?.isNotEmpty == true)
          ? _friendDisplayName!
          : widget.friend.name;

  // ---------- Actions ----------
  void _openAddExpense() async {
    final result = await showDialog(
      context: context,
      builder: (_) => AddFriendExpenseScreen(
        userPhone: widget.userPhone,
        userName: widget.userName,
        userAvatar: widget.userAvatar,
        friend: widget.friend,
        initialSplits: _lastCustomSplit,
      ),
    );
    if (result == true) setState(() {});
  }

  Future<void> _openLegacySettleUpDialog() async {
    final result = await showDialog(
      context: context,
      builder: (_) => SettleUpDialog(
        userPhone: widget.userPhone,
        friends: [widget.friend],
        groups: const [],
        initialFriend: widget.friend,
      ),
    );
    if (result == true && mounted) setState(() {});
  }

  void _openSettleUp() async {
    if (!FxFlags.settleUpV2) {
      await _openLegacySettleUpDialog();
      return;
    }

    try {
      final friendAvatar =
      (_friendAvatarUrl?.isNotEmpty == true) ? _friendAvatarUrl : null;
      final settled = await SettleUpFlowV2Launcher.openForFriend(
        context: context,
        currentUserPhone: widget.userPhone,
        friend: widget.friend,
        friendDisplayName: _displayName,
        friendAvatarUrl: friendAvatar,
        friendSubtitle: widget.friend.phone,
      );

      if (settled == null) {
        await _openLegacySettleUpDialog();
      } else if (settled && mounted) {
        setState(() {});
      }
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to open Settle Up: $err')),
      );
      await _openLegacySettleUpDialog();
    }
  }

  void _remind() async {
    _tabController.animateTo(_TAB_CHAT);
    final msg =
        "Hi ${_displayName.split(' ').first}, quick nudge — current balance says we should settle soon. Can we do ₹… today? 😊";
    await Clipboard.setData(ClipboardData(text: msg));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Reminder copied — paste in chat')),
    );
    final firstName = _displayName.split(' ').first;
    await PushService.showLocalSmart(
      title: '🧠 Nudge sent',
      body: 'Reminder ready for $firstName. Tap to open chat and paste.',
      deeplink:
          'app://friend/${widget.friend.phone}?name=${Uri.encodeComponent(_displayName)}',
      channelId: 'fiinny_nudges',
    );

    final follow = DateTime.now().add(const Duration(hours: 3));
    await NotificationService().scheduleAt(
      id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title: '⏰ Follow up with $firstName',
      body: 'Still waiting? A quick “settle up?” can save the awkwardness.',
      when: follow,
      payload:
          'app://friend/${widget.friend.phone}?name=${Uri.encodeComponent(_displayName)}',
    );
  }

  Future<void> _editEntry(ExpenseItem e) async {
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => EditExpenseScreen(
          userPhone: widget.userPhone,
          expense: e,
        ),
      ),
    );
    if (updated == true && mounted) {
      setState(() {});
    }
  }

  Future<void> _deleteEntry(ExpenseItem e) async {
    try {
      await ExpenseService().deleteExpense(widget.userPhone, e.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Expense deleted')));
      setState(() {});
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete: $err')));
    }
  }

  // ======================= BUILD =======================
  @override
  Widget build(BuildContext context) {
    final friendPhone = widget.friend.phone;
    final you = widget.userPhone;
    final primary = Colors.teal.shade800;

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFF7FBFF), Color(0xFFEFF5FF)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(_displayName),
          backgroundColor: Colors.white,
          elevation: 2,
          actions: [
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: _handleEditFriend,
              tooltip: "Edit friend",
            ),
          ],
          bottom: TabBar(
            controller: _tabController,
            labelColor: Colors.teal.shade900,
            unselectedLabelColor: Colors.teal.shade600,
            labelStyle: const TextStyle(fontWeight: FontWeight.w800),
            unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w700),
            indicatorColor: Colors.teal.shade800,
            indicatorWeight: 3,
            tabs: const [
              Tab(text: "History"),
              Tab(text: "Chart"),
              Tab(text: "Analytics"),
              Tab(text: "Chat"),
            ],
          ),
        ),
        body: StreamBuilder<List<ExpenseItem>>(
          stream: ExpenseService().getExpensesStream(you),
          builder: (context, snapshot) {
            final all = snapshot.data ?? [];
            final safeBottom = context.adsBottomPadding();

            // Pairwise-only list
            final pairwise = pairwiseExpenses(you, friendPhone, all);

            // Totals + per-group breakdown (pairwise only)
            final breakdown =
                computePairwiseBreakdown(you, friendPhone, pairwise);
            final buckets = breakdown.buckets;
            final canonicalNet =
                ledger.netBetween(you, friendPhone, pairwise);
            final headerTotals =
                ledger.summarizeForHeader({friendPhone: canonicalNet});
            final totalOwe = headerTotals.youOwe;
            final totalOwed = headerTotals.owedToYou;
            final double netHeader = headerTotals.net;

            return TabBarView(
              controller: _tabController,
              children: [
                // ------------------ 1) HISTORY ------------------
                RefreshIndicator(
                  onRefresh: _refreshAll,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Padding(
                      // 16px sides avoids fractional leftover widths
                      padding: EdgeInsets.fromLTRB(16, 16, 16, safeBottom + 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // UX: Premium friend summary card (UI-only)
                          _friendSummaryCard(
                            owe: totalOwe,
                            owed: totalOwed,
                            txCount: pairwise.length,
                            bucketCount: buckets.length,
                          ),
                          const SizedBox(height: 12),
                          const SleekAdCard(
                            margin: EdgeInsets.symmetric(horizontal: 4),
                            radius: 16,
                          ),
                          const SizedBox(height: 14),
                          // Recurring overview -> full recurring screen
                          _buildRecurringPeekCard(),
                          const SizedBox(height: 14),


                          // Actions card
                          _card(
                            context,
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              // Row (with SizedBox gaps) is safer than Wrap in a horizontal scroller
                              child: Row(
                                children: [
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.add),
                                    label: const Text("Add Expense"),
                                    onPressed: _openAddExpense,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.redAccent,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets
                                          .symmetric(
                                          horizontal: 16, vertical: 12),
                                      shape: RoundedRectangleBorder(
                                          borderRadius:
                                          BorderRadius.circular(12)),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.handshake),
                                    label: const Text("Settle Up"),
                                    onPressed: _openSettleUp,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: primary,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets
                                          .symmetric(
                                          horizontal: 16, vertical: 12),
                                      shape: RoundedRectangleBorder(
                                          borderRadius:
                                          BorderRadius.circular(12)),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  ElevatedButton.icon(
                                    icon: const Icon(
                                        Icons.notifications_active_rounded),
                                    label: const Text("Remind"),
                                    onPressed: _remind,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.deepOrange,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets
                                          .symmetric(
                                          horizontal: 16, vertical: 12),
                                      shape: RoundedRectangleBorder(
                                          borderRadius:
                                          BorderRadius.circular(12)),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),

                          // Per-group breakdown (pairwise only)
                          StreamBuilder<List<GroupModel>>(
                            stream:
                            GroupService().streamGroups(widget.userPhone),
                            builder: (context, groupSnap) {
                              final groups = groupSnap.data ?? [];
                              String nameFor(String bucketId) {
                                if (bucketId == '__none__') {
                                  return 'Outside groups';
                                }
                                final g = groups.firstWhere(
                                      (x) => x.id == bucketId,
                                  orElse: () => GroupModel(
                                    id: bucketId,
                                    name: 'Group',
                                    memberPhones: const [],
                                    createdBy: '',
                                    createdAt: DateTime.now(),
                                  ),
                                );
                                return g.name;
                              }

                              final entries = buckets.entries
                                  .where((e) =>
                              e.value.owe > 0 || e.value.owed > 0)
                                  .toList()
                                ..sort((a, b) =>
                                (b.value.net.compareTo(a.value.net)));

                              if (entries.isEmpty) {
                                return const SizedBox.shrink();
                              }

                              return _card(
                                context,
                                padding:
                                const EdgeInsets.fromLTRB(16, 8, 16, 6),
                                child: Theme(
                                  data: Theme.of(context).copyWith(
                                      dividerColor: Colors.transparent),
                                  child: ExpansionTile(
                                    tilePadding: EdgeInsets.zero,
                                    childrenPadding: EdgeInsets.zero,
                                    initiallyExpanded: _breakdownExpanded,
                                    onExpansionChanged: (v) =>
                                        setState(() =>
                                        _breakdownExpanded = v),
                                    title: Row(
                                      children: [
                                        const Icon(Icons.bar_chart_rounded,
                                            color: Colors.teal),
                                        const SizedBox(width: 8),
                                        Text(
                                          "Breakdown",
                                          style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 16,
                                            color: Colors.teal.shade900,
                                          ),
                                        ),
                                        const Spacer(),
                                        Builder(builder: (_) {
                                          final netColor = netHeader >= 0
                                              ? Colors.green
                                              : Colors.redAccent;
                                          final netText =
                                              "${netHeader >= 0 ? '+' : '-'} ₹${netHeader.abs().toStringAsFixed(2)}";
                                          return Container(
                                            padding: const EdgeInsets
                                                .symmetric(
                                                horizontal: 10,
                                                vertical: 6),
                                            decoration: BoxDecoration(
                                              color: netColor
                                                  .withOpacity(0.12),
                                              borderRadius:
                                              BorderRadius.circular(999),
                                            ),
                                            child: Text(
                                              netText,
                                              style: TextStyle(
                                                  color: netColor,
                                                  fontWeight:
                                                  FontWeight.w800),
                                            ),
                                          );
                                        }),
                                        const SizedBox(width: 8),
                                        AnimatedRotation(
                                          turns: _breakdownExpanded
                                              ? 0.5
                                              : 0.0,
                                          duration: const Duration(
                                              milliseconds: 180),
                                          child: const Icon(Icons
                                              .keyboard_arrow_down_rounded),
                                        ),
                                      ],
                                    ),
                                    children: [
                                      const SizedBox(height: 6),
                                      ...entries.map((e) {
                                        final b = e.value;
                                        final title = nameFor(e.key);
                                        final netColor = b.net >= 0
                                            ? Colors.green
                                            : Colors.redAccent;
                                        final netText =
                                            "${b.net >= 0 ? '+' : '-'} ₹${b.net.abs().toStringAsFixed(2)}";

                                        return Padding(
                                          padding: const EdgeInsets
                                              .symmetric(vertical: 2),
                                          child: Row(
                                            children: [
                                              CircleAvatar(
                                                radius: 14,
                                                backgroundColor: Colors.teal
                                                    .withOpacity(.10),
                                                child: const Icon(
                                                    Icons
                                                        .folder_copy_rounded,
                                                    size: 16,
                                                    color: Colors.teal),
                                              ),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment:
                                                  CrossAxisAlignment
                                                      .start,
                                                  children: [
                                                    Text(title,
                                                        style: const TextStyle(
                                                            fontWeight:
                                                            FontWeight
                                                                .w600),
                                                        overflow: TextOverflow
                                                            .ellipsis),
                                                    Text(
                                                      "You owe: ₹${b.owe.toStringAsFixed(2)}   •   Owes you: ₹${b.owed.toStringAsFixed(2)}",
                                                      style: TextStyle(
                                                          color: Colors
                                                              .grey[800]),
                                                      overflow: TextOverflow
                                                          .ellipsis,
                                                    ),
                                                  ],
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              FittedBox(
                                                fit: BoxFit.scaleDown,
                                                child: Container(
                                                  padding: const EdgeInsets
                                                      .symmetric(
                                                      horizontal: 10,
                                                      vertical: 6),
                                                  decoration: BoxDecoration(
                                                    color: netColor
                                                        .withOpacity(0.12),
                                                    borderRadius:
                                                    BorderRadius
                                                        .circular(999),
                                                  ),
                                                  child: Text(
                                                    netText,
                                                    style: TextStyle(
                                                        color: netColor,
                                                        fontWeight:
                                                        FontWeight.w800),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        );
                                      }),
                                      const SizedBox(height: 6),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 16),

                          // Pairwise history list with group names
                          _card(
                            context,
                            padding:
                            const EdgeInsets.fromLTRB(16, 14, 16, 6),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  "Shared History",
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                    color: Colors.teal.shade900,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                // (NEW) settlement-safe Shared History (prevents pixel overflow)
                                StreamBuilder<List<GroupModel>>(
                                  stream: GroupService()
                                      .streamGroups(widget.userPhone),
                                  builder: (context, gSnap) {
                                    final groups = gSnap.data ?? [];
                                    final groupNames = <String, String>{
                                      for (final g in groups) g.id: g.name
                                    };

                                    const int historyAdEvery = 0;
                                    final int blockSize = historyAdEvery + 1;
                                    final int adCount = historyAdEvery > 0
                                        ? pairwise.length ~/ historyAdEvery
                                        : 0;
                                    final int totalItems = pairwise.length + adCount;

                                    return ListView.builder(
                                      itemCount: totalItems,
                                      shrinkWrap: true,
                                      physics: const NeverScrollableScrollPhysics(),
                                      itemBuilder: (_, idx) {
                                        final bool isAdSlot = historyAdEvery > 0 && blockSize > 0 &&
                                            (idx + 1) % blockSize == 0;
                                        if (isAdSlot) {
                                          return const SizedBox.shrink();
                                        }

                                        final adsBefore = historyAdEvery > 0 ? (idx + 1) ~/ blockSize : 0;
                                        final dataIndex = idx - adsBefore;
                                        final ex = pairwise[dataIndex];
                                        final isSettlement =
                                        isSettlementLike(ex);
                                        final title = isSettlement
                                            ? "Settlement"
                                            : (ex.label?.isNotEmpty == true
                                            ? ex.label!
                                            : (ex.category?.isNotEmpty ==
                                            true
                                            ? ex.category!
                                            : "Expense"));

                                        final groupName = (ex.groupId != null &&
                                            ex.groupId!.isNotEmpty)
                                            ? (groupNames[ex.groupId] ??
                                            "Group")
                                            : null;

                                        // From *your* perspective: + means owed to you, - means you owe
                                        final impact = _yourImpact(ex);
                                        final amountColor = impact >= 0
                                            ? Colors.green.shade700
                                            : Colors.redAccent;
                                        final amountText =
                                            "₹${ex.amount.toStringAsFixed(2)}";

                                        // files for this row
                                        final files =
                                        _attachmentsOf(ex);

                                        // trailing pill (compact)
                                        Widget trailingPill(String t) =>
                                            FittedBox(
                                              fit: BoxFit.scaleDown,
                                              child: Container(
                                                padding: const EdgeInsets
                                                    .symmetric(
                                                    horizontal: 10,
                                                    vertical: 6),
                                                decoration: BoxDecoration(
                                                  color: amountColor
                                                      .withOpacity(0.12),
                                                  borderRadius:
                                                  BorderRadius.circular(
                                                      999),
                                                ),
                                                child: Row(
                                                  mainAxisSize:
                                                  MainAxisSize.min,
                                                  children: [
                                                    Icon(
                                                        impact >= 0
                                                            ? Icons
                                                            .trending_up_rounded
                                                            : Icons
                                                            .trending_down_rounded,
                                                        size: 14,
                                                        color:
                                                        amountColor),
                                                    const SizedBox(width: 6),
                                                    Text(t,
                                                        style: TextStyle(
                                                            fontWeight:
                                                            FontWeight
                                                                .w800,
                                                            color:
                                                            amountColor)),
                                                  ],
                                                ),
                                              ),
                                            );

                                        final payer =
                                        _nameFor(ex.payerId);
                                        final recip = ex.friendIds.isNotEmpty
                                            ? _nameFor(ex.friendIds.first)
                                            : (widget.friend.phone ==
                                            ex.payerId
                                            ? "You"
                                            : _displayName);

                                        final maxInfoWidth =
                                            MediaQuery.of(context)
                                                .size
                                                .width *
                                                0.55;

                                        return Padding(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 12, vertical: 8),
                                          child: InkWell(
                                            onTap: () =>
                                                _showExpenseDetailsFriend(
                                                    context, ex),
                                            onLongPress: () =>
                                                _deleteEntry(ex),
                                            child: Row(
                                              crossAxisAlignment:
                                              CrossAxisAlignment.center,
                                              children: [
                                                // leading
                                                Container(
                                                  height: 40,
                                                  width: 40,
                                                  decoration: BoxDecoration(
                                                    color: (isSettlement
                                                        ? Colors.teal
                                                        : Colors.indigo)
                                                        .withOpacity(0.10),
                                                    borderRadius:
                                                    BorderRadius.circular(
                                                        10),
                                                  ),
                                                  child: Icon(
                                                      isSettlement
                                                          ? Icons.handshake
                                                          : Icons
                                                          .receipt_long_rounded,
                                                      color: isSettlement
                                                          ? Colors.teal
                                                          : Colors.indigo),
                                                ),
                                                const SizedBox(width: 12),

                                                // main text column (takes remaining width)
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                    CrossAxisAlignment
                                                        .start,
                                                    children: [
                                                      // title
                                                      Text(
                                                        title,
                                                        maxLines: 1,
                                                        overflow: TextOverflow
                                                            .ellipsis,
                                                        style: const TextStyle(
                                                            fontWeight:
                                                            FontWeight
                                                                .w700,
                                                            fontSize: 15),
                                                      ),
                                                      const SizedBox(height: 2),
                                                      Wrap(
                                                        spacing: 8,
                                                        runSpacing: 4,
                                                        crossAxisAlignment:
                                                        WrapCrossAlignment
                                                            .center,
                                                        children: [
                                                          // date
                                                          Row(
                                                            mainAxisSize:
                                                            MainAxisSize
                                                                .min,
                                                            children: [
                                                              const Icon(
                                                                  Icons
                                                                      .calendar_today_rounded,
                                                                  size: 12,
                                                                  color: Colors
                                                                      .black54),
                                                              const SizedBox(
                                                                  width: 4),
                                                              Text(
                                                                "${_fmtShort(ex.date)} ${ex.date.year}",
                                                                style: const TextStyle(
                                                                    fontSize:
                                                                    12,
                                                                    color: Colors
                                                                        .black87),
                                                                overflow:
                                                                TextOverflow
                                                                    .ellipsis,
                                                              ),
                                                            ],
                                                          ),
                                                          // payer → recipient (compact and ellipsized)
                                                          Row(
                                                            mainAxisSize:
                                                            MainAxisSize
                                                                .min,
                                                            children: [
                                                              const Icon(
                                                                  Icons
                                                                      .swap_horiz,
                                                                  size: 12,
                                                                  color: Colors
                                                                      .black54),
                                                              const SizedBox(
                                                                  width: 4),
                                                              ConstrainedBox(
                                                                constraints:
                                                                BoxConstraints(
                                                                    maxWidth:
                                                                    maxInfoWidth),
                                                                child: Text(
                                                                  isSettlement
                                                                      ? "$payer → $recip"
                                                                      : "Paid by $payer",
                                                                  style: const TextStyle(
                                                                      fontSize:
                                                                      12,
                                                                      color: Colors
                                                                          .black87),
                                                                  maxLines: 1,
                                                                  overflow:
                                                                  TextOverflow
                                                                      .ellipsis,
                                                                ),
                                                              ),
                                                            ],
                                                          ),
                                                          // group badge (wraps if narrow)
                                                          if (groupName !=
                                                              null)
                                                            Container(
                                                              padding:
                                                              const EdgeInsets
                                                                  .symmetric(
                                                                  horizontal:
                                                                  8,
                                                                  vertical:
                                                                  3),
                                                              decoration:
                                                              BoxDecoration(
                                                                color: Colors
                                                                    .blueGrey
                                                                    .withOpacity(
                                                                    0.10),
                                                                borderRadius:
                                                                BorderRadius
                                                                    .circular(
                                                                    999),
                                                              ),
                                                              child: Text(
                                                                groupName,
                                                                style: const TextStyle(
                                                                    fontSize:
                                                                    11,
                                                                    fontWeight:
                                                                    FontWeight
                                                                        .w600),
                                                                overflow:
                                                                TextOverflow
                                                                    .ellipsis,
                                                              ),
                                                            ),
                                                        ],
                                                      ),

                                                      // ===== Attachments row (thumbnails / chips) =====
                                                      if (files.isNotEmpty)
                                                        Padding(
                                                          padding:
                                                          const EdgeInsets
                                                              .only(
                                                              top: 6),
                                                          child: SizedBox(
                                                            height: 56,
                                                            child: ListView
                                                                .separated(
                                                                scrollDirection:
                                                                Axis
                                                                    .horizontal,
                                                                itemCount: math.min(
                                                                    files.length,
                                                                    10),
                                                                separatorBuilder:
                                                                    (_, __) =>
                                                                const SizedBox(
                                                                    width:
                                                                    6),
                                                                itemBuilder: (_, idx) {
                                                                  final url = files[idx];

                                                                  final thumb = _isImageUrl(url)
                                                                      ? ClipRRect(
                                                                    borderRadius: BorderRadius.circular(8),
                                                                    child: AspectRatio(
                                                                      aspectRatio: 1,
                                                                      child: Image.network(url, fit: BoxFit.cover),
                                                                    ),
                                                                  )
                                                                      : Container(
                                                                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
                                                                    decoration: BoxDecoration(
                                                                      color: Colors.blueGrey.withOpacity(0.10),
                                                                      borderRadius: BorderRadius.circular(8),
                                                                    ),
                                                                    child: Row(
                                                                      mainAxisSize: MainAxisSize.min,
                                                                      children: [
                                                                        const Icon(Icons.attach_file, size: 14, color: Colors.blueGrey),
                                                                        const SizedBox(width: 4),
                                                                        Text(
                                                                          "File",
                                                                          style: TextStyle(
                                                                            fontSize: 12,
                                                                            color: Colors.blueGrey.shade800,
                                                                            fontWeight: FontWeight.w600,
                                                                          ),
                                                                        ),
                                                                      ],
                                                                    ),
                                                                  );

                                                                  // 🔒 parent row ke InkWell se conflict na ho, isliye GestureDetector + opaque
                                                                  return GestureDetector(
                                                                    behavior: HitTestBehavior.opaque,
                                                                    onTap: () => _openAttachment(url),
                                                                    child: thumb,
                                                                  );
                                                                }


                                                            ),
                                                          ),
                                                        ),
                                                    ],
                                                  ),
                                                ),

                                                const SizedBox(width: 8),

                                                // trailing amount (scale down to avoid overflow)
                                                trailingPill(amountText),
                                              ],
                                            ),
                                          ),
                                        );
                                      },
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                // ------------------ 2) CHART ------------------
                Builder(builder: (context) {
                  final categoryTotals = <String, double>{};
                  for (final expense in pairwise) {
                    final cat = _categoryLabelForExpense(expense);
                    categoryTotals.update(cat, (value) => value + expense.amount.abs(),
                        ifAbsent: () => expense.amount.abs());
                  }
                  final palette = [
                    Colors.teal,
                    Colors.indigo,
                    Colors.deepPurple,
                    Colors.orange,
                    Colors.pink,
                    Colors.blueGrey,
                  ];
                  var colorIndex = 0;
                  final slices = categoryTotals.entries
                      .map((entry) => PieSlice(
                            key: entry.key,
                            label: entry.key,
                            value: entry.value,
                            color: palette[colorIndex++ % palette.length],
                          ))
                      .toList()
                    ..sort((a, b) => b.value.compareTo(a.value));
                  final totalSpending =
                      slices.fold<double>(0, (sum, slice) => sum + slice.value);
                  final filteredExpenses = _selectedCategorySlice == null
                      ? pairwise
                      : pairwise
                          .where((e) =>
                              _categoryLabelForExpense(e) ==
                              _selectedCategorySlice!.label)
                          .toList();
                  final friendsById = <String, FriendModel>{
                    widget.friend.phone: widget.friend,
                    widget.userPhone: _selfFriendModel,
                  };

                  return RefreshIndicator(
                    onRefresh: _refreshAll,
                    child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(16, 22, 16, safeBottom + 22),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            detail.GlassCard(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        'Spending by category',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 16,
                                          color: Colors.teal.shade900,
                                        ),
                                      ),
                                      const Spacer(),
                                      Icon(Icons.pie_chart_rounded,
                                          color: Colors.teal.shade700, size: 18),
                                    ],
                                  ),
                                  const SizedBox(height: 16),
                                  Center(
                                    child: SizedBox(
                                      height: 220,
                                      width: 220,
                                      child: PieTouchChart(
                                        slices: slices,
                                        selected: _selectedCategorySlice,
                                        onSelect: _onSliceSelected,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  CategoryLegendRow(
                                    slices: slices,
                                    total: totalSpending,
                                    selected: _selectedCategorySlice,
                                    onSelect: _onSliceSelected,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            const SleekAdCard(
                              margin: EdgeInsets.symmetric(horizontal: 4),
                              radius: 16,
                            ),
                            const SizedBox(height: 16),
                            Container(
                              key: _chartListAnchorKey,
                              child: UnifiedTransactionList(
                                key: ValueKey(
                                    'friend-chart-${_selectedCategorySlice?.key ?? 'all'}'),
                                expenses: filteredExpenses,
                                incomes: const [],
                                friendsById: friendsById,
                                userPhone: widget.userPhone,
                                onEdit: (tx) {
                                  if (tx is ExpenseItem) {
                                    _editEntry(tx);
                                  }
                                },
                                onDelete: (tx) {
                                  if (tx is ExpenseItem) {
                                    _deleteEntry(tx);
                                  }
                                },
                                showTopBannerAd: false,
                                showBottomBannerAd: true,
                                inlineAdAfterIndex: 2,
                                enableInlineAds: true,
                                emptyBuilder: (ctx) => Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 24),
                                  child: Text(
                                    _selectedCategorySlice == null
                                        ? 'No shared expenses yet.'
                                        : 'No expenses in ${_selectedCategorySlice!.label}.',
                                    textAlign: TextAlign.center,
                                    style: Theme.of(ctx)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),

                // ------------------ 3) ANALYTICS ------------------
                RefreshIndicator(
                  onRefresh: _refreshAll,
                  child: FriendAnalyticsTab(
                    expenses: pairwise,
                    currentUserPhone: widget.userPhone,
                    friend: widget.friend,
                  ),
                ),

                // ------------------ 4) CHAT ------------------
                SafeArea(
                  top: false,
                  child: PartnerChatTab(
                    currentUserId: widget.userPhone,
                    partnerUserId: widget.friend.phone,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  // ======================= SMALL UI BITS =======================
  Widget _participantsHeader(ExpenseItem e) {
    final youName = 'You';
    final youAvatar = widget.userAvatar;
    final friendName = _displayName;
    final friendAvatar = (_friendAvatarUrl?.isNotEmpty == true)
        ? _friendAvatarUrl!
        : widget.friend.avatar;

    Widget avatar(String? url, String fallbackInitial) {
      if ((url ?? '').trim().startsWith('http')) {
        return CircleAvatar(
            radius: 22, backgroundImage: NetworkImage(url!.trim()));
      }
      return CircleAvatar(
          radius: 22, child: Text(fallbackInitial.toUpperCase()));
    }

    return Row(
      children: [
        avatar(youAvatar, youName.characters.first),
        const SizedBox(width: 8),
        Expanded(
          child: Text(youName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
        const Icon(Icons.compare_arrows_rounded, size: 18, color: Colors.teal),
        const SizedBox(width: 8),
        avatar(friendAvatar, friendName.characters.first),
        const SizedBox(width: 8),
        Expanded(
          child: Text(friendName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }

  Widget _section({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 10,
              offset: const Offset(0, 4))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(title,
                style:
                const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          ]),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _chip(
      {required String text,
        required Color fg,
        required Color bg,
        required IconData icon}) {
    return Container(
      padding:
      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration:
      BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 6),
          Text(text,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String text;
  final Color base;

  const _StatusChip(this.text, this.base, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: base.withOpacity(.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withOpacity(.22)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: base,
          fontWeight: FontWeight.w700,
          fontSize: 11.5,
        ),
      ),
    );
  }
}

class _AmountChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _AmountChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: effectiveColor.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: effectiveColor.withOpacity(0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: effectiveColor),
          const SizedBox(width: 6),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 160),
            child: Text(
              label,
              key: ValueKey(label),
              style: TextStyle(
                color: effectiveColor,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _SummaryStat({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = theme.colorScheme.primary.withOpacity(
      theme.brightness == Brightness.dark ? 0.18 : 0.12,
    );
    final textColor =
        theme.textTheme.bodyMedium?.color ?? (theme.brightness == Brightness.dark
            ? Colors.white
            : Colors.black87);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: textColor.withOpacity(0.7),
                  fontWeight: FontWeight.w600,
                ) ??
                    TextStyle(
                      fontSize: 12,
                      color: textColor.withOpacity(0.7),
                      fontWeight: FontWeight.w600,
                    ),
              ),
              Text(
                value,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: textColor,
                ) ??
                    TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: textColor,
                    ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettledBadge extends StatelessWidget {
  const _SettledBadge();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle_rounded, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            'All settled',
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final Color base;
  final EdgeInsetsGeometry padding;

  const _Pill(
      this.text, {
        this.base = AppColors.mint,
        this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        super.key,
      });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: base.withOpacity(.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withOpacity(.22)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: base,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
