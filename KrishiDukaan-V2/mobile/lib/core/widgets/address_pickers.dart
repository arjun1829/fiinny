import 'dart:async';

import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import '../constants/app_config.dart';
import '../constants/app_text_styles.dart';
import '../services/address_locator.dart';
import '../services/places_service.dart';

/// "Search your address" — Google Places suggestions as you type, so nobody has
/// to type a full address by hand. Picking one hands back structured
/// [AddressFields] (area, city, district, state, pincode) for the form to fill —
/// the same behaviour the website's checkout has.
class AddressSearchField extends StatefulWidget {
  const AddressSearchField({
    super.key,
    required this.onSelected,
    this.label = 'Search your address, village or landmark',
  });

  final ValueChanged<AddressFields> onSelected;
  final String label;

  @override
  State<AddressSearchField> createState() => _AddressSearchFieldState();
}

class _AddressSearchFieldState extends State<AddressSearchField> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<PlaceSuggestion> _suggestions = const [];
  bool _searching = false;
  bool _resolving = false;
  // Guards against a slow earlier response landing after a newer query.
  int _seq = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    if (value.trim().length < 3) {
      setState(() {
        _suggestions = const [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final seq = ++_seq;
      // No type filter: a village, a locality and a landmark are all valid here.
      final results = await PlacesService.autocomplete(
          value, AppConfig.googleMapsApiKey,
          types: '');
      if (!mounted || seq != _seq) return;
      setState(() {
        _suggestions = results.take(5).toList();
        _searching = false;
      });
    });
  }

  Future<void> _pick(PlaceSuggestion s) async {
    setState(() {
      _resolving = true;
      _suggestions = const [];
    });
    final details =
        await PlacesService.getDetails(s.placeId, AppConfig.googleMapsApiKey);
    if (!mounted) return;
    setState(() => _resolving = false);
    if (details == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not load that address. Please try another.')));
      return;
    }
    final fields = addressFromPlace(details);
    _ctrl.text = s.description;
    widget.onSelected(fields);
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _ctrl,
          onChanged: _onChanged,
          textInputAction: TextInputAction.search,
          style: AppTextStyles.body,
          decoration: InputDecoration(
            labelText: widget.label,
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: (_searching || _resolving)
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : null,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.primary, width: 2),
            ),
            filled: true,
            fillColor: AppColors.background,
            isDense: true,
          ),
        ),
        if (_suggestions.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.divider),
            ),
            child: Column(
              children: [
                for (var i = 0; i < _suggestions.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.place_outlined,
                        size: 18, color: AppColors.primary),
                    title: Text(_suggestions[i].description,
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    onTap: () => _pick(_suggestions[i]),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

/// "Use my current location" — a GPS fix reverse-geocoded into address fields.
/// Explains (and offers a settings shortcut for) location off / blocked.
class UseMyLocationButton extends StatefulWidget {
  const UseMyLocationButton({super.key, required this.onLocated});

  final ValueChanged<AddressFields> onLocated;

  @override
  State<UseMyLocationButton> createState() => _UseMyLocationButtonState();
}

class _UseMyLocationButtonState extends State<UseMyLocationButton> {
  bool _busy = false;

  Future<void> _locate() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final fields = await AddressLocator.current();
      if (!mounted) return;
      widget.onLocated(fields);
      messenger.showSnackBar(SnackBar(
        content: Text(fields.formatted.isEmpty && fields.city.isEmpty
            ? 'Location found, but the address could not be read. Please type it.'
            : 'Address filled from your location. Check it before continuing.'),
      ));
    } on AddressLocatorException catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(e.message),
        action: e.fix == LocationFix.none
            ? null
            : SnackBarAction(
                label: e.fix == LocationFix.locationSettings
                    ? 'Turn on'
                    : 'Settings',
                onPressed: () => AddressLocator.openFix(e.fix)),
      ));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(
          content: Text('Could not get your location. Please try again.')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: _busy ? null : _locate,
        icon: _busy
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.my_location, size: 18),
        label: Text(_busy ? 'Finding your location…' : 'Use my current location'),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary),
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}
