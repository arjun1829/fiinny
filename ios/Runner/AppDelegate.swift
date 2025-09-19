import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

private func handleUncaughtException(_ exception: NSException) {
  NSLog("🔥 Uncaught exception: \(exception.name.rawValue) – \(exception.reason ?? "no reason")")
  NSLog("Stack:\n\(exception.callStackSymbols.joined(separator: "\n"))")
}

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate { // ← removed UNUserNotificationCenterDelegate

  // Single shared Flutter engine
  lazy var flutterEngine = FlutterEngine(name: "fiinny_engine")

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {

    // Catch Obj-C exceptions early
    NSSetUncaughtExceptionHandler(handleUncaughtException)

    // Firebase
    if FirebaseApp.app() == nil { FirebaseApp.configure() }
    Messaging.messaging().delegate = self

    // Start engine & register plugins
    flutterEngine.run()
    GeneratedPluginRegistrant.register(with: flutterEngine)

    // Root Flutter VC (no Main.storyboard / SceneDelegate)
    let flutterVC = FlutterViewController(engine: flutterEngine, nibName: nil, bundle: nil)

    // UIWindowScene-aware boot
    if #available(iOS 13.0, *), let ws = UIApplication.shared.connectedScenes.first as? UIWindowScene {
      window = UIWindow(windowScene: ws)
    } else {
      window = UIWindow(frame: UIScreen.main.bounds)
    }
    window?.rootViewController = flutterVC
    window?.makeKeyAndVisible()

    // Notifications
    let center = UNUserNotificationCenter.current()
    center.delegate = self // OK: inherited via FlutterAppDelegate
    center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    application.registerForRemoteNotifications()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // MARK: - Disable UI state restoration
  override func application(_ application: UIApplication, shouldSaveApplicationState coder: NSCoder) -> Bool { false }
  override func application(_ application: UIApplication, shouldRestoreApplicationState coder: NSCoder) -> Bool { false }

  // MARK: - APNs token -> FCM
  override func application(_ application: UIApplication,
                            didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(_ application: UIApplication,
                            didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NSLog("❌ APNs registration failed: \(error.localizedDescription)")
  }

  // MARK: - FCM token callback
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    if let t = fcmToken { NSLog("📨 FCM token refreshed: \(t)") }
  }

  // MARK: - Foreground notification banner
  @available(iOS 10.0, *)
  override func userNotificationCenter(_ center: UNUserNotificationCenter,
                                       willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .list, .sound, .badge])
  }

  // MARK: - Notification tap handling
  @available(iOS 10.0, *)
  override func userNotificationCenter(_ center: UNUserNotificationCenter,
                                       didReceive response: UNNotificationResponse,
                                       withCompletionHandler completionHandler: @escaping () -> Void) {
    // TODO: forward response.notification.request.content.userInfo to Flutter via MethodChannel if needed
    completionHandler()
  }

  // MARK: - URL schemes / universal links
  override func application(_ app: UIApplication,
                            open url: URL,
                            options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    return super.application(app, open: url, options: options)
  }

  override func application(_ application: UIApplication,
                            continue userActivity: NSUserActivity,
                            restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }
}
