// lib/widgets/transaction_detail_sheet.dart
import 'package:flutter/material.dart';
import '../models/expense_item.dart' as ex;
import '../models/income_item.dart' as inc;

// Ads (same setup your Expenses screen uses)
import '../core/ads/ad_slots.dart';   // AdsBannerSlot (works in your screen)
import '../core/ads/ad_service.dart'; // AdService (init + interstitials)

/// Bottom sheet showing unified detail for ExpenseItem or IncomeItem
/// - Content scrolls
/// - Banner ad is ANCHORED at the bottom (like Expenses screen)
/// - Interstitials are cadenced via AdService
class TransactionDetailSheet extends StatefulWidget {
  final dynamic tx;            // ex.ExpenseItem or inc.IncomeItem
  final VoidCallback? onEdit;
  final VoidCallback? onSplit;

  /// If true, will occasionally show an interstitial (cadenced by AdService).
  final bool interstitialOnOpen;

  /// If true, will occasionally show an interstitial when tapping Edit/Split.
  final bool interstitialOnAction;

  const TransactionDetailSheet({
    super.key,
    required this.tx,
    this.onEdit,
    this.onSplit,
    this.interstitialOnOpen = false,
    this.interstitialOnAction = true,
  });

  @override
  State<TransactionDetailSheet> createState() => _TransactionDetailSheetState();
}

class _TransactionDetailSheetState extends State<TransactionDetailSheet> {
  static const double _bannerH = 60.0; // same height you use on Expenses
  bool get _isExpense => widget.tx is ex.ExpenseItem;
  bool get _isIncome  => widget.tx is inc.IncomeItem;

  @override
  void initState() {
    super.initState();
    // ensure the GMA SDK is ready (safe to call more than once)
    AdService.initLater();

    if (widget.interstitialOnOpen) {
      AdService.I.maybeShowInterstitial(
        minActions: 4,
        minGap: const Duration(minutes: 2),
      );
    }
  }

  Future<void> _maybeInterOnAction() async {
    if (widget.interstitialOnAction) {
      await AdService.I.maybeShowInterstitial(
        minActions: 3,
        minGap: const Duration(minutes: 2),
      );
    }
  }

  String _amountText() {
    final amount = (widget.tx.amount as num?)?.toDouble() ?? 0.0;
    return amount.toStringAsFixed(2);
  }

  String _categoryText() {
    final cat = (widget.tx.category as String?)?.trim();
    final typ = (widget.tx.type as String?)?.trim();
    return (cat != null && cat.isNotEmpty) ? cat : (typ ?? '');
  }

  String _dateText() {
    final dt = widget.tx.date as DateTime;
    return dt.toString().split(' ').first;
  }

  String? _title() {
    try {
      final t = widget.tx.title as String?;
      return (t == null || t.trim().isEmpty) ? null : t.trim();
    } catch (_) { return null; }
  }

  String? _comments() {
    try {
      final c = widget.tx.comments as String?;
      return (c == null || c.trim().isEmpty) ? null : c.trim();
    } catch (_) { return null; }
  }

  String? _parsedNote() {
    try {
      final n = widget.tx.note as String?;
      return (n == null || n.trim().isEmpty) ? null : n.trim();
    } catch (_) { return null; }
  }

  List<String> _labels() {
    try {
      final any = widget.tx.allLabels;
      if (any is List) return any.whereType<String>().toList();
    } catch (_) {}
    final res = <String>[];
    try {
      if (widget.tx.labels is List) {
        res.addAll(List<String>.from(widget.tx.labels));
      }
    } catch (_) {}
    try {
      final legacy = widget.tx.label as String?;
      if (legacy != null && legacy.trim().isNotEmpty) res.add(legacy.trim());
    } catch (_) {}
    final seen = <String>{};
    return res
        .where((e) => e.trim().isNotEmpty && seen.add(e.trim().toLowerCase()))
        .toList();
  }

  List _attachments() {
    try {
      if (widget.tx.attachments is List &&
          (widget.tx.attachments as List).isNotEmpty) {
        return List.from(widget.tx.attachments as List);
      }
    } catch (_) {}
    try {
      final url = widget.tx.attachmentUrl as String?;
      final name = widget.tx.attachmentName as String?;
      final size = widget.tx.attachmentSize as int?;
      if (url != null || name != null || size != null) {
        return [
          {'url': url, 'name': name, 'size': size}
        ];
      }
    } catch (_) {}
    return const [];
  }

  String? _attUrl(dynamic a) {
    try { return a.url as String?; } catch (_) {}
    try { return (a as Map)['url'] as String?; } catch (_) {}
    return null;
  }

  String? _attName(dynamic a) {
    try { return a.name as String?; } catch (_) {}
    try { return (a as Map)['name'] as String?; } catch (_) {}
    return null;
  }

  int? _attSize(dynamic a) {
    try { return a.size as int?; } catch (_) {}
    try {
      final v = (a as Map)['size'];
      if (v is int) return v;
      if (v is num) return v.toInt();
    } catch (_) {}
    return null;
  }

  bool _isImage(dynamic a) {
    try {
      final mt = a.mimeType as String?;
      if (mt != null && mt.startsWith('image/')) return true;
    } catch (_) {}
    final url = _attUrl(a)?.toLowerCase() ?? '';
    return url.endsWith('.png') ||
        url.endsWith('.jpg') ||
        url.endsWith('.jpeg') ||
        url.endsWith('.gif') ||
        url.endsWith('.webp') ||
        url.contains('image');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final labels = _labels();
    final atts = _attachments();
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return SafeArea(
      child: Stack(
        children: [
          // Scrollable content with extra bottom padding so the ad never overlaps
          Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 8 + _bannerH + bottomInset + 6),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // drag handle
                  Container(
                    height: 4, width: 40,
                    decoration: BoxDecoration(
                      color: Colors.black12,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    margin: const EdgeInsets.only(bottom: 12),
                  ),

                  // Header
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Icon(
                        _isExpense ? Icons.remove_circle_outline : Icons.add_circle_outline,
                        color: _isExpense ? Colors.redAccent : Colors.green,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _categoryText(),
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        _amountText(),
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),

                  if (_title() != null) ...[
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        _title()!,
                        style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],

                  if (labels.isNotEmpty) ...[
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: -8,
                        children: labels.take(8).map((l) => Chip(
                          label: Text('#$l'),
                          visualDensity: VisualDensity.compact,
                        )).toList(),
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],

                  _MetaRow(icon: Icons.event, label: 'Date', value: _dateText()),
                  if ((_isExpense ? (widget.tx as ex.ExpenseItem).bankLogo
                      : (_isIncome ? (widget.tx as inc.IncomeItem).bankLogo : null)) != null)
                    const _MetaRow(icon: Icons.account_balance, label: 'Bank', value: 'Linked'),

                  if (_comments() != null) ...[
                    const SizedBox(height: 10),
                    const _SectionTitle('Comments'),
                    const SizedBox(height: 6),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(_comments()!, style: theme.textTheme.bodyMedium),
                    ),
                  ],

                  if (_parsedNote() != null) ...[
                    const SizedBox(height: 12),
                    const _SectionTitle('Parsed Note'),
                    const SizedBox(height: 6),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.black12),
                      ),
                      child: Text(_parsedNote()!, style: theme.textTheme.bodySmall),
                    ),
                  ],

                  if (atts.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const _SectionTitle('Attachments'),
                    const SizedBox(height: 8),
                    _AttachmentsBlock(
                      attachments: atts,
                      isImage: _isImage,
                      urlOf: _attUrl,
                      nameOf: _attName,
                      sizeOf: _attSize,
                    ),
                  ],

                  const SizedBox(height: 14),

                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            await _maybeInterOnAction();
                            widget.onEdit?.call();
                          },
                          icon: const Icon(Icons.edit),
                          label: const Text('Edit'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      if (_isExpense && widget.onSplit != null)
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              await _maybeInterOnAction();
                              widget.onSplit?.call();
                            },
                            icon: const Icon(Icons.call_split),
                            label: const Text('Split'),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // === ANCHORED AD BANNER (identical style to Expenses screen) ===
          Positioned(
            left: 8,
            right: 8,
            bottom: bottomInset + 4,
            child: SafeArea(
              top: false,
              bottom: false,
              child: SizedBox(
                height: _bannerH,
                child: const AdsBannerSlot(
                  inline: false,            // anchored adaptive
                  padding: EdgeInsets.zero,
                  alignment: Alignment.center,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);
  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _MetaRow({required this.icon, required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(icon, size: 18, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Text('$label: ', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700)),
          Expanded(child: Text(value, style: theme.textTheme.bodySmall, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}

class _AttachmentsBlock extends StatelessWidget {
  final List attachments;
  final bool Function(dynamic) isImage;
  final String? Function(dynamic) urlOf;
  final String? Function(dynamic) nameOf;
  final int? Function(dynamic) sizeOf;

  const _AttachmentsBlock({
    required this.attachments,
    required this.isImage,
    required this.urlOf,
    required this.nameOf,
    required this.sizeOf,
  });

  String _sizeText(int? bytes) {
    if (bytes == null) return '';
    const kb = 1024, mb = kb * 1024;
    if (bytes >= mb) return '${(bytes / mb).toStringAsFixed(1)} MB';
    if (bytes >= kb) return '${(bytes / kb).toStringAsFixed(0)} KB';
    return '$bytes B';
  }

  @override
  Widget build(BuildContext context) {
    final images = attachments.where(isImage).toList();
    final others = attachments.where((a) => !isImage(a)).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (images.isNotEmpty)
          SizedBox(
            height: 84,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: images.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (ctx, i) {
                final url = urlOf(images[i]);
                if (url == null || url.isEmpty) {
                  return _FileTile(
                    name: nameOf(images[i]) ?? 'Image',
                    size: _sizeText(sizeOf(images[i])),
                    icon: Icons.image_not_supported_outlined,
                  );
                }
                return ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: AspectRatio(
                    aspectRatio: 1.3,
                    child: Image.network(
                      url,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.black12,
                        alignment: Alignment.center,
                        child: const Icon(Icons.broken_image_outlined),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        if (images.isNotEmpty && others.isNotEmpty) const SizedBox(height: 8),
        if (others.isNotEmpty)
          Column(
            children: others.map((a) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: _FileTile(
                  name: nameOf(a) ?? (urlOf(a) ?? 'Attachment'),
                  size: _sizeText(sizeOf(a)),
                  icon: Icons.attach_file,
                ),
              );
            }).toList(),
          ),
      ],
    );
  }
}

class _FileTile extends StatelessWidget {
  final String name;
  final String size;
  final IconData icon;
  const _FileTile({required this.name, required this.size, required this.icon});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.black12),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 180),
            child: Text(
              name,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          if (size.isNotEmpty) ...[
            const SizedBox(width: 6),
            Text(size, style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54)),
          ]
        ],
      ),
    );
  }
}
