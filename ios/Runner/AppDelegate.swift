import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {

  // ✅ Minimal pre-window so delegate.window is never nil during launch.
  // This avoids rare UIKit/plugin traps on iOS 17/18.
  private func installPreWindow() {
    if self.window == nil {
      let w = UIWindow(frame: UIScreen.main.bounds)
      w.backgroundColor = .white
      // A blank VC; Flutter will replace once the engine mounts.
      w.rootViewController = UIViewController()
      w.makeKeyAndVisible()
      self.window = w
      NSLog("✅ Pre-window installed")
    }
  }

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {

    installPreWindow()

    // ✅ Configure Firebase from bundled plist if present; else default.
    if FirebaseApp.app() == nil {
      if let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
         let options = FirebaseOptions(contentsOfFile: filePath) {
        FirebaseApp.configure(options: options)
        NSLog("✅ Firebase configured from GoogleService-Info.plist")
      } else {
        FirebaseApp.configure()
        NSLog("ℹ️ Firebase configured with default options")
      }
    }

    GeneratedPluginRegistrant.register(with: self)

    // Safe push wiring; no prompt here.
    UNUserNotificationCenter.current().delegate = self
    Messaging.messaging().delegate = self

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // APNs → FCM
  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NSLog("❌ APNs registration failed: \(error.localizedDescription)")
  }

  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if #available(iOS 14.0, *) { completionHandler([.banner, .list, .sound, .badge]) }
    else { completionHandler([.alert, .sound, .badge]) }
  }

  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }
}
