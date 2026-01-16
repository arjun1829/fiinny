import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/firebase_crisis_service.dart';
import '../services/user_data.dart';

class CrisisModeToggleCard extends StatefulWidget {
  final UserData userData;
  final ValueChanged<bool>? onChanged; // Optionally notify parent

  const CrisisModeToggleCard({
    super.key,
    required this.userData,
    this.onChanged,
  });

  @override
  State<CrisisModeToggleCard> createState() => _CrisisModeToggleCardState();
}

class _CrisisModeToggleCardState extends State<CrisisModeToggleCard> {
  bool _isEnabled = false;
  bool _loading = false;

  final _crisisService = FirebaseCrisisService();

  @override
  void initState() {
    super.initState();
    _loadCrisisStatus();
  }

  Future<void> _loadCrisisStatus() async {
    final userId = FirebaseAuth.instance.currentUser?.uid;
    if (userId == null) return;

    final data = await _crisisService.fetchCrisisPlan(userId);
    if (data != null && mounted) {
      setState(() {
        _isEnabled = data['isActive'] ?? false;
      });
    }
  }

  Future<void> _toggleCrisis(bool value) async {
    setState(() => _loading = true);

    final userId = FirebaseAuth.instance.currentUser?.uid;
    try {
      if (userId != null) {
        await _crisisService.saveCrisisPlan(
          userId: userId,
          weeklyLimit: widget.userData.weeklyLimit,
          startDate: DateTime.now(),
          isActive: value,
        );
        setState(() {
          _isEnabled = value;
        });
        widget.onChanged?.call(value); // Notify parent if needed

        // Give feedback!
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                value
                    ? "🛡️ Crisis Mode enabled: Spending is now limited!"
                    : "Crisis Mode disabled.",
              ),
              duration: const Duration(seconds: 2),
              backgroundColor: value ? Colors.teal : Colors.grey[700],
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Failed to update crisis mode: $e"),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      margin: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      color: _isEnabled ? Colors.teal.withValues(alpha: 0.07) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ListTile(
        leading: Icon(
          _isEnabled ? Icons.shield_rounded : Icons.shield_outlined,
          color: _isEnabled ? Colors.teal : Colors.grey[600],
          size: 32,
        ),
        title: Text(
          "Crisis Mode",
          style: TextStyle(
            color: _isEnabled ? Colors.teal[900] : Colors.grey[900],
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        subtitle: Text(
          _isEnabled
              ? "🛡️ Weekly spending locked: Stay disciplined!"
              : "Limit weekly spending & survive the month",
          style: TextStyle(
            color: _isEnabled ? Colors.teal[700] : Colors.grey[700],
            fontWeight: FontWeight.w500,
            fontSize: 13.2,
          ),
        ),
        trailing: IgnorePointer(
          ignoring: _loading,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: _loading
                ? SizedBox(
                    width: 36,
                    height: 36,
                    child: Padding(
                      padding: const EdgeInsets.all(4.0),
                      child: CircularProgressIndicator(strokeWidth: 3),
                    ),
                  )
                : Switch(
                    value: _isEnabled,
                    onChanged: _toggleCrisis,
                  ),
          ),
        ),
      ),
    );
  }
}
