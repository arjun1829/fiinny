import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:lifemap/models/subscription_item.dart';
import 'package:lifemap/services/subscription_service.dart';

enum SubscriptionEventType { start, cancel, renew, trial_start, trial_end }

class SubscriptionEvent {
  final SubscriptionEventType type;
  final String providerName;
  final double? amount;
  final DateTime eventDate;
  final DateTime? nextDueDate;

  SubscriptionEvent({
    required this.type,
    required this.providerName,
    required this.eventDate,
    this.amount,
    this.nextDueDate,
  });
}

class SubscriptionScannerService {
  static final SubscriptionScannerService instance = SubscriptionScannerService._();
  SubscriptionScannerService._();

  final _subscriptionService = SubscriptionService();

  // ─── Knowledge Base ────────────────────────────────────────────────────────
  
  static const _providers = {
    'NETFLIX': ['netflix'],
    'SPOTIFY': ['spotify'],
    'YOUTUBE': ['youtube', 'yt premium', 'google youtube'],
    'AMAZON PRIME': ['amazon prime', 'prime video', 'amazon.in/prime'],
    'HOTSTAR': ['hotstar', 'disney+ hotstar', 'disney plus'],
    'APPLE': ['apple.com/bill', 'itunes.com/bill', 'apple sub'],
    'GOOGLE ONE': ['google one', 'google storage'],
    'ZOMATO GOLD': ['zomato gold', 'zomato pro'],
    'SWIGGY ONE': ['swiggy one', 'swiggy super'],
    'UBER ONE': ['uber one', 'uber pass'],
    'LINKEDIN': ['linkedin premium'],
    'TINDER': ['tinder'],
    'BUMBLE': ['bumble'],
    'SONY LIV': ['sony liv', 'sonyliv'],
    'ZEE5': ['zee5'],
    'JIO SAAVN': ['jiosaavn', 'jio saavn'],
    'GAANA': ['gaana'],
    'CHATGPT': ['chatgpt', 'openai'],
    'CLAUDE': ['anthropic', 'claude.ai'],
    'MIDJOURNEY': ['midjourney'],
  };

  // ─── Regex Patterns ────────────────────────────────────────────────────────

  bool _matches(String text, List<String> phrases) {
    final t = text.toLowerCase();
    for (var p in phrases) {
      if (t.contains(p)) return true;
    }
    return false;
  }
  
  String? _detectProvider(String text) {
    final t = text.toLowerCase();
    for (var entry in _providers.entries) {
      for (var keyword in entry.value) {
        if (t.contains(keyword)) return entry.key;
      }
    }
    return null;
  }

  SubscriptionEventType? _detectType(String text) {
    final t = text.toLowerCase();
    
    // Cancellation
    if (t.contains('cancell') || // cancelled, cancellation
        t.contains('expire') || 
        t.contains('stopped') || 
        t.contains('ended') ||
        t.contains('we\'re sorry to see you go') ||
        t.contains('miss you') ||
        t.contains('auto-renewal has been turn off') ||
        t.contains('auto renewal off')) {
      return SubscriptionEventType.cancel;
    }

    // Trial
    if (t.contains('free trial') || t.contains('trial started')) {
      if (t.contains('started') || t.contains('begin') || t.contains('active')) {
         return SubscriptionEventType.trial_start;
      }
      if (t.contains('end') || t.contains('expir')) {
        return SubscriptionEventType.trial_end;
      }
    }

    // Start / New
    if (t.contains('welcome to') || 
        t.contains('subscription started') || 
        (t.contains('subscription') && t.contains('confirmed'))) {
      return SubscriptionEventType.start;
    }

    // Renewal / Payment
    if (t.contains('renewed') || 
        t.contains('recurring payment') || 
        t.contains('subscription payment') ||
        t.contains('autopay') ||
        t.contains('auto-debit') ||
        (t.contains('payment') && t.contains('successful') && t.contains('subscription'))) {
      return SubscriptionEventType.renew;
    }
    
    // Fallback: If we detect a provider AND a payment verb, assume renewal/payment
    // This logic is handled in the main scan method
    
    return null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /// Scans a message and returns an event if detected.
  SubscriptionEvent? scan({
    required String body,
    required DateTime ts,
    String? sender,
  }) {
    final provider = _detectProvider(body) ?? _detectProvider(sender ?? '');
    if (provider == null) return null;

    var type = _detectType(body);
    
    // Fallback for renewals: Provider + Payment Verb + Currency
    if (type == null) {
      final hasPay = RegExp(r'\b(paid|debited|charged|payment|invoice|renew)\b', caseSensitive: false).hasMatch(body);
      final hasCurrency = RegExp(r'(?:₹|rs\.?|inr)', caseSensitive: false).hasMatch(body);
      if (hasPay && hasCurrency) {
        type = SubscriptionEventType.renew;
      }
    }

    if (type == null) return null;

    // Extract Amount if possible
    double? amount;
    final amtMatch = RegExp(r'(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.\d{2})?)', caseSensitive: false).firstMatch(body);
    if (amtMatch != null) {
      amount = double.tryParse(amtMatch.group(1)!.replaceAll(',', ''));
    }

    return SubscriptionEvent(
      type: type,
      providerName: provider,
      eventDate: ts,
      amount: amount,
    );
  }

  /// Handles the detection side-effects (DB updates)
  Future<void> handleEvent(String userId, SubscriptionEvent event) async {
    // 1. Find existing subscription by fuzzy name
    final existing = await _findSimilar(userId, event.providerName);

    switch (event.type) {
      case SubscriptionEventType.start:
      case SubscriptionEventType.trial_start:
        if (existing == null) {
           await _addNew(userId, event);
        } else {
           // Maybe reactivate?
           if (existing.status == 'canceled' || existing.status == 'expired') {
             await _updateStatus(userId, existing.id!, 'active');
           }
        }
        break;

      case SubscriptionEventType.cancel:
        if (existing != null) {
          await _updateStatus(userId, existing.id!, 'canceled');
        }
        break;

      case SubscriptionEventType.renew:
        if (existing != null) {
           await _handleRenewal(userId, existing, event);
        } else {
           // Detected a renewal for something we don't track? Add it!
           await _addNew(userId, event);
        }
        break;

      case SubscriptionEventType.trial_end:
        // Maybe notify user?
        break;
    }
  }

  // ─── Database Helpers ──────────────────────────────────────────────────────

  Future<SubscriptionItem?> _findSimilar(String userId, String name) async {
    // Simple exactish match for now. Firestore doesn't do fuzzy search easily.
    // We'll fetch all (small lists usually) and filter in memory.
    // Optimisation: maintain a map of provider_key -> sub_id in user doc? 
    // For now, list size < 50, so stream is fine. Using service convenience method would be nice but it returns Stream.
    // Let's use direct query.
    
    final snap = await FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('subscriptions')
        .get();

    final target = name.toLowerCase();
    
    for (var doc in snap.docs) {
      final item = SubscriptionItem.fromJson(doc.id, doc.data());
      final title = item.title.toLowerCase();
      // Basic fuzzy check
      if (title == target || title.contains(target) || target.contains(title)) {
        return item;
      }
    }
    return null;
  }

  Future<void> _addNew(String userId, SubscriptionEvent event) async {
    final newItem = SubscriptionItem(
      title: _formatTitle(event.providerName),
      amount: event.amount ?? 0.0,
      frequency: 'monthly', // Default assumption, user can edit
      provider: event.providerName,
      status: event.type == SubscriptionEventType.trial_start ? 'active' : 'active',
      type: event.type == SubscriptionEventType.trial_start ? 'trial' : 'subscription',
      nextDueAt: event.eventDate.add(const Duration(days: 30)), // Default +1 month
      anchorDate: event.eventDate,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    await _subscriptionService.addSubscription(userId, newItem);
  }

  Future<void> _updateStatus(String userId, String docId, String status) async {
    await FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('subscriptions')
        .doc(docId)
        .update({'status': status, 'updatedAt': FieldValue.serverTimestamp()});
  }

  Future<void> _handleRenewal(String userId, SubscriptionItem item, SubscriptionEvent event) async {
    final updates = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
      'status': 'active', // Ensure active
    };

    if (item.nextDueAt != null && event.eventDate.isAfter(item.nextDueAt!.subtract(const Duration(days: 5)))) {
      // It's a renewal around the expected time. Advance schedule.
      final next = _subscriptionService.calculateNextDueDate(
          item.nextDueAt!, item.frequency, null); // uses logic in service
      updates['nextDueAt'] = Timestamp.fromDate(next);
    } else {
      // Just set it to +frequency from now
      final next = _subscriptionService.calculateNextDueDate(
          event.eventDate, item.frequency, null);
      updates['nextDueAt'] = Timestamp.fromDate(next);
    }
    
    if (event.amount != null && event.amount! > 0) {
      updates['amount'] = event.amount;
    }

    await FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('subscriptions')
        .doc(item.id)
        .update(updates);
  }

  String _formatTitle(String provider) {
    // Capitalize properly
    return provider.split(' ').map((w) => w.length > 1 ? w[0].toUpperCase() + w.substring(1).toLowerCase() : w).join(' ');
  }
}
