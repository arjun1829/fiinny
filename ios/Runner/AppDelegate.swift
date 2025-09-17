import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

// Log uncaught Obj-C exceptions so TestFlight shows real reasons
private func handleUncaughtException(_ exception: NSException) {
  NSLog("🔥 Uncaught exception: \(exception.name.rawValue) – \(exception.reason ?? "no reason")")
  NSLog("Stack:\n\(exception.callStackSymbols.joined(separator: "\n"))")
}

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {

    // Capture uncaught Obj-C exceptions early
    NSSetUncaughtExceptionHandler(handleUncaughtException)

    // --- Firebase
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }
    Messaging.messaging().delegate = self

    if let app = FirebaseApp.app() {
      let bid = Bundle.main.bundleIdentifier ?? "?"
      NSLog("ℹ️ Firebase configured. bundle=\(bid) googleAppID=\(app.options.googleAppID)")
    } else {
      NSLog("⚠️ Firebase NOT configured")
    }

    // --- Push notifications
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self // FlutterAppDelegate already adopts the delegate; we just set instance
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

  // Optional: background remote notification (silent push) passthrough/logging
  override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable : Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    NSLog("📬 didReceiveRemoteNotification: \(userInfo)")
    super.application(application, didReceiveRemoteNotification: userInfo, fetchCompletionHandler: completionHandler)
  }

  // Firebase Messaging delegate (get FCM token)
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    NSLog("✅ FCM token: \(fcmToken ?? "nil")")
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
