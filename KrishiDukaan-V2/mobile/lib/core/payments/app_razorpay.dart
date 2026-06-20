// Cross-platform Razorpay checkout.
//
// Native (Android/iOS) delegates to the razorpay_flutter plugin.
// Web uses Razorpay's checkout.js (loaded in web/index.html) via JS interop,
// because razorpay_flutter has no web implementation.
//
// The conditional import below selects the platform implementation at compile
// time, so razorpay_flutter is never referenced in a web build (and dart:js is
// never referenced in a native build).

import 'app_razorpay_native.dart'
    if (dart.library.html) 'app_razorpay_web.dart';

/// Fields the backend needs to verify a successful payment.
class AppPaymentSuccess {
  final String orderId;
  final String paymentId;
  final String signature;
  const AppPaymentSuccess({
    required this.orderId,
    required this.paymentId,
    required this.signature,
  });
}

/// A failed or cancelled payment.
class AppPaymentError {
  final String message;
  const AppPaymentError(this.message);
}

/// Platform-agnostic Razorpay checkout handle.
abstract class AppRazorpay {
  /// Opens the Razorpay checkout. [options] uses the same keys as
  /// razorpay_flutter: `key`, `order_id`, `amount`, `currency`, `name`,
  /// `description`, `prefill`, `theme`.
  void open(Map<String, dynamic> options);

  /// Releases listeners/resources. Call from `State.dispose()`.
  void clear();

  factory AppRazorpay({
    required void Function(AppPaymentSuccess) onSuccess,
    required void Function(AppPaymentError) onError,
  }) =>
      createAppRazorpay(onSuccess: onSuccess, onError: onError);
}
