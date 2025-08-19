import 'package:flutter/material.dart';
import '../models/asset_model.dart';
import '../services/asset_service.dart';

class AddAssetScreen extends StatefulWidget {
  final String userId;
  const AddAssetScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddAssetScreen> createState() => _AddAssetScreenState();
}

class _AddAssetScreenState extends State<AddAssetScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  final _purchaseValueController = TextEditingController();
  DateTime? _purchaseDate;
  final _notesController = TextEditingController();
  String _assetType = 'Investment'; // Or Property/Gold/Other

  bool _saving = false;

  Future<void> _saveAsset() async {
    if (!_formKey.currentState!.validate()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please fill all fields."), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final asset = AssetModel(
        userId: widget.userId,
        title: _titleController.text,
        value: double.tryParse(_amountController.text) ?? 0.0,
        assetType: _assetType,
        purchaseValue: double.tryParse(_purchaseValueController.text),
        purchaseDate: _purchaseDate,
        notes: _notesController.text,
        createdAt: DateTime.now(),
      );
      await AssetService().addAsset(asset);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Asset saved!"), backgroundColor: Colors.green),
      );
      Navigator.pop(context, true); // Trigger refresh
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to save asset: $e"), backgroundColor: Colors.red),
      );
    }
    setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Asset / Investment')),
      body: Padding(
        padding: const EdgeInsets.all(18.0),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: 'Asset Title (e.g., FD, Gold, Mutual Fund)'),
                validator: (val) => val == null || val.isEmpty ? 'Enter a title' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Current Value (₹)'),
                validator: (val) => val == null || val.isEmpty ? 'Enter value' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _assetType,
                decoration: const InputDecoration(labelText: "Asset Type"),
                items: ['Investment', 'Property', 'Gold', 'Other']
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => setState(() => _assetType = v!),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _purchaseValueController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Purchase Value (₹) [Optional]'),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Text(
                    _purchaseDate == null
                        ? "Purchase Date"
                        : "${_purchaseDate!.day}/${_purchaseDate!.month}/${_purchaseDate!.year}",
                  ),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: () async {
                      DateTime? picked = await showDatePicker(
                        context: context,
                        initialDate: DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) setState(() => _purchaseDate = picked);
                    },
                    child: const Text("Pick"),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _notesController,
                decoration: const InputDecoration(labelText: 'Notes (optional)'),
                minLines: 1,
                maxLines: 3,
              ),
              const Spacer(),
              _saving
                  ? const CircularProgressIndicator()
                  : ElevatedButton.icon(
                icon: const Icon(Icons.check),
                label: const Text("Add Asset"),
                onPressed: _saveAsset,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
