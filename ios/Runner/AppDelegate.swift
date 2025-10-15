import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {
  // Some plugins (for example flutter_contacts and certain permission handlers) still rely on
  // UIApplication.shared.delegate?.window being populated synchronously. With the scene-based
  // lifecycle introduced in iOS 13 the delegate's window can legitimately be nil during early
  // startup or after system permission alerts, which makes those plugins crash via fatalError.
  // We keep a cached reference and fall back to whatever window the connected scenes expose so
  // the delegate can always hand back a valid UIWindow when asked.
  private var cachedWindow: UIWindow?
  private lazy var placeholderViewController = UIViewController()
  @discardableResult
  private func installPlaceholderWindowIfNeeded() -> UIWindow {
    if let window = super.window ?? cachedWindow {
      cachedWindow = window
      return window
    }

    let placeholder: UIWindow
    if let cached = cachedWindow {
      placeholder = cached
    } else {
      placeholder = UIWindow(frame: UIScreen.main.bounds)
      placeholder.isHidden = true
      placeholder.backgroundColor = .clear
      placeholder.rootViewController = placeholderViewController
      cachedWindow = placeholder
    }


    if super.window == nil {
      super.window = placeholder
    }

    return placeholder
  }

  override var window: UIWindow? {
    get {
      if let window = super.window ?? cachedWindow {
        return window
      }

      if #available(iOS 13.0, *) {
        let sceneWindows = UIApplication.shared.connectedScenes
          .compactMap { $0 as? UIWindowScene }
          .flatMap { $0.windows }
        if let sceneWindow = sceneWindows.first(where: { $0.isKeyWindow }) ?? sceneWindows.first {
          cachedWindow = sceneWindow
          return sceneWindow
        }
      }

      if let legacyWindow = UIApplication.shared.windows.first(where: { $0.isKeyWindow })
        ?? UIApplication.shared.windows.first
      {
        cachedWindow = legacyWindow
        return legacyWindow
      }

      // On some iOS 17/18 builds the `UIApplication` window list is still empty
      // while plugins such as flutter_contacts synchronously ask for the
      // delegate's window during `didFinishLaunchingWithOptions`. Returning nil
      // makes those plugins trap via `fatalError("window not set")`. As a last
      // resort we hand back a temporary hidden UIWindow that will be replaced as
      // soon as the real Flutter window becomes available.
      return installPlaceholderWindowIfNeeded()
    }
    set {
      cachedWindow = newValue
      super.window = newValue
    }
  }
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    installPlaceholderWindowIfNeeded()

    if FirebaseApp.app() == nil {
      if let options = Self.loadFirebaseOptions() {
        FirebaseApp.configure(options: options)
        NSLog("✅ Firebase configured from bundled GoogleService-Info.plist")
      } else {
        let fallback = Self.makeManualFirebaseOptions()
        FirebaseApp.configure(options: fallback)
        NSLog("ℹ️ Firebase configured using built-in fallback options; bundled plist not present")
      }
    } else {
      NSLog("ℹ️ Firebase already configured by native runtime")
    }

    GeneratedPluginRegistrant.register(with: self)
    if let flutterWindow = super.window {
      cachedWindow = flutterWindow
      if flutterWindow.rootViewController == nil {
        flutterWindow.rootViewController = placeholderViewController
      }
    }

    Messaging.messaging().delegate = self

    let center = UNUserNotificationCenter.current()
    center.delegate = self
    ensureRemoteNotificationRegistration(for: application)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    ensureRemoteNotificationRegistration(for: application)
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

  private func ensureRemoteNotificationRegistration(for application: UIApplication) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        DispatchQueue.main.async {
          application.registerForRemoteNotifications()
        }
      default:
        break
      }
    }
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
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound, .badge])
    } else {
      completionHandler([.alert, .sound, .badge])
    }
  }

  @available(iOS 10.0, *)
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  // The app does not rely on UIKit state restoration and the archived state can
  // become incompatible across builds. Starting with iPadOS/iOS 18 the system
  // may attempt to restore immediately after certain permission alerts and
  // crash while decoding the stale state (`NSException initWithCoder`). Opting
  // out of saving/restoring — including the secure-coding variants — prevents
  // that crash and matches the app's actual behaviour.
  override func application(
    _ application: UIApplication,
    shouldSaveApplicationState coder: NSCoder
  ) -> Bool {
    false
  }

  override func application(
    _ application: UIApplication,
    shouldRestoreApplicationState coder: NSCoder
  ) -> Bool {
    false
  }

  override func application(
    _ application: UIApplication,
    shouldSaveSecureApplicationState coder: NSCoder
  ) -> Bool {
    false
  }

  override func application(
    _ application: UIApplication,
    shouldRestoreSecureApplicationState coder: NSCoder
  ) -> Bool {
    false
  }
}
