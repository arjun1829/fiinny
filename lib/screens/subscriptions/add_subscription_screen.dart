import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lifemap/models/subscription_item.dart';
import 'package:lifemap/services/subscription_service.dart';

class AddSubscriptionScreen extends StatefulWidget {
  final String userId;
  final SubscriptionItem? existingItem; // For editing

  const AddSubscriptionScreen(
      {super.key, required this.userId, this.existingItem});

  @override
  State<AddSubscriptionScreen> createState() => _AddSubscriptionScreenState();
}

class _AddSubscriptionScreenState extends State<AddSubscriptionScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _titleCtrl;
  late TextEditingController _amountCtrl;
  String _type = 'subscription';
  String _frequency = 'monthly';
  DateTime _startDate = DateTime.now();
  DateTime? _trialEndDate;

  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final item = widget.existingItem;
    _titleCtrl = TextEditingController(text: item?.title ?? '');
    _amountCtrl = TextEditingController(text: item?.amount.toString() ?? '');
    if (item != null) {
      _type = item.type;
      _frequency = item.frequency;
      _startDate = item.nextDueAt ?? DateTime.now();
      _trialEndDate = item.trialEndDate;
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isTrialEnd) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: isTrialEnd ? (_trialEndDate ?? now) : _startDate,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null && mounted) {
      setState(() {
        if (isTrialEnd) {
          _trialEndDate = picked;
        } else {
          _startDate = picked;
        }
      });
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

    try {
      final title = _titleCtrl.text.trim();
      final amount = double.tryParse(_amountCtrl.text.trim()) ?? 0.0;

      final newItem = SubscriptionItem(
        id: widget.existingItem?.id, // Null if new
        title: title,
        amount: amount,
        frequency: _frequency,
        provider: title, // simplification
        nextDueAt: _startDate,
        anchorDate: _startDate,
        category: 'Utilities', // default
        type: _type,
        trialEndDate: _trialEndDate,
        status: 'active',
        createdAt: widget.existingItem?.createdAt ?? DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final svc = SubscriptionService();
      if (widget.existingItem == null) {
        await svc.addSubscription(widget.userId, newItem);
      } else {
        await svc.updateSubscription(widget.userId, newItem);
      }

      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _delete() async {
    if (widget.existingItem == null) return;
    final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
              title: const Text('Delete?'),
              content: const Text('This cannot be undone.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Cancel')),
                TextButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Delete',
                        style: TextStyle(color: Colors.red))),
              ],
            ));

    if (confirm == true) {
      setState(() => _isLoading = true);
      try {
        await SubscriptionService()
            .deleteSubscription(widget.userId, widget.existingItem!.id!);
        if (mounted) Navigator.pop(context, true);
      } catch (e) {
        if (mounted) setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.existingItem != null;
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      appBar: AppBar(
        title: Text(isEditing ? 'Edit Commitment' : 'Add Commitment',
            style: GoogleFonts.outfit()),
        backgroundColor: Colors.transparent,
        actions: [
          if (isEditing)
            IconButton(
                icon: const Icon(Icons.delete, color: Colors.redAccent),
                onPressed: _isLoading ? null : _delete)
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _titleCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: Colors.white54),
                  enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.white24)),
                  focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.purpleAccent)),
                ),
                validator: (v) => v!.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _amountCtrl,
                style: const TextStyle(color: Colors.white),
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount (INR)',
                  labelStyle: TextStyle(color: Colors.white54),
                  enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.white24)),
                  focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.purpleAccent)),
                ),
                validator: (v) => v!.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _type,
                dropdownColor: Colors.grey[900],
                style: const TextStyle(color: Colors.white),
                items: const [
                  DropdownMenuItem(
                      value: 'subscription', child: Text('Subscription')),
                  DropdownMenuItem(value: 'bill', child: Text('Bill')),
                  DropdownMenuItem(value: 'trial', child: Text('Trial')),
                ],
                onChanged: (v) => setState(() => _type = v!),
                decoration: const InputDecoration(
                  labelText: 'Type',
                  labelStyle: TextStyle(color: Colors.white54),
                  enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.white24)),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _frequency,
                dropdownColor: Colors.grey[900],
                style: const TextStyle(color: Colors.white),
                items: const [
                  DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                  DropdownMenuItem(value: 'yearly', child: Text('Yearly')),
                  DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                  DropdownMenuItem(value: 'daily', child: Text('Daily')),
                ],
                onChanged: (v) => setState(() => _frequency = v!),
                decoration: const InputDecoration(
                  labelText: 'Frequency',
                  labelStyle: TextStyle(color: Colors.white54),
                  enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.white24)),
                ),
              ),
              const SizedBox(height: 16),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Next due / Start Date',
                    style: GoogleFonts.outfit(color: Colors.white54)),
                subtitle: Text(DateFormat('d MMM yyyy').format(_startDate),
                    style:
                        GoogleFonts.outfit(color: Colors.white, fontSize: 16)),
                trailing: const Icon(Icons.calendar_today,
                    color: Colors.purpleAccent),
                onTap: () => _pickDate(false),
              ),
              if (_type == 'trial') ...[
                const SizedBox(height: 16),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Trial Ends On',
                      style: GoogleFonts.outfit(color: Colors.white54)),
                  subtitle: Text(
                      _trialEndDate != null
                          ? DateFormat('d MMM yyyy').format(_trialEndDate!)
                          : 'Not set',
                      style: GoogleFonts.outfit(
                          color: Colors.white, fontSize: 16)),
                  trailing: const Icon(Icons.stars, color: Colors.orangeAccent),
                  onTap: () => _pickDate(true),
                ),
              ],
              const SizedBox(height: 32),
              SizedBox(
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.purpleAccent,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _isLoading ? null : _save,
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('Save Commitment'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
