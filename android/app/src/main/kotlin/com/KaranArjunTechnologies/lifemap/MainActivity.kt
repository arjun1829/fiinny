package com.KaranArjunTechnologies.lifemap

import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import androidx.core.view.WindowCompat

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge without androidx.activity EdgeToEdge helper
        // (safe across older Activity versions)
        WindowCompat.setDecorFitsSystemWindows(window, false)
    }
}
