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
@objc class AppDelegate: FlutterAppDelegate {

  var window: UIWindow?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]?
  ) -> Bool {

    // Install early so we catch post-launch issues (storyboard no longer involved)
    NSSetUncaughtExceptionHandler(handleUncaughtException)

    // Firebase
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }
    if let app = FirebaseApp.app() {
      let bid = Bundle.main.bundleIdentifier ?? "?"
      NSLog("ℹ️ FIR configured. bundle=\(bid) googleAppID=\(app.options.googleAppID)")
    }

    // Create a Flutter root view controller manually
    let flutterVC = FlutterViewController(project: nil, nibName: nil, bundle: nil)

    let win = UIWindow(frame: UIScreen.main.bounds)
    win.rootViewController = flutterVC
    win.makeKeyAndVisible()
    self.window = win

    // Notifications
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    }
    application.registerForRemoteNotifications()

    // Plugins
    GeneratedPluginRegistrant.register(with: self)

    // Call super for plugin lifecycle wiring
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // APNs token -> Firebase
  override func application(_ application: UIApplication,
                            didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  @available(iOS 10.0, *)
  override func userNotificationCenter(_ center: UNUserNotificationCenter,
                                       willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .list, .sound, .badge])
  }

  @available(iOS 10.0, *)
  override func userNotificationCenter(_ center: UNUserNotificationCenter,
                                       didReceive response: UNNotificationResponse,
                                       withCompletionHandler completionHandler: @escaping () -> Void) {
    completionHandler()
  }

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
