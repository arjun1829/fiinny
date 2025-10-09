import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

private func handleUncaughtException(_ exception: NSException) {
  NSLog("🔥 Uncaught exception: \(exception.name.rawValue) – \(exception.reason ?? \"no reason\")")
  NSLog("Stack:\n\(exception.callStackSymbols.joined(separator: "\n"))")
}

private extension Notification.Name {
  static let fiinnyRemoteNotification = Notification.Name("fiinny.remoteNotification")
}

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {

  private var launchRemoteNotification: [AnyHashable: Any]?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {

    // Catch Obj-C exceptions early
    NSSetUncaughtExceptionHandler(handleUncaughtException)

    configureFirebaseIfNeeded()
    Messaging.messaging().delegate = self

    // Capture any push that launched the app so we can forward it once Flutter is ready.
    launchRemoteNotification = launchOptions?[.remoteNotification] as? [AnyHashable: Any]

    // Notifications (request permission & register for APNs on the main queue)
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      if let error = error {
        NSLog("⚠️ Notification authorization failed: \(error.localizedDescription)")
      } else {
        NSLog("🔔 Notifications permission granted: \(granted)")
      }
    }
    DispatchQueue.main.async {
      application.registerForRemoteNotifications()
    }

    let didFinish = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    // Flutter auto-registers plugins, but explicitly registering keeps manual engines in sync.
    GeneratedPluginRegistrant.register(with: self)

    // Clear any stale badges.
    application.applicationIconBadgeNumber = 0

    // Forward a cold-start push to observers (Firebase Messaging plugin + custom listeners).
    if let coldStartUserInfo = launchRemoteNotification {
      handleRemoteNotificationPayload(coldStartUserInfo, origin: "launch")
      launchRemoteNotification = nil
    }

    return didFinish
  }

  // MARK: - Disable UI state restoration
  override func application(_ application: UIApplication, shouldSaveApplicationState coder: NSCoder) -> Bool { false }
  override func application(_ application: UIApplication, shouldRestoreApplicationState coder: NSCoder) -> Bool { false }

  // MARK: - APNs token -> FCM
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

  // MARK: - Remote notification delivery
  override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    handleRemoteNotificationPayload(userInfo, origin: "background")
    completionHandler(.newData)
  }

  private func handleRemoteNotificationPayload(_ userInfo: [AnyHashable: Any], origin: String) {
    NSLog("📬 [Push: \(origin)] \(userInfo)")
    NotificationCenter.default.post(name: .fiinnyRemoteNotification, object: nil, userInfo: userInfo)
  }

  // MARK: - FCM token callback
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    if let t = fcmToken {
      NSLog("📨 FCM token refreshed: \(t)")
    }
  }

  // MARK: - Foreground notification banner
  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound, .badge])
  }

  // MARK: - Notification tap handling
  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    handleRemoteNotificationPayload(response.notification.request.content.userInfo, origin: "tap")
    completionHandler()
  }

  // MARK: - URL schemes / universal links
  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }

  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }

  private func configureFirebaseIfNeeded() {
    guard FirebaseApp.app() == nil else { return }

    if
      let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
      let options = FirebaseOptions(contentsOfFile: filePath)
    {
      FirebaseApp.configure(options: options)
      NSLog("✅ Firebase configured using bundled GoogleService-Info.plist")
      return
    }

    // Fallback for TestFlight/IPAs that were built without bundling the plist.
    let fallback = FirebaseOptions(
      googleAppID: "1:1085936196639:ios:3cbdc12cca308cbc16492a",
      gcmSenderID: "1085936196639"
    )
    fallback.apiKey = "AIzaSyCt-xTvI1TGF3AlFSeR5rVpzfC14D4v_iY"
    fallback.projectID = "lifemap-72b21"
    fallback.storageBucket = "lifemap-72b21.firebasestorage.app"
    fallback.databaseURL = "https://lifemap-72b21-default-rtdb.firebaseio.com"
    fallback.bundleID = "com.KaranArjunTechnologies.fiinny"
    fallback.clientID = "1085936196639-ful1a37opigvpkrfnkvkpitue5fcbd00.apps.googleusercontent.com"

    FirebaseApp.configure(options: fallback)
    NSLog("⚠️ Firebase configured using inline fallback options (GoogleService-Info.plist missing)")
  }
}
