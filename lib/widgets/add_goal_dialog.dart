// lib/widgets/add_goal_dialog.dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../models/goal_model.dart';

class AddGoalDialog extends StatefulWidget {
  final Function(GoalModel) onAdd;

  const AddGoalDialog({required this.onAdd, Key? key}) : super(key: key);

  @override
  State<AddGoalDialog> createState() => _AddGoalDialogState();
}

class _AddGoalDialogState extends State<AddGoalDialog> {
  // Controllers
  final _emojiController = TextEditingController(text: "🎯");
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();
  final _depController = TextEditingController();

  // State
  DateTime? _targetDate;
  String? _category;
  String _priority = "Medium";
  final List<String> _dependencies = [];

  // Options
  final List<String> _categoryOptions = const [
    "Travel", "Gadget", "Emergency", "Education", "Health", "Home", "Vehicle", "Other"
  ];
  final List<String> _priorityOptions = const ["Low", "Medium", "High"];
  final List<String> _emojiOptions = const [
    "🎯","🎁","📱","💻","🎒","✈️","🏡","🚗","🍼","💍","🏖️","🎓","🏥","📷","🛠️","🛋️","🏋️","📚"
  ];
  final List<int> _quickAmounts = const [5000, 10000, 25000, 50000, 100000];

  // Tips
  static const _tips = [
    "💰 Small steps create big change.",
    "🌱 Every rupee saved is a seed planted.",
    "📅 Set it. Forget it. Watch it grow.",
    "🔥 Make it specific. Make it real.",
  ];
  int _tipIndex = 0;

  // Helpers
  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  Color get _brand => const Color(0xFF09857a);

  bool get _valid {
    final title = _titleController.text.trim();
    final amount = double.tryParse(_amountController.text.replaceAll(',', '')) ?? 0.0;
    return title.isNotEmpty && amount > 0 && _targetDate != null;
  }

  @override
  void dispose() {
    _emojiController.dispose();
    _titleController.dispose();
    _amountController.dispose();
    _notesController.dispose();
    _depController.dispose();
    super.dispose();
  }

  // --- UI helpers (match AddExpenseDialog look) ---
  InputDecoration _pillDec({required String label, IconData? icon, String? hint}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: icon != null ? Icon(icon) : null,
      filled: true,
      fillColor: _brand.withValues(alpha: .06),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: _brand),
      ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
    padding: const EdgeInsets.only(top: 10, bottom: 6),
    child: Text(text, style: TextStyle(color: _brand, fontWeight: FontWeight.w700)),
  );

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _targetDate ?? now,
      firstDate: now,
      // ✅ extend far beyond 2030
      lastDate: DateTime(now.year + 50),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: _brand),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _targetDate = picked);
  }

  // quick date offsets
  void _applyQuickDate(int addDays) {
    final base = DateTime.now();
    setState(() => _targetDate = base.add(Duration(days: addDays)));
  }

  void _addDependency() {
    final dep = _depController.text.trim();
    if (dep.isEmpty) return;
    setState(() {
      _dependencies.add(dep);
      _depController.clear();
    });
  }

  Map<String, String> _suggestion() {
    final amount = double.tryParse(_amountController.text.replaceAll(',', '')) ?? 0.0;
    if (_targetDate == null || amount <= 0) {
      return {"subtitle": "Pick a date & amount to see plan", "detail": ""};
    }
    final now = DateTime.now();
    final daysLeft = _targetDate!.difference(now).inDays;
    if (daysLeft <= 0) return {"subtitle": "Target date is today — try a later date", "detail": ""};
    final perMonth = (amount / daysLeft) * 30;
    return {
      "subtitle": "Save around ${_inr.format(perMonth)} / month",
      "detail": "$daysLeft days left • Total ${_inr.format(amount)}"
    };
  }

  void _onAdd() {
    if (!_valid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please fill title, amount, and target date.")),
      );
      return;
    }

    FocusScope.of(context).unfocus();

    final newGoal = GoalModel(
      id: '',
      title: _titleController.text.trim(),
      emoji: _emojiController.text.isNotEmpty ? _emojiController.text : "🎯",
      targetAmount: double.tryParse(_amountController.text.replaceAll(',', '')) ?? 0.0,
      savedAmount: 0,
      targetDate: _targetDate!,
      category: _category ?? "Other",
      priority: _priority,
      notes: _notesController.text.trim(),
      dependencies: _dependencies.isEmpty ? null : _dependencies,
    );

    widget.onAdd(newGoal);
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final sugg = _suggestion();

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 520),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.white.withValues(alpha: 0.96),
                  Colors.white.withValues(alpha: 0.90),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1F000000),
                  blurRadius: 22,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: _brand.withValues(alpha: .10),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(Icons.flag_rounded, color: _brand),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        "Add Goal",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF096A63),
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: "New tip",
                        icon: const Icon(Icons.auto_awesome_rounded),
                        color: _brand,
                        onPressed: () =>
                            setState(() => _tipIndex = (_tipIndex + 1) % _tips.length),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text("Cancel"),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  // Tip
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: _brand.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _tips[_tipIndex],
                      style: TextStyle(color: _brand, fontWeight: FontWeight.w600),
                    ),
                  ),

                  const SizedBox(height: 10),

                  // Preview
                  _PreviewRow(
                    emoji: _emojiController.text.isNotEmpty ? _emojiController.text : "🎯",
                    title: _titleController.text.trim().isEmpty
                        ? "Your awesome goal"
                        : _titleController.text.trim(),
                    date: _targetDate,
                    amountText: _amountController.text,
                    brand: _brand,
                  ),

                  // Emoji
                  _sectionLabel("Emoji"),
                  Row(
                    children: [
                      SizedBox(
                        width: 68,
                        child: TextField(
                          controller: _emojiController,
                          textAlign: TextAlign.center,
                          decoration: const InputDecoration(
                            hintText: "🎯",
                            counterText: "",
                            isDense: true,
                          ),
                          maxLength: 2,
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: SizedBox(
                          height: 40,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _emojiOptions.length,
                            separatorBuilder: (_, __) => const SizedBox(width: 6),
                            itemBuilder: (ctx, i) {
                              final e = _emojiOptions[i];
                              final selected = e == _emojiController.text;
                              return GestureDetector(
                                onTap: () => setState(() => _emojiController.text = e),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 180),
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: selected ? _brand.withValues(alpha: 0.12) : Colors.grey[100],
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(
                                      color: selected ? _brand : Colors.transparent,
                                      width: 1,
                                    ),
                                  ),
                                  child: Text(e, style: const TextStyle(fontSize: 20)),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ],
                  ),

                  // Title
                  _sectionLabel("Title"),
                  TextField(
                    controller: _titleController,
                    decoration: _pillDec(label: "Goal Title", icon: Icons.edit_rounded),
                    onChanged: (_) => setState(() {}),
                    textInputAction: TextInputAction.next,
                  ),

                  // Amount
                  _sectionLabel("Target Amount"),
                  TextField(
                    controller: _amountController,
                    decoration: _pillDec(
                      label: "Target Amount",
                      icon: Icons.currency_rupee_rounded,
                      hint: "e.g. 50000",
                    ),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                    onChanged: (_) => setState(() {}),
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: _quickAmounts.map((a) {
                      return ChoiceChip(
                        label: Text(_inr.format(a)),
                        selected: false,
                        onSelected: (_) {
                          _amountController.text = a.toString();
                          setState(() {});
                        },
                        visualDensity: VisualDensity.compact,
                      );
                    }).toList(),
                  ),

                  // Category
                  _sectionLabel("Category"),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: _categoryOptions.map((cat) {
                      final selected = _category == cat;
                      return ChoiceChip(
                        label: Text(cat),
                        selected: selected,
                        onSelected: (_) => setState(() => _category = selected ? null : cat),
                        selectedColor: _brand.withValues(alpha: 0.12),
                      );
                    }).toList(),
                  ),

                  // Priority
                  _sectionLabel("Priority"),
                  Wrap(
                    spacing: 8,
                    children: _priorityOptions.map((p) {
                      final selected = _priority == p;
                      return ChoiceChip(
                        label: Text(p),
                        selected: selected,
                        onSelected: (_) => setState(() => _priority = p),
                      );
                    }).toList(),
                  ),

                  // Target date
                  _sectionLabel("Target Date"),
                  InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: _pickDate,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.calendar_month_rounded, color: _brand),
                          const SizedBox(width: 10),
                          Text(
                            _targetDate == null
                                ? "Select target date"
                                : DateFormat("d MMM, yyyy").format(_targetDate!),
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                          ),
                          const Spacer(),
                          const Icon(Icons.chevron_right_rounded),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // ✅ Quick date chips
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Wrap(
                      spacing: 8,
                      children: const [
                        _QuickDateChip(label: '+3 mo', addDays: 90),
                        _QuickDateChip(label: '+6 mo', addDays: 180),
                        _QuickDateChip(label: '+12 mo', addDays: 365),
                        _QuickDateChip(label: '+24 mo', addDays: 730),
                      ],
                    ),
                  ),

                  // Notes
                  _sectionLabel("Notes"),
                  TextField(
                    controller: _notesController,
                    decoration: _pillDec(
                      label: "Notes (optional)",
                      icon: Icons.notes_rounded,
                    ),
                    maxLines: 3,
                    textInputAction: TextInputAction.done,
                  ),

                  // Sub-goals
                  _sectionLabel("Sub-goals"),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _depController,
                          decoration: _pillDec(
                            label: "Add sub-goal",
                            icon: Icons.flag_rounded,
                          ),
                          onSubmitted: (_) => _addDependency(),
                        ),
                      ),
                      const SizedBox(width: 6),
                      ElevatedButton.icon(
                        onPressed: _addDependency,
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: const Text("Add"),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _brand,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ],
                  ),
                  if (_dependencies.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: _dependencies.map((dep) {
                          return Chip(
                            label: Text(dep),
                            onDeleted: () => setState(() => _dependencies.remove(dep)),
                          );
                        }).toList(),
                      ),
                    ),

                  // Suggestion
                  const SizedBox(height: 12),
                  _SuggestionCard(
                    subtitle: sugg["subtitle"]!,
                    detail: sugg["detail"]!,
                    brand: _brand,
                  ),

                  const SizedBox(height: 14),

                  // Submit
                  Align(
                    alignment: Alignment.centerRight,
                    child: ElevatedButton.icon(
                      onPressed: _valid ? _onAdd : null,
                      icon: const Icon(Icons.check_rounded),
                      label: const Text("Add Goal"),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _valid ? _brand : Colors.grey[300],
                        foregroundColor: _valid ? Colors.white : Colors.black54,
                        elevation: 6,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewRow extends StatelessWidget {
  final String emoji;
  final String title;
  final DateTime? date;
  final String amountText;
  final Color brand;

  const _PreviewRow({
    Key? key,
    required this.emoji,
    required this.title,
    required this.date,
    required this.amountText,
    required this.brand,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
    final amount = double.tryParse(amountText.replaceAll(',', '')) ?? 0.0;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: brand.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: brand.withValues(alpha: 0.14)),
      ),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 28)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title.isEmpty ? "Your awesome goal" : title,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.calendar_today_rounded, size: 14, color: brand),
                    const SizedBox(width: 6),
                    Text(
                      date == null ? "Pick target date" : DateFormat("d MMM, yyyy").format(date!),
                      style: TextStyle(color: brand, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 10),
                    Icon(Icons.currency_rupee_rounded, size: 14, color: brand),
                    const SizedBox(width: 2),
                    Text(
                      amount <= 0 ? "--" : inr.format(amount),
                      style: TextStyle(color: brand, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  final String subtitle;
  final String detail;
  final Color brand;

  const _SuggestionCard({
    Key? key,
    required this.subtitle,
    required this.detail,
    required this.brand,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (subtitle.isEmpty && detail.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: brand.withValues(alpha: 0.14)),
      ),
      child: Row(
        children: [
          Icon(Icons.lightbulb_rounded, color: brand),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (subtitle.isNotEmpty)
                  Text(subtitle, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (detail.isNotEmpty)
                  Text(detail, style: const TextStyle(color: Colors.black54)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickDateChip extends StatelessWidget {
  final String label;
  final int addDays;
  const _QuickDateChip({required this.label, required this.addDays, Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: false,
      onSelected: (_) {
        final st = context.findAncestorStateOfType<_AddGoalDialogState>();
        st?._applyQuickDate(addDays);
      },
      visualDensity: VisualDensity.compact,
    );
  }
}
