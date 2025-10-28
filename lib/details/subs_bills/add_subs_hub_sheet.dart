// lib/details/subs_bills/add_subs_hub_sheet.dart
import 'package:flutter/material.dart';

import 'package:lifemap/details/services/subscriptions_service.dart';

import 'add_bill_basic_screen.dart';
import 'add_subs_choice_sheet.dart';
import 'add_subs_custom_reminder_sheet.dart';
import 'add_subscription_basic_screen.dart';

class AddSubsHubSheet extends StatelessWidget {
  final String userPhone;
  final UserSubscriptionsService service;
  final VoidCallback? onCreated;
  final VoidCallback? onOpenLegacy;
  final VoidCallback? onLinkToEmi;
  final ValueChanged<ReminderSelection>? onReminderPicked;

  const AddSubsHubSheet({
    super.key,
    required this.userPhone,
    required this.service,
    this.onCreated,
    this.onOpenLegacy,
    this.onLinkToEmi,
    this.onReminderPicked,
  });

  Future<void> _openSubscription(BuildContext context) async {
    final navigator = Navigator.of(context);
    navigator.pop();
    final result = await navigator.push<bool>(
      MaterialPageRoute(
        builder: (_) => AddSubscriptionBasicScreen(
          userPhone: userPhone,
          service: service,
        ),
      ),
    );
    if (result == true) {
      onCreated?.call();
    }
  }

  Future<void> _openBill(BuildContext context) async {
    final navigator = Navigator.of(context);
    navigator.pop();
    final result = await navigator.push<bool>(
      MaterialPageRoute(
        builder: (_) => AddBillBasicScreen(
          userPhone: userPhone,
          service: service,
        ),
      ),
    );
    if (result == true) {
      onCreated?.call();
    }
  }

  Future<void> _openReminder(BuildContext context) async {
    final result = await showModalBottomSheet<ReminderSelection>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const AddSubsCustomReminderSheet(),
    );
    if (result != null) {
      onReminderPicked?.call(result);
      final messenger = ScaffoldMessenger.maybeOf(context);
      messenger?.showSnackBar(
        SnackBar(
          content: Text(
            result.daysBefore == null && result.timeOfDay == null
                ? 'Reminder cleared'
                : 'Reminder saved',
          ),
        ),
      );
    }
  }

  void _linkEmi(BuildContext context) {
    Navigator.pop(context);
    if (onLinkToEmi != null) {
      onLinkToEmi!();
    } else {
      final messenger = ScaffoldMessenger.maybeOf(context);
      messenger?.showSnackBar(
        const SnackBar(content: Text('Link to EMI coming soon.')),
      );
    }
  }

  void _openLegacyAdd(BuildContext context) {
    Navigator.pop(context);
    onOpenLegacy?.call();
  }

  @override
  Widget build(BuildContext context) {
    return AddSubsChoiceSheet(
      heading: 'Add to Subs & Bills',
      choices: [
        AddSubsChoice(
          icon: Icons.subscriptions_rounded,
          title: 'New subscription',
          subtitle: 'Streaming, memberships, SaaS, and more',
          onTap: () => _openSubscription(context),
        ),
        AddSubsChoice(
          icon: Icons.receipt_long_rounded,
          title: 'New bill or utility',
          subtitle: 'Electricity, rent, insurance premiums…',
          onTap: () => _openBill(context),
        ),
        AddSubsChoice(
          icon: Icons.notifications_active_rounded,
          title: 'Custom reminder',
          subtitle: 'Pick a custom lead time and notification time',
          onTap: () => _openReminder(context),
        ),
        AddSubsChoice(
          icon: Icons.account_balance_rounded,
          title: 'Link to EMI / Loan',
          subtitle: 'Connect an existing loan for tracking',
          onTap: () => _linkEmi(context),
        ),
        if (onOpenLegacy != null)
          AddSubsChoice(
            icon: Icons.more_horiz_rounded,
            title: 'More options',
            subtitle: 'Open the classic add flow',
            onTap: () => _openLegacyAdd(context),
          ),
      ],
    );
  }
}
