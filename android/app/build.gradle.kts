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

repositories {
    google()
    mavenCentral()
    maven(url = "https://storage.googleapis.com/download.flutter.io")
    maven(url = "https://dl.google.com/dl/android/maven2/")
}

/* 🔧 EXCLUDE the old IID lib that causes the duplicate */
/* 🔧 EXCLUDE the old IID lib that causes the duplicate */
// configurations.all {
//    exclude(group = "com.google.firebase", module = "firebase-iid")
// }

val keystoreProperties = Properties()
val requestedTasks = gradle.startParameter.taskNames
val isReleaseTaskRequested = requestedTasks.any { task ->
    task.contains("Release", ignoreCase = true) ||
            task.contains("bundle", ignoreCase = true) ||
            task.contains("publish", ignoreCase = true)
}

/*
 * 🔐 Resolve keystore metadata safely
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
    compileSdk = 36
    ndkVersion = "28.2.13676358"

    /* ✅ Java 17 – stable & recommended */
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    defaultConfig {
        applicationId = "com.KaranArjunTechnologies.lifemap"
        minSdk = 24
        targetSdk = 35
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    /* =====================================================
     * Android 15 – 16 KB PAGE SIZE (OFFICIAL, SAFE SETUP)
     * ===================================================== */
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }

        // Required for Android 15 / 16 KB page devices
        jniLibs {
            useLegacyPackaging = false
        }
    }

    signingConfigs {
        if (keystoreProperties.isNotEmpty()) {
            create("release") {
                val storeFilePath = keystoreProperties["storeFile"] as String
                val resolvedStoreFile = File(storeFilePath)
                storeFile =
                    if (resolvedStoreFile.isAbsolute) resolvedStoreFile
                    else rootProject.file(storeFilePath)

                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
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
            // default debug config
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    // 🔥 Firebase BOM – unchanged
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))

    // Java 17 desugaring
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")

    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")

    // ✋ Do NOT add firebase-messaging manually
    implementation("com.google.firebase:firebase-iid:21.1.0")
}
