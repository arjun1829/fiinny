import Flutter
import UIKit
import FirebaseAuth

class SceneDelegate: FlutterSceneDelegate {

  /// With the UIScene lifecycle, iOS routes incoming URL opens to
  /// `scene(_:openURLContexts:)` instead of `application(_:open:options:)`.
  /// Firebase Phone Auth's reCAPTCHA fallback redirects back to the app via
  /// a custom URL scheme — if the URL isn't forwarded to `Auth.auth()` here,
  /// the verification flow hangs or crashes with EXC_BREAKPOINT.
  override func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for urlContext in URLContexts {
      if Auth.auth().canHandle(urlContext.url) {
        return
      }
    }
    super.scene(scene, openURLContexts: URLContexts)
  }
}
