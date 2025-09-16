import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/asset_model.dart';
import '../services/asset_service.dart';

/// Step 2 of the Add Asset flow: fill details for stock/gold
/// Expects Navigator arguments: {'type': 'stock'|'gold'}
class AddAssetEntryScreen extends StatefulWidget {
  const AddAssetEntryScreen({super.key});

  @override
  State<AddAssetEntryScreen> createState() => _AddAssetEntryScreenState();
}

class _AddAssetEntryScreenState extends State<AddAssetEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _qtyCtrl = TextEditingController();
  final _avgCtrl = TextEditingController();
  DateTime _selectedDate = DateTime.now();

  late final String _type;
  final _service = AssetService();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = ModalRoute.of(context)?.settings.arguments as Map?;
    _type = args?['type'] ?? 'stock';
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2010),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _save() async {
    if (_formKey.currentState?.validate() ?? false) {
      final asset = AssetModel(
        type: _type,
        name: _nameCtrl.text.trim(),
        quantity: double.tryParse(_qtyCtrl.text.trim()) ?? 0,
        avgBuyPrice: double.tryParse(_avgCtrl.text.trim()) ?? 0,
        createdAt: _selectedDate,
      );
      await _service.addAsset(asset);
      if (mounted) Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = _type == 'stock' ? 'Add Stock' : 'Add Gold';

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_type == 'stock') ...[
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Symbol',
                  hintText: 'e.g., TCS, INFY',
                ),
                validator: (v) =>
                v == null || v.trim().isEmpty ? 'Enter a symbol' : null,
              ),
            ] else if (_type == 'gold') ...[
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Gold Type',
                  hintText: 'e.g., 24K, ETF',
                ),
                validator: (v) =>
                v == null || v.trim().isEmpty ? 'Enter gold type' : null,
              ),
            ],
            const SizedBox(height: 12),
            TextFormField(
              controller: _qtyCtrl,
              keyboardType:
              const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: _type == 'stock' ? 'Quantity (shares)' : 'Grams',
              ),
              validator: (v) =>
              (v == null || v.isEmpty) ? 'Enter a quantity' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _avgCtrl,
              keyboardType:
              const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: _type == 'stock'
                    ? 'Avg Buy Price per Share (₹)'
                    : 'Avg Buy Price per Gram (₹)',
              ),
              validator: (v) =>
              (v == null || v.isEmpty) ? 'Enter a price' : null,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Date: ${DateFormat.yMMMd().format(_selectedDate)}',
                    style: theme.textTheme.bodyLarge,
                  ),
                ),
                TextButton(
                  onPressed: _pickDate,
                  child: const Text('Select Date'),
                ),
              ],
            ),
            const SizedBox(height: 28),
            ElevatedButton.icon(
              onPressed: _save,
              icon: const Icon(Icons.save),
              label: const Text('Save Asset'),
            ),
          ],
        ),
      ),
    );
  }
}
