package com.KaranArjunTechnologies.lifemap

import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity
import androidx.core.view.WindowCompat

import androidx.activity.enableEdgeToEdge

class MainActivity : FlutterFragmentActivity() {
    private val CHANNEL = "lifemap/system_ui"

    override fun onCreate(savedInstanceState: Bundle?) {
        // Enable edge-to-edge for Android 15
        enableEdgeToEdge()
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
