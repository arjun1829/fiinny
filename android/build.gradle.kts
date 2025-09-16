// android/build.gradle.kts
import org.gradle.api.file.Directory

plugins {
    // Let Flutter’s gradle plugin manage AGP; keep these apply-false entries.
    id("com.android.application") apply false
    id("com.android.library") apply false
    id("org.jetbrains.kotlin.android") apply false

    // Google Services (Firebase) plugin version here (no buildscript block)
    id("com.google.gms.google-services") version "4.4.2" apply false
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// keep your relocated build dir logic
val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.set(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    layout.buildDirectory.set(newSubprojectBuildDir)
}

subprojects {
    afterEvaluate {
        if (plugins.hasPlugin("com.android.library")) {
            val androidExt = extensions.findByName("android")
            if (androidExt != null) {
                val cls = androidExt.javaClass
                val getNs = cls.methods.firstOrNull { it.name == "getNamespace" && it.parameterCount == 0 }
                val setNs = cls.methods.firstOrNull { it.name == "setNamespace" && it.parameterCount == 1 }
                val current = getNs?.invoke(androidExt) as? String
                if (current.isNullOrBlank()) {
                    setNs?.invoke(androidExt, project.group.toString())
                }
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
