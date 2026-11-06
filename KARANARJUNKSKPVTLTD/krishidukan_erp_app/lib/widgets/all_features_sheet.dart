import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/theme.dart';
import '../core/erp_links.dart';
import '../features/analytics/business_type.dart';
import 'ui.dart';

/// Every web-ERP feature in one searchable sheet, grouped the way an owner
/// thinks about them (Billing, Money, Stock…). Type "kha" and Khata is there —
/// nobody has to remember which menu something lives under.
Future<void> showAllFeatures(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const _AllFeaturesSheet(),
  );
}

class _AllFeaturesSheet extends ConsumerStatefulWidget {
  const _AllFeaturesSheet();

  @override
  ConsumerState<_AllFeaturesSheet> createState() => _AllFeaturesSheetState();
}

class _AllFeaturesSheetState extends ConsumerState<_AllFeaturesSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final type = ref.watch(businessTypeProvider);
    final q = _query.trim().toLowerCase();

    final groups = [
      for (final g in erpFeatureGroups)
        (
          g.title,
          [
            for (final f in g.features)
              if (erpFeatureVisible(f, type) &&
                  (q.isEmpty ||
                      f.label.toLowerCase().contains(q) ||
                      g.title.toLowerCase().contains(q)))
                f,
          ],
        ),
    ].where((g) => g.$2.isNotEmpty).toList();

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.78,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: Row(
              children: [
                Expanded(child: Text('All features', style: AppText.title)),
                Text('Opens web ERP', style: AppText.small),
                const SizedBox(width: 4),
                Icon(Icons.north_east_rounded,
                    size: 13, color: AppColors.inkMute),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 6),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                hintText: 'Search e.g. khata, invoice, stock',
                prefixIcon: Icon(Icons.search_rounded, size: 21),
                isDense: true,
              ),
            ),
          ),
          Expanded(
            child: groups.isEmpty
                ? Center(
                    child: Text('No feature matches "$_query"',
                        style: AppText.label),
                  )
                : ListView(
                    controller: controller,
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    children: [
                      for (final (title, features) in groups) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(4, 14, 4, 10),
                          child: Text(title, style: AppText.section),
                        ),
                        AppCard(
                          padding: const EdgeInsets.fromLTRB(6, 10, 6, 10),
                          child: TileGrid(
                            children: [
                              for (final f in features)
                                FeatureTile(
                                  icon: f.icon,
                                  label: f.label,
                                  onTap: () {
                                    Navigator.of(context).pop();
                                    openErp(context, f.path);
                                  },
                                ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
