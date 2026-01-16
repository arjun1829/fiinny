import 'package:flutter/material.dart';
import '../models/partner_model.dart';

class PartnerInsightsWidget extends StatelessWidget {
  final PartnerModel partner;
  const PartnerInsightsWidget({Key? key, required this.partner}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final credit = (partner.todayCredit ?? 0).toDouble();
    final debit = (partner.todayDebit ?? 0).toDouble();
    final count = (partner.todayTxCount ?? 0);
    final amount = (partner.todayTxAmount ?? (credit + debit)).toDouble();
    final net = credit - debit;
    final ringMax = (credit > debit ? credit : debit).clamp(1, double.infinity);
    final pctCredit = (credit / ringMax).clamp(0.0, 1.0);
    final pctDebit = (debit / ringMax).clamp(0.0, 1.0);
    final hasStats = (credit + debit + amount + count) > 0;

    return Card(
      elevation: 2,
      margin: const EdgeInsets.all(12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header: avatar + name + relation + status
            Row(
              children: [
                _PartnerAvatar(avatar: partner.avatar, name: partner.partnerName),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(partner.partnerName.isNotEmpty ? partner.partnerName : 'Partner',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: theme.colorScheme.primary,
                          )),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if ((partner.relation ?? '').isNotEmpty)
                            _Chip(
                              label: partner.relation!,
                              color: theme.colorScheme.primary.withValues(alpha: 0.1),
                              textColor: theme.colorScheme.primary,
                            ),
                          const SizedBox(width: 6),
                          _Chip(
                            label: partner.status.isNotEmpty ? partner.status : 'pending',
                            color: _statusBg(partner.status, theme),
                            textColor: _statusFg(partner.status, theme),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Tiny ring
                SizedBox(
                  height: 56,
                  width: 56,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      _Ring(percent: pctDebit, color: Colors.red, strokeWidth: 6),
                      _Ring(percent: pctCredit, color: Colors.green, strokeWidth: 4, inset: 6),
                      Text(
                        ringMax == 1 ? '—' : (net >= 0 ? '↑' : '↓'),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Permissions tip (optional visual)
            if (partner.permissions.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  _permSummary(partner.permissions),
                  style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey[700]),
                ),
              ),
            if (partner.permissions.isNotEmpty) const SizedBox(height: 10),

            // Stats
            if (hasStats)
              _StatRow(
                leftIcon: Icons.south_west_rounded,
                leftLabel: 'Debit',
                leftValue: _money(debit),
                leftColor: Colors.red,
                rightIcon: Icons.north_east_rounded,
                rightLabel: 'Credit',
                rightValue: _money(credit),
                rightColor: Colors.green,
              )
            else
              _EmptyHint(),

            const SizedBox(height: 8),
            _Divider(),

            Row(
              children: [
                Expanded(
                  child: _MiniStat(
                    icon: Icons.swap_horiz_rounded,
                    label: 'Net',
                    value: _money(net),
                    color: net >= 0 ? Colors.green[700]! : Colors.red[700]!,
                  ),
                ),
                Expanded(
                  child: _MiniStat(
                    icon: Icons.payments_rounded,
                    label: 'Amount',
                    value: _money(amount),
                  ),
                ),
                Expanded(
                  child: _MiniStat(
                    icon: Icons.receipt_long_rounded,
                    label: 'Tx Count',
                    value: '$count',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _money(double v) {
    // Keep it generic (no currency symbol assumptions)
    if (v.abs() >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v.abs() >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toStringAsFixed(0);
  }

  static String _permSummary(Map<String, bool> perms) {
    final enabled = perms.entries.where((e) => e.value).map((e) => e.key).toList();
    if (enabled.isEmpty) return 'No permissions granted yet.';
    return 'Access: ${enabled.join(', ')}';
  }

  static Color _statusBg(String status, ThemeData t) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green.withValues(alpha: 0.12);
      case 'revoked':
        return Colors.red.withValues(alpha: 0.12);
      default:
        return t.colorScheme.primary.withValues(alpha: 0.10);
    }
  }

  static Color _statusFg(String status, ThemeData t) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green[800]!;
      case 'revoked':
        return Colors.red[800]!;
      default:
        return t.colorScheme.primary;
    }
  }
}

class _PartnerAvatar extends StatelessWidget {
  final String? avatar;
  final String name;
  const _PartnerAvatar({required this.avatar, required this.name});

  @override
  Widget build(BuildContext context) {
    final initials = _initials(name);
    final bg = Colors.teal.withValues(alpha: 0.12);
    final fg = Colors.teal[900];

    return CircleAvatar(
      radius: 24,
      backgroundColor: bg,
      backgroundImage: (avatar != null && avatar!.startsWith('http')) ? NetworkImage(avatar!) : null,
      child: (avatar == null || avatar!.isEmpty || !avatar!.startsWith('http'))
          ? Text(initials, style: TextStyle(fontWeight: FontWeight.w700, color: fg))
          : null,
    );
  }

  String _initials(String s) {
    if (s.trim().isEmpty) return '👤';
    final parts = s.trim().split(RegExp(r'\s+'));
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  final Color textColor;
  const _Chip({required this.label, required this.color, required this.textColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
      child: Text(label, style: TextStyle(fontSize: 12, color: textColor, fontWeight: FontWeight.w600)),
    );
  }
}

class _Ring extends StatelessWidget {
  final double percent;
  final Color color;
  final double strokeWidth;
  final double inset; // to draw inner ring
  const _Ring({
    required this.percent,
    required this.color,
    required this.strokeWidth,
    this.inset = 0,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _RingPainter(percent: percent, color: color, strokeWidth: strokeWidth, inset: inset),
      size: const Size.square(56),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double percent;
  final Color color;
  final double strokeWidth;
  final double inset;
  _RingPainter({required this.percent, required this.color, required this.strokeWidth, required this.inset});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset(inset, inset) & Size(size.width - inset * 2, size.height - inset * 2);
    final bg = Paint()
      ..color = color.withValues(alpha: 0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // full circle background
    canvas.drawArc(rect, 0, 2 * 3.1415926535, false, bg);
    // progress arc
    canvas.drawArc(rect, -3.1415926535 / 2, 2 * 3.1415926535 * percent, false, fg);
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) {
    return old.percent != percent || old.color != color || old.strokeWidth != strokeWidth || old.inset != inset;
  }
}

class _StatRow extends StatelessWidget {
  final IconData leftIcon;
  final String leftLabel;
  final String leftValue;
  final Color leftColor;

  final IconData rightIcon;
  final String rightLabel;
  final String rightValue;
  final Color rightColor;

  const _StatRow({
    Key? key,
    required this.leftIcon,
    required this.leftLabel,
    required this.leftValue,
    required this.leftColor,
    required this.rightIcon,
    required this.rightLabel,
    required this.rightValue,
    required this.rightColor,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final labelStyle = Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[700]);
    final valueStyle = const TextStyle(fontSize: 18, fontWeight: FontWeight.w800);

    return Row(
      children: [
        Expanded(
          child: _LabeledValue(icon: leftIcon, label: leftLabel, value: leftValue, color: leftColor, labelStyle: labelStyle, valueStyle: valueStyle),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _LabeledValue(icon: rightIcon, label: rightLabel, value: rightValue, color: rightColor, labelStyle: labelStyle, valueStyle: valueStyle),
        ),
      ],
    );
  }
}

class _LabeledValue extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final TextStyle? labelStyle;
  final TextStyle? valueStyle;

  const _LabeledValue({
    Key? key,
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    this.labelStyle,
    this.valueStyle,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: labelStyle),
                const SizedBox(height: 2),
                Text(value, style: valueStyle?.copyWith(color: color)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? color;

  const _MiniStat({
    Key? key,
    required this.icon,
    required this.label,
    required this.value,
    this.color,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final c = color ?? Colors.teal[900]!;
    return Row(
      children: [
        CircleAvatar(
          radius: 16,
          backgroundColor: c.withValues(alpha: 0.10),
          child: Icon(icon, size: 18, color: c),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[700])),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Divider(height: 18, thickness: 1, color: Colors.grey.withValues(alpha: 0.2));
  }
}

class _EmptyHint extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 18),
      alignment: Alignment.center,
      child: Column(
        children: [
          Icon(Icons.insights_rounded, color: Colors.teal[400], size: 36),
          const SizedBox(height: 8),
          Text(
            "No activity yet today",
            style: TextStyle(color: Colors.grey[700], fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            "Once they add transactions, you’ll see quick insights here.",
            style: TextStyle(color: Colors.grey[600], fontSize: 12),
          ),
        ],
      ),
    );
  }
}
