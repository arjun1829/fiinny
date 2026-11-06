import 'package:firebase_performance/firebase_performance.dart';

/// Times [body] as a Firebase Performance custom trace named [name], so real
/// load times on farmers' phones show up in the Firebase console. A tracing
/// failure never affects the work being traced.
Future<T> traced<T>(String name, Future<T> Function() body) async {
  Trace? trace;
  try {
    trace = FirebasePerformance.instance.newTrace(name);
    await trace.start();
  } catch (_) {
    trace = null;
  }
  try {
    return await body();
  } finally {
    try {
      await trace?.stop();
    } catch (_) {}
  }
}
