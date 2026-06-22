import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
}

// Load release signing keys from key.properties (not committed to VCS)
val keyPropertiesFile = rootProject.file("key.properties")
val keyProperties = Properties()
if (keyPropertiesFile.exists()) {
    keyPropertiesFile.inputStream().use { keyProperties.load(it) }
}

// True only when Gradle is actually assembling a release artifact. Lets us fail
// fast on a missing keystore for releases without breaking debug builds, which
// configure every buildType regardless of the task being run.
val isReleaseBuild = gradle.startParameter.taskNames.any {
    it.contains("Release", ignoreCase = true)
}

android {
    namespace = "com.karanarjuntechnologies.krishidukaan_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // Must match the package name registered in Google Play exactly (case-sensitive).
        applicationId = "com.karanarjuntechnologies.KrishiDukan"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "environment"

    productFlavors {
        create("prod") {
            dimension = "environment"
            // Uses google-services.json from app/src/prod/ (production Firebase project)
        }
        create("uat") {
            dimension = "environment"
            applicationIdSuffix = ".uat"
            versionNameSuffix = "-uat"
            // Uses google-services.json from app/src/uat/ (karan-arjun-uat Firebase project)
        }
    }

    signingConfigs {
        if (keyPropertiesFile.exists()) {
            create("release") {
                keyAlias = keyProperties["keyAlias"] as String
                keyPassword = keyProperties["keyPassword"] as String
                storeFile = file(keyProperties["storeFile"] as String)
                storePassword = keyProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Release MUST be signed with the upload keystore. If key.properties is
            // missing, fail the release build instead of silently debug-signing it
            // (which Google Play rejects with a "wrong signing key" error). Non-release
            // tasks fall back to debug so `flutter run` still works without the keystore.
            signingConfig = when {
                keyPropertiesFile.exists() -> signingConfigs.getByName("release")
                isReleaseBuild -> throw GradleException(
                    "Missing android/key.properties — release builds require the upload " +
                    "keystore (krishidukan.jks). Restore key.properties + krishidukan.jks " +
                    "before building a release."
                )
                else -> signingConfigs.getByName("debug")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
