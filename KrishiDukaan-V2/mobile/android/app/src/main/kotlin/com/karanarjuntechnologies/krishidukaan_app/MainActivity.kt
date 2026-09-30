package com.karanarjuntechnologies.krishidukaan_app

import android.os.Bundle
import androidx.core.view.WindowCompat
import com.razorpay.Checkout
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Edge-to-edge on every Android version, not just 15+ (where targeting
        // SDK 35 forces it) — the Play Console "edge-to-edge may not display
        // for all users" fix. Flutter's SafeArea/Scaffold already pad for the
        // system bars, so older devices now match what Android 15 users see.
        WindowCompat.enableEdgeToEdge(window)
        super.onCreate(savedInstanceState)
        // Warm up Razorpay's checkout (its WebView and scripts) in the
        // background at launch, as Razorpay recommends. Without it the first
        // tap on Pay loaded all of that from scratch, which is most of the
        // wait before the payment sheet appeared. Best effort — a failure here
        // only means the sheet loads the old, slower way.
        try {
            Checkout.preload(applicationContext)
        } catch (_: Throwable) {
        }
    }
}
