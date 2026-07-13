import Flutter
import UIKit
import GoogleMaps

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Same key as GOOGLE_MAPS_API_KEY / AppConfig.googleMapsApiKey (Android
    // manifest, web .env) — restricted to this app's bundle ID in Cloud Console.
    GMSServices.provideAPIKey("AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778")
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
