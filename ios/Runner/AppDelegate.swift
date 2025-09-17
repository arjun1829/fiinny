import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

// Uncaught Objective-C exceptions (prints to console/TestFlight diagnostics)
private func handleUncaughtException(_ exception: NSException) {
  NSLog("🔥 Uncaught exception: \(exception.name.rawValue) – \(exception.reason ?? "no reason")")
  NSLog("Stack:\n\(exception.callStackSymbols.joined(separator: "\n"))")
}

@main
@objc class AppDelegate: FlutterAppDelegate {

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {

    // Log any Obj-C exceptions so we see the actual reason next time
    NSSetUncaughtExceptionHandler(handleUncaughtException)

    // --- Firebase
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }

    // Useful breadcrumbs in console/TestFlight
    if let app = FirebaseApp.app() {
      let bid = Bundle.main.bundleIdentifier ?? "?"
      NSLog("ℹ️ FIR configured. bundle=\(bid) googleAppID=\(app.options.googleAppID)")
    } else {
      NSLog("⚠️ FIR NOT configured")
    }

    // --- Push notifications (safe defaults)
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self   // FlutterAppDelegate already adopts this
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    }
    application.registerForRemoteNotifications()

    // --- Flutter plugins
    GeneratedPluginRegistrant.register(with: self)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // APNs token -> Firebase Messaging
  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  // Foreground notification presentation
  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound, .badge])
  }

  // Tapping a notification
  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  // URL schemes (Google/OAuth)
  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }

  // Universal Links passthrough
  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }
}
