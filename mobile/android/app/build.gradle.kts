import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.kapt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.room)
}

fun String.asBuildConfigString(): String = "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""

/** Deployment-specific client settings come from Gradle properties or the environment; nothing is hardcoded. */
fun clientSetting(name: String): String =
    providers.gradleProperty(name)
        .orElse(providers.environmentVariable(name))
        .orElse("")
        .get()
        .trim()

val apiBaseUrl = clientSetting("ANIMESTREAM_API_BASE_URL").trimEnd('/')
require(Regex("^https?://[^/?#\\s]+$").matches(apiBaseUrl)) {
    "ANIMESTREAM_API_BASE_URL must be an absolute HTTP(S) origin without a path (Gradle property or environment variable)"
}

/** Bare host whose images the site proxies through /cdn-img; empty disables rewriting. */
val imageProxyHost = clientSetting("ANIMESTREAM_IMAGE_PROXY_HOST").lowercase()
require(imageProxyHost.isEmpty() || Regex("^[a-z0-9.-]+$").matches(imageProxyHost)) {
    "ANIMESTREAM_IMAGE_PROXY_HOST must be a bare host name"
}

/** GitHub repository (owner/name) whose Releases publish the APKs; empty disables update checks. */
val updateRepository = clientSetting("ANIMESTREAM_UPDATE_REPOSITORY")
require(updateRepository.isEmpty() || Regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$").matches(updateRepository)) {
    "ANIMESTREAM_UPDATE_REPOSITORY must be owner/repository"
}

val ciVersionCode =
    providers.environmentVariable("GITHUB_RUN_NUMBER")
        .orElse("1")
        .get()
        .toIntOrNull()
        ?.coerceAtLeast(1)
        ?: 1

val releaseStorePath = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
val hasReleaseSigning =
    !releaseStorePath.isNullOrBlank() &&
        !providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull.isNullOrBlank() &&
        !providers.environmentVariable("ANDROID_KEY_ALIAS").orNull.isNullOrBlank() &&
        !providers.environmentVariable("ANDROID_KEY_PASSWORD").orNull.isNullOrBlank()

android {
    namespace = "de.ixacg.animestream"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.ixacg.animestream"
        minSdk = 24
        targetSdk = 35
        versionCode = ciVersionCode
        versionName = "2.0.0"

        buildConfigField("String", "API_BASE_URL", apiBaseUrl.asBuildConfigString())
        buildConfigField("String", "IMAGE_PROXY_HOST", imageProxyHost.asBuildConfigString())
        buildConfigField("String", "UPDATE_REPOSITORY", updateRepository.asBuildConfigString())
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(requireNotNull(releaseStorePath))
                storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig =
                if (hasReleaseSigning) {
                    signingConfigs.getByName("release")
                } else {
                    signingConfigs.getByName("debug")
                }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include(
                "arm64-v8a",
                "armeabi-v7a",
                "x86_64",
                "x86",
            )
            isUniversalApk = true
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes +=
            setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/DEPENDENCIES",
            )
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.useJUnit()
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

kapt {
    correctErrorTypes = true
}

room {
    schemaDirectory("$projectDir/schemas")
}

dependencies {
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.splashscreen)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    kapt(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)

    implementation(libs.coil.compose)
    implementation(libs.coil.gif)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.ui)
    implementation(libs.telephoto.zoomable.image.coil)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)

    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.okhttp.mockwebserver)
}
