import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/location_service.dart';
import '../data/dealer.dart';
import '../data/dealer_visit.dart';

/// What the rep entered when marking a visit. The location is captured by the
/// sheet itself rather than passed in, so the coordinates belong to the moment
/// the visit was recorded.
class VisitDraft {
  final String purpose;
  final String? purposeOther;
  final String? notes;
  final LatLngPoint geo;

  const VisitDraft({
    required this.purpose,
    this.purposeOther,
    this.notes,
    required this.geo,
  });
}

class VisitFormSheet extends StatefulWidget {
  const VisitFormSheet({super.key, required this.dealer});

  final Dealer dealer;

  static Future<VisitDraft?> show(BuildContext context, Dealer dealer) {
    return showModalBottomSheet<VisitDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => VisitFormSheet(dealer: dealer),
    );
  }

  @override
  State<VisitFormSheet> createState() => _VisitFormSheetState();
}

class _VisitFormSheetState extends State<VisitFormSheet> {
  final _otherController = TextEditingController();
  final _notesController = TextEditingController();

  String? _purpose;
  LatLngPoint? _geo;
  bool _locating = true;
  String? _geoError;
  String? _formError;

  @override
  void initState() {
    super.initState();
    // Start the GPS fix immediately: it is the slowest part of logging a visit,
    // and by the time the rep has picked a purpose it is usually already done.
    _capture();
  }

  @override
  void dispose() {
    _otherController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    setState(() {
      _locating = true;
      _geoError = null;
    });
    try {
      final point = await LocationService.current();
      if (mounted) setState(() => _geo = point);
    } on LocationException catch (e) {
      if (mounted) setState(() => _geoError = e.message);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _submit() {
    if (_purpose == null) {
      setState(() => _formError = 'Select what this visit was for.');
      return;
    }
    if (_purpose == 'Other' && _otherController.text.trim().isEmpty) {
      setState(() => _formError = 'Describe the purpose of the visit.');
      return;
    }
    if (_geo == null) {
      setState(
        () => _formError = _locating
            ? 'Still getting your location — one moment.'
            : 'A visit cannot be recorded without your location.',
      );
      return;
    }
    Navigator.pop(
      context,
      VisitDraft(
        purpose: _purpose!,
        purposeOther: _otherController.text,
        notes: _notesController.text,
        geo: _geo!,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.86,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
          children: [
            Center(
              child: Container(
                height: 4,
                width: 40,
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Mark as Visited',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${widget.dealer.shopName} · ${widget.dealer.ownerName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 20),

            const _Label('Purpose'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in visitPurposes)
                  ChoiceChip(
                    label: Text(p),
                    selected: _purpose == p,
                    onSelected: (_) => setState(() {
                      _purpose = p;
                      _formError = null;
                    }),
                    labelStyle: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: _purpose == p ? Colors.white : AppColors.onSurface,
                    ),
                    selectedColor: AppColors.primary,
                    backgroundColor: AppColors.surfaceContainerLow,
                    side: BorderSide(
                      color: _purpose == p
                          ? AppColors.primary
                          : AppColors.divider,
                    ),
                    showCheckmark: false,
                  ),
              ],
            ),

            if (_purpose == 'Other') ...[
              const SizedBox(height: 18),
              const _Label('Describe the purpose'),
              TextField(
                controller: _otherController,
                autofocus: true,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Briefly describe why you visited',
                ),
                onChanged: (_) => setState(() => _formError = null),
              ),
            ],

            const SizedBox(height: 18),
            const _Label('Notes (optional)'),
            TextField(
              controller: _notesController,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Order discussed, stock seen, follow-up needed…',
              ),
            ),

            const SizedBox(height: 18),
            const _Label('Location'),
            _GeoStrip(
              busy: _locating,
              geo: _geo,
              error: _geoError,
              onRetry: _capture,
            ),

            if (_formError != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  color: AppColors.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _formError!,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.error,
                    height: 1.35,
                  ),
                ),
              ),
            ],

            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: _submit,
                    child: const Text('Mark as Visited'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.9,
        color: AppColors.onSurfaceVariant,
      ),
    ),
  );
}

class _GeoStrip extends StatelessWidget {
  const _GeoStrip({
    required this.busy,
    required this.geo,
    required this.error,
    required this.onRetry,
  });

  final bool busy;
  final LatLngPoint? geo;
  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ok = geo != null;
    final color = error != null
        ? AppColors.error
        : ok
        ? AppColors.success
        : AppColors.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: error != null
            ? AppColors.errorContainer
            : ok
            ? AppColors.successContainer
            : AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          if (busy)
            const SizedBox(
              height: 16,
              width: 16,
              child: CircularProgressIndicator(strokeWidth: 2.2),
            )
          else
            Icon(
              ok ? Icons.check_circle_rounded : Icons.location_off_rounded,
              size: 17,
              color: color,
            ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              busy
                  ? 'Getting your location…'
                  : ok
                  ? 'Location captured'
                  : (error ?? 'Location unavailable'),
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: color,
                height: 1.35,
              ),
            ),
          ),
          if (!busy && !ok)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                visualDensity: VisualDensity.compact,
                foregroundColor: AppColors.error,
              ),
              child: const Text('Retry'),
            ),
        ],
      ),
    );
  }
}
