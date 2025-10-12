import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if FirebaseApp.app() == nil {
      if let options = Self.loadFirebaseOptions() {
        FirebaseApp.configure(options: options)
        NSLog("✅ Firebase configured from bundled GoogleService-Info.plist")
      } else {
        let fallback = Self.makeManualFirebaseOptions()
        FirebaseApp.configure(options: fallback)
        NSLog("⚠️ Firebase configured using hard-coded options; bundled plist missing")
      }
    } else {
      NSLog("ℹ️ Firebase already configured by native runtime")
    }

    Messaging.messaging().delegate = self

      if
        let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
        let fileOptions = FirebaseOptions(contentsOfFile: filePath)
      {
        FirebaseApp.configure(options: fileOptions)
      } else {
        let options = FirebaseOptions(
          googleAppID: "1:1085936196639:ios:3cbdc12cca308cbc16492a",
          gcmSenderID: "1085936196639"
        )
        options.apiKey = "AIzaSyCt-xTvI1TGF3AlFSeR5rVpzfC14D4v_iY"
        options.projectID = "lifemap-72b21"
        options.storageBucket = "lifemap-72b21.firebasestorage.app"
        options.bundleID = "com.KaranArjunTechnologies.fiinny"
        options.clientID = "1085936196639-ful1a37opigvpkrfnkvkpitue5fcbd00.apps.googleusercontent.com"

        FirebaseApp.configure(options: options)
      }
    }

    Messaging.messaging().delegate = self

    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    application.registerForRemoteNotifications()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(
      application,
      didRegisterForRemoteNotificationsWithDeviceToken: deviceToken
    )
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NSLog("❌ APNs registration failed: \(error.localizedDescription)")
  }

  private static func loadFirebaseOptions() -> FirebaseOptions? {
    guard
      let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
      let options = FirebaseOptions(contentsOfFile: filePath)
    else {
      return nil
    }
    return options
  }

  private static func makeManualFirebaseOptions() -> FirebaseOptions {
    let options = FirebaseOptions(
      googleAppID: "1:1085936196639:ios:3cbdc12cca308cbc16492a",
      gcmSenderID: "1085936196639"
    )
    options.apiKey = "AIzaSyCt-xTvI1TGF3AlFSeR5rVpzfC14D4v_iY"
    options.projectID = "lifemap-72b21"
    options.storageBucket = "lifemap-72b21.appspot.com"
    options.clientID = "1085936196639-ful1a37opigvpkrfnkvkpitue5fcbd00.apps.googleusercontent.com"
    options.androidClientID = "1085936196639-11mjkb68f4k99m8ebs7g0rn5hr0ee2cn.apps.googleusercontent.com"
    return options
  }

  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    if let token = fcmToken {
      NSLog("📨 FCM token refreshed: \(token)")
    }
  }

  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound, .badge])
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
