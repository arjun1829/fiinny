import java.io.File
import java.io.FileInputStream
import java.util.Properties
import org.gradle.api.GradleException

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

val keystoreProperties = Properties()
val requestedTasks = gradle.startParameter.taskNames
val isReleaseTaskRequested = requestedTasks.any { task ->
    task.contains("Release", ignoreCase = true) ||
        task.contains("bundle", ignoreCase = true) ||
        task.contains("publish", ignoreCase = true)
}

/*
 * 🔐 Resolve the keystore metadata from a local key.properties file. We look in a
 * handful of common locations so both macOS/Linux CI and developer machines can
 * produce release builds with the *same* signing key that Play requires for
 * upgrades. If we can't find the file we fail fast for release builds instead of
 * silently falling back to the debug keystore (which would generate the
 * "does not allow existing users to update" error in Play Console).
 */
val keystorePropertiesFile = listOf(
    rootProject.file("android/key.properties"),
    rootProject.file("key.properties"),
    rootProject.file("../key.properties"),
    File(System.getProperty("user.home"), ".lifemap/key.properties")
).firstOrNull { it.exists() }

if (keystorePropertiesFile != null) {
    FileInputStream(keystorePropertiesFile).use(keystoreProperties::load)
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
        if (keystoreProperties.isNotEmpty) {
            create("release") {
                val storeFilePath = keystoreProperties["storeFile"] as String?
                    ?: throw GradleException("storeFile missing from key.properties")
                val resolvedStoreFile = File(storeFilePath)
                storeFile = if (resolvedStoreFile.isAbsolute) {
                    resolvedStoreFile
                } else {
                    rootProject.file(storeFilePath)
                }
                storePassword = keystoreProperties["storePassword"] as String?
                    ?: throw GradleException("storePassword missing from key.properties")
                keyAlias = keystoreProperties["keyAlias"] as String?
                    ?: throw GradleException("keyAlias missing from key.properties")
                keyPassword = keystoreProperties["keyPassword"] as String?
                    ?: throw GradleException("keyPassword missing from key.properties")
            }
        }
    }

    buildTypes {
        val releaseSigning = signingConfigs.findByName("release")

        getByName("release") {
            if (isReleaseTaskRequested && releaseSigning == null) {
                throw GradleException(
                    "Missing android/key.properties – cannot assemble a release build without the Play signing key."
                )
            }
            releaseSigning?.let { signingConfig = it }
            isMinifyEnabled = false
            isShrinkResources = false
        }
        getByName("debug") {
            releaseSigning?.let { signingConfig = it }
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
