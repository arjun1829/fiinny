import re

with open('lib/features/manufacturer/screens/manufacturer_catalog_screen.dart', 'r') as f:
    content = f.read()

# 1. Add state variables to _ProductSheetState
state_vars = """  bool _gstApplicable = false;
  double _gstRate = 18.0;
  String _sellMode = 'online_delivery';
"""
content = re.sub(r'(  late bool _isActive;)', r'\1\n' + state_vars, content)

# 2. Initialize from widget.product
init_vars = """    _gstApplicable = p?.gstApplicable ?? false;
    _gstRate = p?.gstRate ?? 18.0;
    _sellMode = p?.sellMode ?? 'online_delivery';
"""
content = re.sub(r'(    _isActive = p == null \? true : p\.isActive;)', r'\1\n' + init_vars, content)

# 3. Add to _save data
save_data = """        'sellMode': _sellMode,
        'gstApplicable': _gstApplicable,
        'gstRate': _gstRate,
"""
content = re.sub(r"('isActive': _isActive,\n\s*};\n)", r'\1' + save_data, content)

# 4. Add UI fields before the Save button
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
# Find the save button area
content = re.sub(r'(                SizedBox\(\n\s*width: double.infinity,\n\s*child: FilledButton\()', ui_fields + r'\1', content)

with open('lib/features/manufacturer/screens/manufacturer_catalog_screen.dart', 'w') as f:
    f.write(content)

