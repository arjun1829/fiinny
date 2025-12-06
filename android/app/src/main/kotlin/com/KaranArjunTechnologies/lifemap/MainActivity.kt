package com.KaranArjunTechnologies.lifemap

import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import androidx.core.view.WindowCompat

class MainActivity : FlutterActivity() {
    private val CHANNEL = "lifemap/system_ui"

    override fun onCreate(savedInstanceState: Bundle?) {
        // Enable edge-to-edge for Android 15+ (SDK 35) compliance
        // This replaces the manual WindowCompat approach and handles deprecations
        androidx.activity.enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }

    override fun configureFlutterEngine(flutterEngine: io.flutter.embedding.engine.FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        io.flutter.plugin.common.MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "getSdkInt") {
                result.success(android.os.Build.VERSION.SDK_INT)
            } else {
                result.notImplemented()
            }
        }
    }
}
