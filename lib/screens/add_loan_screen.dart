import 'package:flutter/material.dart';
import '../models/loan_model.dart';
import '../services/loan_service.dart';

class AddLoanScreen extends StatefulWidget {
  final String userId;
  const AddLoanScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddLoanScreen> createState() => _AddLoanScreenState();
}

class _AddLoanScreenState extends State<AddLoanScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  final _emiController = TextEditingController();
  final _interestController = TextEditingController();
  final _noteController = TextEditingController();

  DateTime? _startDate;
  DateTime? _dueDate;
  String _lenderType = 'Bank';
  bool _isClosed = false;
  bool _saving = false;

  Future<void> _saveLoan() async {
    if (!_formKey.currentState!.validate() || _startDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Please fill all fields & pick a start date."), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final loan = LoanModel(
        userId: widget.userId,
        title: _titleController.text,
        amount: double.tryParse(_amountController.text) ?? 0.0,
        lenderType: _lenderType,
        startDate: _startDate!,
        dueDate: _dueDate,
        emi: _emiController.text.isNotEmpty ? double.tryParse(_emiController.text) : null,
        interestRate: _interestController.text.isNotEmpty ? double.tryParse(_interestController.text) : null,
        note: _noteController.text,
        isClosed: _isClosed,
        createdAt: DateTime.now(),
      );
      await LoanService().addLoan(loan);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Loan saved!"), backgroundColor: Colors.green),
      );
      Navigator.pop(context, true);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to save loan: $e"), backgroundColor: Colors.red),
      );
    }
    setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Add Loan')),
      body: Padding(
        padding: const EdgeInsets.all(18.0),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              TextFormField(
                controller: _titleController,
                decoration: InputDecoration(labelText: 'Loan Title (e.g., Home Loan, Credit Card)'),
                validator: (val) => val == null || val.isEmpty ? 'Enter a title' : null,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'Amount (₹)'),
                validator: (val) => val == null || val.isEmpty ? 'Enter amount' : null,
              ),
              SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _lenderType,
                decoration: InputDecoration(labelText: "Lender Type"),
                items: ['Bank', 'Friend', 'Other']
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => setState(() => _lenderType = v!),
              ),
              SizedBox(height: 16),
              Row(
                children: [
                  Text(_startDate == null
                      ? "Start Date"
                      : "${_startDate!.day}/${_startDate!.month}/${_startDate!.year}"),
                  Spacer(),
                  ElevatedButton(
                    onPressed: () async {
                      DateTime? picked = await showDatePicker(
                        context: context,
                        initialDate: DateTime.now(),
                        firstDate: DateTime(2010),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) setState(() => _startDate = picked);
                    },
                    child: Text("Pick"),
                  )
                ],
              ),
              SizedBox(height: 16),
              Row(
                children: [
                  Text(_dueDate == null
                      ? "Due Date (optional)"
                      : "${_dueDate!.day}/${_dueDate!.month}/${_dueDate!.year}"),
                  Spacer(),
                  ElevatedButton(
                    onPressed: () async {
                      DateTime? picked = await showDatePicker(
                        context: context,
                        initialDate: DateTime.now(),
                        firstDate: DateTime(2010),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) setState(() => _dueDate = picked);
                    },
                    child: Text("Pick"),
                  )
                ],
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _emiController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'EMI (optional)'),
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _interestController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'Interest Rate % (optional)'),
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _noteController,
                maxLines: 2,
                decoration: InputDecoration(labelText: 'Note (optional)'),
              ),
              SizedBox(height: 16),
              Row(
                children: [
                  Checkbox(
                    value: _isClosed,
                    onChanged: (v) => setState(() => _isClosed = v!),
                  ),
                  Text("Loan Closed"),
                ],
              ),
              SizedBox(height: 16),
              _saving
                  ? Center(child: CircularProgressIndicator())
                  : ElevatedButton.icon(
                icon: Icon(Icons.check),
                label: Text("Add Loan"),
                onPressed: _saveLoan,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
