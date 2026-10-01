import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/ist_date.dart';
import '../data/bill_image.dart';
import '../data/expense.dart';

/// A new or edited claim, plus the bill image the rep attached (if any).
class ExpenseDraft {
  final ExpenseInput input;
  final BillImage? bill;
  const ExpenseDraft(this.input, this.bill);
}

class ExpenseFormSheet extends StatefulWidget {
  const ExpenseFormSheet({super.key, this.initial});

  final Expense? initial;

  static Future<ExpenseDraft?> show(BuildContext context, {Expense? initial}) {
    return showModalBottomSheet<ExpenseDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ExpenseFormSheet(initial: initial),
    );
  }

  @override
  State<ExpenseFormSheet> createState() => _ExpenseFormSheetState();
}

class _ExpenseFormSheetState extends State<ExpenseFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amount;
  late final TextEditingController _description;
  late ExpenseCategory _category;
  late String _date;
  BillImage? _bill;

  bool get _isEdit => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final e = widget.initial;
    _amount = TextEditingController(
      text: e == null ? '' : e.amount.toStringAsFixed(0),
    );
    _description = TextEditingController(text: e?.description ?? '');
    _category = e?.category ?? ExpenseCategory.travel;
    _date = e?.date ?? IstDate.today();
  }

  @override
  void dispose() {
    _amount.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = IstDate.parse(IstDate.today());
    final picked = await showDatePicker(
      context: context,
      initialDate: IstDate.parse(_date),
      // Claims are filed for spend that already happened; a future date is
      // always a typo, and back-dating is capped at 90 days so old bills go
      // through an admin rather than appearing silently in a closed month.
      firstDate: today.subtract(const Duration(days: 90)),
      lastDate: today,
    );
    if (picked != null) {
      setState(
        () => _date = IstDate.key(
          DateTime.utc(picked.year, picked.month, picked.day, 12),
        ),
      );
    }
  }

  Future<void> _pickBill(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      // A phone photo of a receipt is several MB at full size; this keeps the
      // bill legible while staying well inside the 5 MB storage rule limit.
      maxWidth: 1600,
      imageQuality: 75,
    );
    if (picked == null) return;
    final bill = await BillImage.fromXFile(picked);
    if (mounted) setState(() => _bill = bill);
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final amount = double.tryParse(_amount.text.trim()) ?? 0;
    Navigator.pop(
      context,
      ExpenseDraft(
        ExpenseInput(
          date: _date,
          category: _category,
          amount: amount,
          description: _description.text,
        ),
        _bill,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, controller) => Form(
          key: _formKey,
          child: ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
            children: [
              Center(
                child: Container(
                  height: 4,
                  width: 40,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _isEdit ? 'Edit Expense' : 'New Expense',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, size: 20),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              const _Label('Amount'),
              TextFormField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: false,
                ),
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(7),
                ],
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
                decoration: const InputDecoration(
                  prefixText: '₹ ',
                  hintText: '0',
                ),
                validator: (v) {
                  final n = double.tryParse((v ?? '').trim());
                  if (n == null || n <= 0) return 'Enter the amount spent.';
                  return null;
                },
              ),
              const SizedBox(height: 18),

              const _Label('Category'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final c in ExpenseCategory.values)
                    ChoiceChip(
                      avatar: Icon(
                        c.icon,
                        size: 15,
                        color: _category == c
                            ? Colors.white
                            : AppColors.outline,
                      ),
                      label: Text(c.label),
                      selected: _category == c,
                      onSelected: (_) => setState(() => _category = c),
                      labelStyle: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: _category == c
                            ? Colors.white
                            : AppColors.onSurface,
                      ),
                      selectedColor: AppColors.primary,
                      backgroundColor: AppColors.surfaceContainerLow,
                      side: BorderSide(
                        color: _category == c
                            ? AppColors.primary
                            : AppColors.divider,
                      ),
                      showCheckmark: false,
                    ),
                ],
              ),
              const SizedBox(height: 18),

              const _Label('Date of spend'),
              InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 15,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.calendar_today_rounded,
                        size: 17,
                        color: AppColors.outline,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          IstDate.longLabel(_date),
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.onSurface,
                          ),
                        ),
                      ),
                      const Icon(
                        Icons.expand_more_rounded,
                        size: 18,
                        color: AppColors.outline,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 18),

              const _Label('Description (optional)'),
              TextFormField(
                controller: _description,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Bus fare Pune → Baramati for dealer visits',
                ),
              ),
              const SizedBox(height: 18),

              const _Label('Bill photo'),
              _BillPicker(
                bill: _bill,
                existingUrl: widget.initial?.billUrl,
                onCamera: () => _pickBill(ImageSource.camera),
                onGallery: () => _pickBill(ImageSource.gallery),
                onClear: () => setState(() => _bill = null),
              ),

              const SizedBox(height: 26),
              FilledButton(
                onPressed: _submit,
                child: Text(_isEdit ? 'Save Changes' : 'Submit Claim'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.9,
        color: AppColors.onSurfaceVariant,
      ),
    ),
  );
}

class _BillPicker extends StatelessWidget {
  const _BillPicker({
    required this.bill,
    required this.existingUrl,
    required this.onCamera,
    required this.onGallery,
    required this.onClear,
  });

  final BillImage? bill;
  final String? existingUrl;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    if (bill != null) {
      return Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Image.memory(
              bill!.bytes,
              height: 170,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: Material(
              color: Colors.black54,
              shape: const CircleBorder(),
              child: InkWell(
                onTap: onClear,
                customBorder: const CircleBorder(),
                child: const Padding(
                  padding: EdgeInsets.all(6),
                  child: Icon(
                    Icons.close_rounded,
                    size: 17,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (existingUrl != null) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              color: AppColors.successContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Row(
              children: [
                Icon(
                  Icons.attachment_rounded,
                  size: 16,
                  color: AppColors.success,
                ),
                SizedBox(width: 9),
                Expanded(
                  child: Text(
                    'A bill is already attached. Choosing a new photo replaces it.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.success,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onCamera,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text('Camera'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onGallery,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('Gallery'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
