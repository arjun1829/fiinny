import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

/* 🔧 EXCLUDE the old IID lib that causes the duplicate */
configurations.all {
    exclude(group = "com.google.firebase", module = "firebase-iid")
}

val keystorePropertiesFile = rootProject.file("C:/lifemap/android/key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.KaranArjunTechnologies.lifemap"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "27.0.12077973"

    /* ✅ Use Java 11 to avoid legacy warnings */
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "11" }

    defaultConfig {
        applicationId = "com.KaranArjunTechnologies.lifemap"
        minSdk = 23
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            isShrinkResources = false
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Align all Firebase artifacts to the same version via BOM
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))

    // Needed by flutter_local_notifications and friends
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")

    // ✋ Do NOT add firebase-messaging directly here — FlutterFire provides it.
}
