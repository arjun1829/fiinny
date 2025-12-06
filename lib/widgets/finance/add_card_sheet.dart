import 'package:flutter/material.dart';
import '../../models/credit_card_model.dart';
import '../../services/credit_card_service.dart';

class AddCardSheet extends StatefulWidget {
  final String userId;
  const AddCardSheet({super.key, required this.userId});

  @override
  State<AddCardSheet> createState() => _AddCardSheetState();
}

class _AddCardSheetState extends State<AddCardSheet> {
  final _formKey = GlobalKey<FormState>();
  final _cardNumberCtrl = TextEditingController();
  final _expiryCtrl = TextEditingController();
  final _cvvCtrl = TextEditingController(); // Not stored, just for 'verification' simulation
  final _nameCtrl = TextEditingController();
  final _bankNameCtrl = TextEditingController(); // Auto-detect or manual
  
  String _cardType = 'Visa';
  bool _isLoading = false;

  final CreditCardService _svc = CreditCardService();

  @override
  void dispose() {
    _cardNumberCtrl.dispose();
    _expiryCtrl.dispose();
    _cvvCtrl.dispose();
    _nameCtrl.dispose();
    _bankNameCtrl.dispose();
    super.dispose();
  }

  void _detectCardType(String number) {
    if (number.startsWith('4')) {
      setState(() => _cardType = 'Visa');
    } else if (number.startsWith('5')) {
      setState(() => _cardType = 'Mastercard');
    } else if (number.startsWith('3')) {
      setState(() => _cardType = 'Amex');
    } else if (number.startsWith('6')) {
       setState(() => _cardType = 'RuPay'); // simplified
    }
  }

  Future<void> _saveCard() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isLoading = true);

    // Simulate verification delay
    await Future.delayed(const Duration(seconds: 1));

    try {
        // Construct the model
        // Note: The original model requires an ID, we'll generate one
        // We also need to adapt to the existing model structure which might lack some fields we collected (like CVV/Expiry in strict format)
        // We will map what we can.
        
        final last4 = _cardNumberCtrl.text.length >= 4 
            ? _cardNumberCtrl.text.substring(_cardNumberCtrl.text.length - 4) 
            : '0000';
            
        final bank = _bankNameCtrl.text.isEmpty ? 'Unknown Bank' : _bankNameCtrl.text;
        
        final id = '${bank.replaceAll(' ', '').toLowerCase()}-$last4-${DateTime.now().millisecondsSinceEpoch}';

        final newCard = CreditCardModel(
          id: id,
          bankName: bank,
          cardType: _cardType,
          last4Digits: last4,
          cardholderName: _nameCtrl.text,
          statementDate: null,
          dueDate: DateTime.now().add(const Duration(days: 30)), // Default
          totalDue: 0,
          minDue: 0,
          isPaid: true,
          cardAlias: null,
          issuerEmails: [],
          pdfPassFormat: PdfPassFormat.none,
        );

        await _svc.saveCard(widget.userId, newCard);

        if (mounted) {
          Navigator.pop(context, true); // Return true to indicate success
          ScaffoldMessenger.of(context).showSnackBar(
             const SnackBar(content: Text('Card verification successful & saved!')),
          );
        }

    } catch (e) {
       if (mounted) {
         ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(content: Text('Error saving card: $e')),
         );
       }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        top: 24,
        left: 20,
        right: 20,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'Add New Card',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                )
              ],
            ),
            const SizedBox(height: 20),
            
            // Card Number
            TextFormField(
              controller: _cardNumberCtrl,
              decoration: InputDecoration(
                labelText: 'Card Number',
                prefixIcon: const Icon(Icons.credit_card),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                suffixIcon: Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Text(_cardType, style: const TextStyle(fontWeight: FontWeight.bold)),
                )
              ),
              keyboardType: TextInputType.number,
              maxLength: 16,
              onChanged: _detectCardType,
              validator: (v) {
                if (v == null || v.length < 15) return 'Invalid card number';
                return null;
              },
            ),
            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _expiryCtrl,
                    decoration: InputDecoration(
                      labelText: 'Expiry (MM/YY)',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    keyboardType: TextInputType.datetime,
                    validator: (v) {
                        if (v == null || v.isEmpty) return 'Required';
                        if (!v.contains('/')) return 'Use MM/YY';
                        return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _cvvCtrl,
                    decoration: InputDecoration(
                      labelText: 'CVV',
                      hintText: '123',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    keyboardType: TextInputType.number,
                    obscureText: true,
                    maxLength: 3,
                     validator: (v) {
                        if (v == null || v.length != 3) return 'Invalid CVV';
                        return null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            
             TextFormField(
              controller: _nameCtrl,
              decoration: InputDecoration(
                labelText: 'Name on Card',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
               validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),

            TextFormField(
              controller: _bankNameCtrl,
              decoration: InputDecoration(
                labelText: 'Bank Name',
                hintText: 'e.g. HDFC, SBI',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
               validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
            ),

            const SizedBox(height: 24),
            
            SizedBox(
              height: 50,
              child: FilledButton(
                onPressed: _isLoading ? null : _saveCard,
                style: FilledButton.styleFrom(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _isLoading 
                    ? const CircularProgressIndicator(color: Colors.white) 
                    : const Text('Verify & Save Card', style: TextStyle(fontSize: 16)),
              ),
            ),
            const SizedBox(height: 10),
            Center(
              child: Text(
                'A small amount may be deducted for verification and reversed instantly.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
