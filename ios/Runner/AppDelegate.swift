import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {

  private var flutterEngine: FlutterEngine?

  private func installPreWindow() {
    if self.window == nil {
      let w = UIWindow(frame: UIScreen.main.bounds)
      w.backgroundColor = .white
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

    // Add a native overlay label so we can SEE native boot
    let overlayLabel = UILabel(
      frame: CGRect(x: 20, y: 60, width: UIScreen.main.bounds.width - 40, height: 24)
    )
    overlayLabel.text = "Native boot OK – waiting for Flutter…"
    overlayLabel.textAlignment = .center
    overlayLabel.textColor = .black
    self.window?.addSubview(overlayLabel)

    if FirebaseApp.app() == nil {
      if let file = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
         let opts = FirebaseOptions(contentsOfFile: file) {
        FirebaseApp.configure(options: opts)
        NSLog("✅ Firebase from plist")
      } else {
        FirebaseApp.configure()
        NSLog("ℹ️ Firebase default")
      }
    }

    let engine = FlutterEngine(name: "fiinny_engine", project: nil)
    self.flutterEngine = engine
    engine.run() // Dart entrypoint 'main'
    GeneratedPluginRegistrant.register(with: engine)

    let controller = FlutterViewController(engine: engine, nibName: nil, bundle: nil)
    self.window?.rootViewController = controller
    self.window?.makeKeyAndVisible()

    overlayLabel.text = "Flutter attached ✅"
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      overlayLabel.removeFromSuperview()
    }

    UNUserNotificationCenter.current().delegate = self
    Messaging.messaging().delegate = self

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

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
  ) { completionHandler() }
}
