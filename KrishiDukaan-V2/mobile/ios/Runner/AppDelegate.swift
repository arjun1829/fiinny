import Flutter
import UIKit
import GoogleMaps

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Google Maps API key — same key as GOOGLE_MAPS_API_KEY in Android manifest
    // and AppConfig.googleMapsApiKey. Restricted to this bundle ID in Cloud Console.
    GMSServices.provideAPIKey("AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778")
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Info.plist declares UIApplicationSceneManifest, so this app boots via
  // SceneDelegate.swift's FlutterSceneDelegate — NOT the classic
  // GeneratedPluginRegistrant.register(with: self) call inside
  // didFinishLaunchingWithOptions above. That old call registers plugins
  // against an engine the scene-based window never actually uses, so
  // EVERY plugin (Firebase, Firestore, image_picker, geolocator, …) ends
  // up with no native-side handler even though the Dart side thinks it
  // initialized fine. The app boots and renders, then the first real
  // plugin call — Firebase Auth's phone sign-in on the login screen —
  // has nothing to talk to natively and crashes.
  //
  // FlutterSceneDelegate calls this hook once the scene's Flutter engine
  // exists; registering plugins HERE is the only place that works in a
  // scene-based app.
  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
