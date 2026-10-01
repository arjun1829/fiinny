import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../widgets/online_delivery_terms_dialog.dart';

/// Validates the Indian 15-character GSTIN format — identical regex to web's
/// isValidGstinFormat (app/dashboard/_lib/profile-persistence.ts), so a
/// number good enough for the web toggle is good enough for this one.
bool _isValidGstin(String gstin) {
  return RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
      .hasMatch(gstin.trim().toUpperCase());
}

/// Home for account settings that don't belong on the main Profile screen
/// (currently just Language) — moved out of Profile to keep that screen a
/// lean account menu, with room for more settings later without cluttering
/// Profile again.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final isHindi = locale.languageCode == 'hi';
    final user = ref.watch(currentUserProvider).value;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Settings',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _Card(
            title: 'Language',
            children: [
              _LanguageTile(
                label: 'English',
                selected: !isHindi,
                onTap: () => ref
                    .read(localeProvider.notifier)
                    .setLocale(const Locale('en')),
              ),
              _LanguageTile(
                label: 'हिंदी (Hindi)',
                selected: isHindi,
                onTap: () => ref
                    .read(localeProvider.notifier)
                    .setLocale(const Locale('hi')),
              ),
            ],
          ),
          // Sellers only — a consumer account has nothing to sell online.
          if (user != null && user.isSeller) ...[
            const SizedBox(height: 16),
            _Card(
              title: isHindi ? 'ऑनलाइन बिक्री' : 'Online Selling',
              children: [
                _OnlineDeliveryToggle(
                  sellerPhone: user.phone,
                  isManufacturer: user.isManufacturer,
                  isHindi: isHindi,
                  gstin: user.gstin,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// One switch that turns the seller's online selling on or off across their
/// WHOLE catalogue, so they never have to edit every product individually.
///
/// Writes the same `onlineDelivery` flag web reads (users/ + profiles/ +
/// retailers|manufacturers/), so the two platforms always agree — see
/// DashboardRepository.setAccountOnlineDelivery.
class _OnlineDeliveryToggle extends ConsumerStatefulWidget {
  final String sellerPhone;
  final bool isManufacturer;
  final bool isHindi;
  /// From users/{phone} via currentUserProvider — may be stale/empty for an
  /// account whose GST was only ever saved to the role doc (see
  /// profile_edit_screen.dart's own prefill comment); _ensureGstThenEnable
  /// falls back to that doc before concluding it's really missing.
  final String? gstin;

  const _OnlineDeliveryToggle({
    required this.sellerPhone,
    required this.isManufacturer,
    required this.isHindi,
    required this.gstin,
  });

  @override
  ConsumerState<_OnlineDeliveryToggle> createState() =>
      _OnlineDeliveryToggleState();
}

class _OnlineDeliveryToggleState extends ConsumerState<_OnlineDeliveryToggle> {
  final _repo = DashboardRepository();
  bool? _enabled;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final value = await _repo.fetchAccountOnlineDelivery(
      widget.sellerPhone,
      isManufacturer: widget.isManufacturer,
    );
    if (mounted) setState(() => _enabled = value);
  }

  /// Turning ON always routes through the GST-confirm sheet, pre-filled with
  /// the existing GST if there is one — matching web (app/dashboard/profile/
  /// page.tsx: checking the box ALWAYS enters "pending-enable" mode,
  /// regardless of whether form.gstin is already valid, it only pre-fills
  /// the input). Saving that step always opens the Consent Form terms
  /// dialog; only agreeing there actually flips the account flag. Turning
  /// off is never gated.
  Future<void> _onChanged(bool value) async {
    if (!value) {
      await _set(false);
      return;
    }

    var gstin = (widget.gstin ?? '').trim();
    if (!_isValidGstin(gstin)) {
      // The users/{phone} mirror can lag behind the role doc — check there
      // so the sheet still pre-fills correctly (same fallback profile_edit_
      // screen.dart already relies on).
      try {
        final col = widget.isManufacturer ? 'manufacturers' : 'retailers';
        final snap = await FirebaseFirestore.instance
            .collection(col)
            .doc(widget.sellerPhone)
            .get();
        gstin = (snap.data()?['gstin'] as String? ?? '').trim();
      } catch (_) {
        // Fall through — treated as still missing.
      }
    }

    if (!mounted) return;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _GstRequiredSheet(
        sellerPhone: widget.sellerPhone,
        isManufacturer: widget.isManufacturer,
        isHindi: widget.isHindi,
        initialGstin: gstin,
      ),
    );
    if (saved == true) {
      // The sheet itself already wrote gstin + onlineDelivery via
      // enableOnlineDeliveryWithGst after the terms dialog was agreed to —
      // just refresh local UI state to reflect it, no second write.
      if (mounted) setState(() => _enabled = true);
    }
  }

  Future<void> _set(bool value) async {
    final previous = _enabled;
    // Optimistic: the switch should feel instant, but revert on failure so it
    // never shows a state the server didn't accept.
    setState(() {
      _enabled = value;
      _saving = true;
    });
    try {
      await _repo.setAccountOnlineDelivery(
        widget.sellerPhone,
        enabled: value,
        isManufacturer: widget.isManufacturer,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(value
              ? 'Online selling turned on.'
              : 'Online selling turned off for all your products.'),
          backgroundColor: AppColors.primary,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _enabled = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not update: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isHindi = widget.isHindi;
    if (_enabled == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      value: _enabled!,
      activeThumbColor: AppColors.primary,
      onChanged: _saving ? null : _onChanged,
      title: Text(
        isHindi ? 'ऑनलाइन डिलीवरी' : 'Online delivery',
        style: AppTextStyles.bodyMedium,
      ),
      subtitle: Text(
        _enabled!
            ? (isHindi
                ? 'ग्राहक आपके उत्पाद ऑनलाइन ऑर्डर कर सकते हैं।'
                : 'Customers can order your products online.')
            : (isHindi
                ? 'ऑनलाइन ऑर्डर बंद हैं। आपकी दुकान अब भी दिखेगी।'
                : 'Online ordering is off. Your store still stays listed.'),
        style: AppTextStyles.bodySmall
            .copyWith(color: AppColors.onSurfaceVariant),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Card({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _LanguageTile extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _LanguageTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? AppColors.primary : AppColors.onSurfaceVariant,
              size: 20,
            ),
            const SizedBox(width: 10),
            Text(label, style: AppTextStyles.bodyMedium),
          ],
        ),
      ),
    );
  }
}

/// Inline "enter GST to go online" prompt — mirrors web's pending-enable
/// panel on /dashboard/profile: same requirement, same format check, but
/// collected without leaving Settings. Pops `true` once saved so the caller
/// can proceed to actually enable the toggle.
class _GstRequiredSheet extends StatefulWidget {
  final String sellerPhone;
  final bool isManufacturer;
  final bool isHindi;
  final String initialGstin;

  const _GstRequiredSheet({
    required this.sellerPhone,
    required this.isManufacturer,
    required this.isHindi,
    this.initialGstin = '',
  });

  @override
  State<_GstRequiredSheet> createState() => _GstRequiredSheetState();
}

class _GstRequiredSheetState extends State<_GstRequiredSheet> {
  late final _ctrl = TextEditingController(text: widget.initialGstin);
  final _repo = DashboardRepository();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final gstin = _ctrl.text.trim().toUpperCase();
    if (gstin.isEmpty) {
      setState(() => _error = widget.isHindi
          ? 'ऑनलाइन डिलीवरी चालू करने के लिए GST नंबर आवश्यक है.'
          : 'GST Number is required to enable Online Delivery.');
      return;
    }
    if (!_isValidGstin(gstin)) {
      setState(() => _error = widget.isHindi
          ? 'अमान्य GST फॉर्मेट — जैसे 27AAAAA0000A1Z5.'
          : 'Invalid GST format — expected 15 characters, e.g. 27AAAAA0000A1Z5.');
      return;
    }

    // Matches web's handleSaveGstAndEnable: the Consent Form always opens
    // here, on every save, before anything is written.
    final acceptance = await OnlineDeliveryTermsDialog.show(
      context,
      isHindi: widget.isHindi,
    );
    if (acceptance == null) return;

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _repo.enableOnlineDeliveryWithGst(
        widget.sellerPhone,
        isManufacturer: widget.isManufacturer,
        gstin: gstin,
        termsAcceptance: acceptance,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = widget.isHindi
              ? 'सेव नहीं हो सका. दोबारा कोशिश करें.'
              : 'Could not save. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isHindi = widget.isHindi;
    final valid = _isValidGstin(_ctrl.text);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.receipt_long_outlined,
                      color: AppColors.primary, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    isHindi ? 'GST नंबर आवश्यक' : 'GST Number Required',
                    style: AppTextStyles.heading3,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                isHindi
                    ? 'ऑनलाइन डिलीवरी, इनवॉइसिंग और GST अनुपालन के लिए आपका GSTIN आवश्यक है.'
                    : 'Your GSTIN is required for Online Delivery, invoicing, and GST compliance. It will be stored on your account.',
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurfaceVariant),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _ctrl,
                autofocus: true,
                maxLength: 15,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [
                  LengthLimitingTextInputFormatter(15),
                  FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
                  TextInputFormatter.withFunction(
                    (oldValue, newValue) =>
                        newValue.copyWith(text: newValue.text.toUpperCase()),
                  ),
                ],
                onChanged: (_) {
                  setState(() => _error = null);
                },
                decoration: InputDecoration(
                  labelText: 'GSTIN',
                  hintText: 'e.g. 27AAAAA0000A1Z5',
                  counterText: '',
                  filled: true,
                  fillColor: Colors.white,
                  suffixIcon: _ctrl.text.isEmpty
                      ? null
                      : Icon(
                          valid ? Icons.check_circle : Icons.cancel,
                          color: valid ? AppColors.success : AppColors.error,
                        ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!,
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.error)),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: _saving ? null : _save,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _saving
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : Text(isHindi
                              ? 'सेव करें और चालू करें'
                              : 'Save & Enable'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _saving
                        ? null
                        : () => Navigator.of(context).pop(false),
                    child: Text(isHindi ? 'रद्द करें' : 'Cancel'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
