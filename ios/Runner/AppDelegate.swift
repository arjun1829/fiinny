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
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    NSSetUncaughtExceptionHandler(handleUncaughtException)

    if FirebaseApp.app() == nil {
      var didConfigureFromFile = false
      if
        let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
        let fileOptions = FirebaseOptions(contentsOfFile: filePath)
      {
        FirebaseApp.configure(options: fileOptions)
        didConfigureFromFile = true
      }

      if !didConfigureFromFile {
      } else {
        let options = FirebaseOptions(
          googleAppID: "1:1085936196639:ios:3cbdc12cca308cbc16492a",
          gcmSenderID: "1085936196639"
        )
        options.apiKey = "AIzaSyCt-xTvI1TGF3AlFSeR5rVpzfC14D4v_iY"
        options.projectID = "lifemap-72b21"
        options.storageBucket = "lifemap-72b21.appspot.com"
        options.storageBucket = "lifemap-72b21.firebasestorage.app"
        options.bundleID = "com.KaranArjunTechnologies.fiinny"
        options.clientID = "1085936196639-ful1a37opigvpkrfnkvkpitue5fcbd00.apps.googleusercontent.com"

        FirebaseApp.configure(options: options)
      }
    }

    Messaging.messaging().delegate = self

    GeneratedPluginRegistrant.register(with: self)

    let flutterVC = FlutterViewController(project: nil, nibName: nil, bundle: nil)
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = flutterVC
    window?.makeKeyAndVisible()

    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    application.registerForRemoteNotifications()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(_ application: UIApplication, shouldSaveApplicationState coder: NSCoder) -> Bool { false }
  override func application(_ application: UIApplication, shouldRestoreApplicationState coder: NSCoder) -> Bool { false }

  override func application(_ application: UIApplication,
                            didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(_ application: UIApplication,
                            didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NSLog("❌ APNs registration failed: \(error.localizedDescription)")
  }

  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    if let token = fcmToken {
      NSLog("📨 FCM token refreshed: \(token)")
    }
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
