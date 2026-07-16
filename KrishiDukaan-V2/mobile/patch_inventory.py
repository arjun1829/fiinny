import re

with open('lib/features/dashboard/screens/inventory_screen.dart', 'r') as f:
    content = f.read()

# Add state variables to _AddListingSheetState
state_vars = """  bool _gstApplicable = false;
  double _gstRate = 18.0;
  String _sellMode = 'online_delivery';
"""
content = re.sub(r'(  File\? _imageFile;\n)', r'\1\n' + state_vars, content)

# When a catalog product is selected in _AddListingSheetState, populate gst and sellMode
select_catalog = """
                              setState(() {
                                _selectedCatalog = c;
                                _nameCtrl.text = c.name;
                                _category = c.category;
                                _descCtrl.text = c.description ?? '';
                                _priceCtrl.text = c.price.toStringAsFixed(0);
                                _variants.clear();
                                if (c.variants != null) {
                                  _variants.addAll(c.variants!);
                                }
                                _sellMode = c.sellMode ?? 'online_delivery';
                                _gstApplicable = c.gstApplicable ?? false;
                                _gstRate = c.gstRate ?? 18.0;
                                _suggestions = [];
                              });
"""
# We'll replace the existing setState for _selectedCatalog. Let's find it.
old_set_state = """                              setState(() {
                                _selectedCatalog = c;
                                _nameCtrl.text = c.name;
                                _category = c.category;
                                _descCtrl.text = c.description ?? '';
                                _priceCtrl.text = c.price.toStringAsFixed(0);
                                _variants.clear();
                                if (c.variants != null) {
                                  _variants.addAll(c.variants!);
                                }
                                _suggestions = [];
                              });"""
content = content.replace(old_set_state, select_catalog)

# Add to _save data in _AddListingSheetState
save_data = """          'sellMode': _sellMode,
          'gstApplicable': _gstApplicable,
          'gstRate': _gstRate,
"""
# The save method creates a Map<String, dynamic> data.
content = re.sub(r"('variants': _variants\.map\(\(v\) => v\.toMap\(\)\)\.toList\(\),\n)", r'\1' + save_data, content, count=1)


# UI fields for _AddListingSheetState
ui_fields = """
                const SizedBox(height: 16),
                Text('Delivery & GST', style: AppTextStyles.heading3),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: _sellMode,
                  decoration: InputDecoration(
                    labelText: 'Sell Mode',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'online_delivery', child: Text('Online Delivery')),
                    DropdownMenuItem(value: 'offline_store_only', child: Text('Offline Store Only')),
                  ],
                  onChanged: (val) {
                    if (val != null) setState(() => _sellMode = val);
                  },
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  title: const Text('GST Applicable'),
                  value: _gstApplicable,
                  onChanged: (val) => setState(() => _gstApplicable = val),
                  contentPadding: EdgeInsets.zero,
                ),
                if (_gstApplicable)
                  DropdownButtonFormField<double>(
                    value: _gstRate,
                    decoration: InputDecoration(
                      labelText: 'GST Rate (%)',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    items: [0.0, 5.0, 12.0, 18.0, 28.0]
                        .map((r) => DropdownMenuItem(value: r, child: Text('$r%')))
                        .toList(),
                    onChanged: (val) {
                      if (val != null) setState(() => _gstRate = val);
                    },
                  ),
                const SizedBox(height: 24),
"""
content = re.sub(r'(                SizedBox\(\n\s*width: double.infinity,\n\s*child: FilledButton\(\n\s*onPressed: _saving \? null : _save,\n\s*child: _saving)', ui_fields + r'\1', content, count=1)


# Now for _EditListingSheetState
edit_state_vars = """  late bool _gstApplicable;
  late double _gstRate;
  late String _sellMode;
"""
content = re.sub(r'(  late bool _isActive;\n)', r'\1' + edit_state_vars, content)

edit_init_vars = """    _gstApplicable = widget.listing.gstApplicable ?? false;
    _gstRate = widget.listing.gstRate ?? 18.0;
    _sellMode = widget.listing.sellMode ?? 'online_delivery';
"""
content = re.sub(r'(    _isActive = widget\.listing\.isActive;\n)', r'\1' + edit_init_vars, content)

edit_save_data = """          'sellMode': _sellMode,
          'gstApplicable': _gstApplicable,
          'gstRate': _gstRate,
"""
content = re.sub(r"('variants': _variants\.map\(\(v\) => v\.toMap\(\)\)\.toList\(\),\n)", r'\1' + edit_save_data, content) # This will replace the 2nd occurrence in EditListingSheet

content = re.sub(r'(                SizedBox\(\n\s*width: double.infinity,\n\s*child: FilledButton\(\n\s*onPressed: _saving \? null : _save,\n\s*child: _saving)', ui_fields + r'\1', content)

with open('lib/features/dashboard/screens/inventory_screen.dart', 'w') as f:
    f.write(content)
