import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("com.google.gms.google-services")
    id("dev.flutter.flutter-gradle-plugin")
}

// Load signing credentials from android/key.properties (kept out of version control).
val keyPropertiesFile = rootProject.file("key.properties")
val keyProperties = Properties()
if (keyPropertiesFile.exists()) {
    keyProperties.load(FileInputStream(keyPropertiesFile))
}

val hasReleaseKey =
    keyProperties.containsKey("storeFile") &&
    keyProperties.containsKey("storePassword") &&
    keyProperties.containsKey("keyAlias") &&
    keyProperties.containsKey("keyPassword")

android {
    namespace = "com.karanarjuntechnologies.KrishiDukan"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.karanarjuntechnologies.KrishiDukan"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        multiDexEnabled = true
    }

    if (hasReleaseKey) {
        signingConfigs {
            create("release") {
                storeFile     = file(keyProperties["storeFile"] as String)
                storePassword = keyProperties["storePassword"] as String
                keyAlias      = keyProperties["keyAlias"] as String
                keyPassword   = keyProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseKey) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                // No keystore configured — sign with debug key so the build doesn't crash,
                // but remind the developer to set up key.properties before uploading.
                signingConfig = signingConfigs.getByName("debug")
                println("⚠️  WARNING: Building with DEBUG signing. Create android/key.properties to enable release signing.")
            }
        }
    }
}

flutter {
    source = "../.."
}
