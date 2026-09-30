import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/location_service.dart';
import '../../expenses/data/bill_image.dart';
import '../data/dealer.dart';

/// What the rep entered, plus the photo they attached (if any).
class DealerDraft {
  final DealerInput input;
  final BillImage? image;
  const DealerDraft(this.input, this.image);
}

/// Add / edit sheet for the dealer master.
///
/// Returns the [DealerDraft] to save, or null if dismissed — the caller owns
/// the write so the list can refresh itself once.
class DealerFormSheet extends StatefulWidget {
  const DealerFormSheet({super.key, this.initial});

  final Dealer? initial;

  static Future<DealerDraft?> show(BuildContext context, {Dealer? initial}) {
    return showModalBottomSheet<DealerDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => DealerFormSheet(initial: initial),
    );
  }

  @override
  State<DealerFormSheet> createState() => _DealerFormSheetState();
}

class _DealerFormSheetState extends State<DealerFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _shop;
  late final TextEditingController _owner;
  late final TextEditingController _phone;
  late final TextEditingController _address;
  late DealerType _type;
  DealerInterest? _interest;

  LatLngPoint? _geo;
  bool _locating = false;
  String? _geoError;

  BillImage? _image;

  bool get _isEdit => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final d = widget.initial;
    _shop = TextEditingController(text: d?.shopName ?? '');
    _owner = TextEditingController(text: d?.ownerName ?? '');
    _phone = TextEditingController(text: d?.phone ?? '');
    _address = TextEditingController(text: d?.address ?? '');
    _type = d?.type ?? DealerType.retailer;
    _interest = d?.interest;
    _geo = d?.geo;
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      // Same resize as the expense bill picker: legible on a phone screen
      // while staying well inside the Storage rule's size cap.
      maxWidth: 1600,
      imageQuality: 75,
    );
    if (picked == null) return;
    final image = await BillImage.fromXFile(picked);
    if (mounted) setState(() => _image = image);
  }

  @override
  void dispose() {
    _shop.dispose();
    _owner.dispose();
    _phone.dispose();
    _address.dispose();
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
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_geo == null) {
      setState(
        () => _geoError =
            'Capture the shop location — it is what puts this dealer on your route map.',
      );
      return;
    }
    Navigator.pop(
      context,
      DealerDraft(
        DealerInput(
          shopName: _shop.text,
          ownerName: _owner.text,
          phone: _phone.text,
          address: _address.text,
          type: _type,
          geo: _geo,
          interest: _interest,
        ),
        _image,
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
        initialChildSize: 0.92,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, controller) => Form(
          key: _formKey,
          child: ListView(
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
                    child: Text(
                      _isEdit ? 'Edit Dealer' : 'Add Dealer',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, size: 20),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              const _Label('Type'),
              SegmentedButton<DealerType>(
                segments: [
                  for (final t in DealerType.values)
                    ButtonSegment(value: t, label: Text(t.label)),
                ],
                selected: {_type},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() => _type = s.first),
                style: SegmentedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 18),

              Row(
                children: [
                  const _Label('Dealer Interest'),
                  const SizedBox(width: 4),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: _HelperIcon(
                      message:
                          "Records the dealer's current level of interest in "
                          'KrishiDukaan / our platform or services.',
                    ),
                  ),
                ],
              ),
              // Same widget as the Type selector, with emptySelectionAllowed
              // so it can represent "not assessed yet" — SegmentedButton
              // otherwise always requires a non-empty selection. Tapping the
              // selected segment again clears it back to empty for free.
              SegmentedButton<DealerInterest>(
                segments: [
                  for (final i in DealerInterest.values)
                    ButtonSegment(value: i, label: Text(i.label)),
                ],
                selected: _interest == null ? const {} : {_interest!},
                emptySelectionAllowed: true,
                showSelectedIcon: false,
                onSelectionChanged: (s) =>
                    setState(() => _interest = s.isEmpty ? null : s.first),
                style: SegmentedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 18),

              const _Label('Shop name'),
              TextFormField(
                controller: _shop,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  hintText: 'e.g. Sharma Agro Store',
                ),
                validator: (v) => (v?.trim().isEmpty ?? true)
                    ? 'Shop name is required.'
                    : null,
              ),
              const SizedBox(height: 14),

              const _Label('Owner name'),
              TextFormField(
                controller: _owner,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  hintText: 'e.g. Ramesh Sharma',
                ),
                validator: (v) => (v?.trim().isEmpty ?? true)
                    ? 'Owner name is required.'
                    : null,
              ),
              const SizedBox(height: 14),

              const _Label('Phone'),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                decoration: const InputDecoration(
                  hintText: '10-digit mobile number',
                  prefixText: '+91 ',
                ),
                validator: (v) {
                  final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                  if (digits.isEmpty) return 'Phone number is required.';
                  if (digits.length != 10) {
                    return 'Enter a valid 10-digit mobile number.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),

              const _Label('Address'),
              TextFormField(
                controller: _address,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Shop address, village/town, district',
                ),
                validator: (v) =>
                    (v?.trim().isEmpty ?? true) ? 'Address is required.' : null,
              ),
              const SizedBox(height: 18),

              const _Label('Shop location'),
              _LocationButton(
                geo: _geo,
                busy: _locating,
                error: _geoError,
                onTap: _capture,
              ),

              const SizedBox(height: 18),
              const _Label('Shop photo'),
              _DealerImagePicker(
                image: _image,
                existingUrl: widget.initial?.imageUrl,
                onCamera: () => _pickImage(ImageSource.camera),
                onGallery: () => _pickImage(ImageSource.gallery),
                onClear: () => setState(() => _image = null),
              ),

              const SizedBox(height: 26),
              FilledButton(
                onPressed: _submit,
                child: Text(_isEdit ? 'Save Changes' : 'Add Dealer'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Info icon that opens a compact explanatory popover on tap — a lighter,
/// smaller alternative to Flutter's default [Tooltip], which renders as a
/// large opaque black box wide enough to shove surrounding fields around.
class _HelperIcon extends StatefulWidget {
  const _HelperIcon({required this.message});

  final String message;

  @override
  State<_HelperIcon> createState() => _HelperIconState();
}

class _HelperIconState extends State<_HelperIcon> {
  final _link = LayerLink();
  OverlayEntry? _entry;

  void _toggle() => _entry == null ? _open() : _close();

  void _open() {
    final overlay = Overlay.of(context);
    _entry = OverlayEntry(
      builder: (_) => Stack(
        children: [
          // Tapping anywhere outside the popover closes it.
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: _close,
            ),
          ),
          CompositedTransformFollower(
            link: _link,
            targetAnchor: Alignment.bottomLeft,
            followerAnchor: Alignment.topLeft,
            offset: const Offset(-8, 6),
            child: _PopoverCard(message: widget.message),
          ),
        ],
      ),
    );
    overlay.insert(_entry!);
  }

  void _close() {
    _entry?.remove();
    _entry = null;
  }

  @override
  void dispose() {
    _close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _link,
      child: GestureDetector(
        onTap: _toggle,
        behavior: HitTestBehavior.opaque,
        child: const Padding(
          padding: EdgeInsets.all(2),
          child: Icon(
            Icons.info_outline_rounded,
            size: 15,
            color: AppColors.outline,
          ),
        ),
      ),
    );
  }
}

/// The popover itself — light surface, subtle border/shadow, compact width,
/// with a fade+scale-in so it doesn't just snap into view.
class _PopoverCard extends StatelessWidget {
  const _PopoverCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 140),
      curve: Curves.easeOut,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.scale(
          scale: 0.92 + (0.08 * t),
          alignment: Alignment.topLeft,
          child: child,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 240,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.divider),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.10),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Text(
            message,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.onSurface,
              height: 1.4,
            ),
          ),
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
    padding: const EdgeInsets.only(bottom: 7),
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

class _LocationButton extends StatelessWidget {
  const _LocationButton({
    required this.geo,
    required this.busy,
    required this.error,
    required this.onTap,
  });

  final LatLngPoint? geo;
  final bool busy;
  final String? error;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ok = geo != null;
    final color = error != null
        ? AppColors.error
        : ok
        ? AppColors.success
        : AppColors.onSurfaceVariant;
    final background = error != null
        ? AppColors.errorContainer
        : ok
        ? AppColors.successContainer
        : AppColors.surfaceContainerLow;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Material(
          color: background,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: busy ? null : onTap,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
              child: Row(
                children: [
                  if (busy)
                    const SizedBox(
                      height: 17,
                      width: 17,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    )
                  else
                    Icon(
                      ok
                          ? Icons.check_circle_rounded
                          : Icons.my_location_rounded,
                      size: 18,
                      color: color,
                    ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      busy
                          ? 'Getting location…'
                          : ok
                          ? 'Captured · ${geo!.lat.toStringAsFixed(5)}, ${geo!.lng.toStringAsFixed(5)}'
                          : 'Use current location',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                  ),
                  if (ok && !busy)
                    const Text(
                      'Retake',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 7, left: 4),
            child: Text(
              error!,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.error,
                height: 1.35,
              ),
            ),
          ),
      ],
    );
  }
}

class _DealerImagePicker extends StatelessWidget {
  const _DealerImagePicker({
    required this.image,
    required this.existingUrl,
    required this.onCamera,
    required this.onGallery,
    required this.onClear,
  });

  final BillImage? image;
  final String? existingUrl;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    if (image != null) {
      return Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Image.memory(
              image!.bytes,
              height: 170,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: Material(
              color: Colors.black54,
              shape: const CircleBorder(),
              child: InkWell(
                onTap: onClear,
                customBorder: const CircleBorder(),
                child: const Padding(
                  padding: EdgeInsets.all(6),
                  child: Icon(
                    Icons.close_rounded,
                    size: 17,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (existingUrl != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Image.network(
              existingUrl!,
              height: 170,
              width: double.infinity,
              fit: BoxFit.cover,
              // A missing/invalid URL must not block the rest of the form.
              errorBuilder: (_, _, _) => Container(
                height: 170,
                width: double.infinity,
                color: AppColors.surfaceContainerLow,
                alignment: Alignment.center,
                child: const Icon(
                  Icons.broken_image_outlined,
                  color: AppColors.outline,
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Choosing a new photo replaces this one.',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.onSurfaceVariant,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 10),
        ],
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onCamera,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text('Camera'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onGallery,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('Gallery'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
