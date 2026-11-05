import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/constants/indian_states.dart';
import '../../../core/models/product_licence.dart';

/// "Selling licence" on a manufacturer's product — same as web's
/// ProductLicenceSection: the states the product may be delivered to
/// (checkout enforces it, for the manufacturer and their network retailers),
/// the licence number / validity and a photo of the licence. The photo goes
/// to the manufacturer's private `kyc/{phone}/` folder, like KYC documents;
/// a PDF can be uploaded from the website.
class ProductLicenceSection extends StatefulWidget {
  final ProductLicence? value;
  final ValueChanged<ProductLicence?> onChanged;
  final String manufacturerPhone;

  /// Online delivery is switched on — the licence is needed then.
  final bool wantsOnline;
  final bool enabled;

  const ProductLicenceSection({
    super.key,
    required this.value,
    required this.onChanged,
    required this.manufacturerPhone,
    required this.wantsOnline,
    this.enabled = true,
  });

  @override
  State<ProductLicenceSection> createState() => _ProductLicenceSectionState();
}

class _ProductLicenceSectionState extends State<ProductLicenceSection> {
  late final _numberCtrl = TextEditingController(text: widget.value?.number ?? '');
  bool _uploading = false;
  String? _error;

  ProductLicence get _lic => widget.value ?? const ProductLicence();

  void _set(ProductLicence next) => widget.onChanged(next.isEmpty ? null : next);

  @override
  void dispose() {
    _numberCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickStates() async {
    final chosen = Set<String>.of(_lic.states);
    final result = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(ctx).height * 0.75,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 8, 4),
                  child: Row(
                    children: [
                      Expanded(child: Text('Licensed states', style: AppTextStyles.heading3)),
                      TextButton(
                        onPressed: () => setSheet(() => chosen.addAll(kIndianStates)),
                        child: const Text('All India'),
                      ),
                      TextButton(
                        onPressed: () => setSheet(chosen.clear),
                        child: const Text('Clear'),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    children: [
                      for (final s in kIndianStates)
                        CheckboxListTile(
                          dense: true,
                          value: chosen.contains(s),
                          title: Text(s),
                          onChanged: (v) => setSheet(() => v == true ? chosen.add(s) : chosen.remove(s)),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => Navigator.pop(sheetCtx, chosen),
                      child: Text('Done (${chosen.length} selected)'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (result != null) {
      _set(_lic.copyWith(states: kIndianStates.where(result.contains).toList()));
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = DateTime.tryParse(_lic.validUntil ?? '') ?? now.add(const Duration(days: 365));
    final d = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 20),
    );
    if (d != null) _set(_lic.copyWith(validUntil: DateFormat('yyyy-MM-dd').format(d)));
  }

  Future<void> _upload(ImageSource source) async {
    setState(() => _error = null);
    final phone = widget.manufacturerPhone.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'No phone number on your account — complete your profile first.');
      return;
    }
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 80, maxWidth: 2200);
    if (picked == null) return;
    final file = File(picked.path);
    final size = await file.length();
    if (size > 10 * 1024 * 1024) {
      setState(() => _error = 'That photo is larger than 10 MB.');
      return;
    }
    setState(() => _uploading = true);
    try {
      final path = 'kyc/$phone/licence_${DateTime.now().millisecondsSinceEpoch}.jpg';
      await FirebaseStorage.instance.ref(path).putFile(file, SettableMetadata(contentType: 'image/jpeg'));
      _set(_lic.copyWith(file: {
        'storagePath': path,
        'fileName': picked.name,
        'contentType': 'image/jpeg',
        'size': size,
      }));
    } catch (_) {
      if (mounted) {
        setState(() => _error = "Upload failed. Only the manufacturer's own login can upload its licence.");
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _view() async {
    final path = _lic.file?['storagePath']?.toString();
    if (path == null) return;
    try {
      final url = await FirebaseStorage.instance.ref(path).getDownloadURL();
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) setState(() => _error = "Couldn't open the licence.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final lic = _lic;
    final complete = widget.value?.isComplete ?? false;
    final expired = widget.value?.isExpired ?? false;
    final (String status, Color color) = widget.value == null
        ? ('Licence missing', AppColors.warning)
        : !complete
            ? (lic.file == null ? 'Upload the licence' : 'Choose the states', AppColors.warning)
            : expired
                ? ('Licence expired', AppColors.error)
                : (
                    lic.states.length == kIndianStates.length
                        ? 'Licensed for all of India'
                        : 'Licensed for ${lic.states.length} state${lic.states.length == 1 ? '' : 's'}',
                    AppColors.success,
                  );

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.verified_user_outlined, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text('Selling licence', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(status, style: AppTextStyles.caption.copyWith(color: color, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Customers can order this product online only for addresses in the states your licence covers. '
            'Retailers in your network follow the same states. In-store sales are not affected.',
            style: AppTextStyles.caption,
          ),
          if (widget.wantsOnline && !complete) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'To sell this product online, upload its licence and choose the states it covers.',
                style: AppTextStyles.caption.copyWith(color: AppColors.onSurface, fontWeight: FontWeight.w600),
              ),
            ),
          ],
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: widget.enabled ? _pickStates : null,
            icon: const Icon(Icons.map_outlined, size: 18),
            label: Text(lic.states.isEmpty
                ? 'Choose licensed states *'
                : lic.states.length <= 3
                    ? lic.states.join(', ')
                    : '${lic.states.take(2).join(', ')} +${lic.states.length - 2} more'),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _numberCtrl,
                  enabled: widget.enabled,
                  maxLength: 60,
                  decoration: const InputDecoration(
                    labelText: 'Licence number',
                    counterText: '',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (v) => _set(_lic.copyWith(number: v)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  onPressed: widget.enabled ? _pickDate : null,
                  child: Text(lic.validUntil == null ? 'Valid until' : 'Valid until ${lic.validUntil}'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton.tonalIcon(
                onPressed: widget.enabled && !_uploading ? () => _upload(ImageSource.camera) : null,
                icon: _uploading
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.photo_camera_outlined, size: 18),
                label: Text(lic.file == null ? 'Photo of licence *' : 'Retake'),
              ),
              TextButton.icon(
                onPressed: widget.enabled && !_uploading ? () => _upload(ImageSource.gallery) : null,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('From gallery'),
              ),
              if (lic.file != null)
                TextButton.icon(
                  onPressed: _view,
                  icon: const Icon(Icons.description_outlined, size: 18),
                  label: Text(lic.fileName ?? 'View licence', overflow: TextOverflow.ellipsis),
                ),
            ],
          ),
          Text('Kept private. A PDF licence can be uploaded from the website.', style: AppTextStyles.caption),
          if (_error != null) ...[
            const SizedBox(height: 6),
            Text(_error!, style: AppTextStyles.caption.copyWith(color: AppColors.error, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}
