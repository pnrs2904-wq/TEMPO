// import com.google.gms.googleservices.GoogleServicesPlugin.MissingGoogleServicesStrategy

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.roborazzi)
  alias(libs.plugins.secrets)
  // alias(libs.plugins.google.services)
}

android {
  namespace = "com.tempo.focus"
  compileSdk = 36

  defaultConfig {
    applicationId = "com.tempo.focus"
    minSdk = 24
    targetSdk = 36
    versionCode = (System.getenv("TEMPO_VERSION_CODE")?.takeIf { it.isNotBlank() } ?: "400").toInt()
    versionName = "4.0.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

    // Live backend by default; override any of these with environment variables (CI, staging).
    // The Supabase anon key is public by design (it ships in every client); data is protected by
    // row-level security and the server, never by hiding this key.
    val backendUrl = System.getenv("TEMPO_BACKEND_URL")?.takeIf { it.isNotBlank() } ?: ""
    val apiBaseUrl = System.getenv("TEMPO_API_BASE_URL")?.takeIf { it.isNotBlank() } ?: "https://tempo-focus-study.netlify.app"
    val supabaseUrl = System.getenv("SUPABASE_URL")?.takeIf { it.isNotBlank() } ?: "https://hxgzsguxrqfwmxajqvci.supabase.co"
    val supabaseAnonKey = System.getenv("SUPABASE_ANON_KEY")?.takeIf { it.isNotBlank() }
      ?: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4Z3pzZ3V4cnFmd214YWpxdmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1ODI1NDMsImV4cCI6MjExMTE1ODU0M30.amSyPLN0yJBqY3joYvrubz8zyQ3u-8X1Ghtkn3hYJwo"
    buildConfigField("String", "TEMPO_BACKEND_URL", "\"$backendUrl\"")
    buildConfigField("String", "TEMPO_API_BASE_URL", "\"$apiBaseUrl\"")
    buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
    buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
  }

  signingConfigs {
    create("release") {
      val keystorePath = System.getenv("KEYSTORE_PATH")
      val storePasswordEnv = System.getenv("STORE_PASSWORD")
      val keyPasswordEnv = System.getenv("KEY_PASSWORD")
      if (!keystorePath.isNullOrBlank()) {
        val keystoreFile = file(keystorePath)
        if (keystoreFile.exists() && !storePasswordEnv.isNullOrBlank() && !keyPasswordEnv.isNullOrBlank()) {
          storeFile = keystoreFile
          storePassword = storePasswordEnv
          keyAlias = System.getenv("KEY_ALIAS") ?: "upload"
          keyPassword = keyPasswordEnv
        }
      }
    }
    create("debugConfig") {
      // Used only when a shared debug keystore is committed; otherwise the build type below falls
      // back to Android's built-in debug signing, which creates ~/.android/debug.keystore itself.
      storeFile = file("${rootDir}/debug.keystore")
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      val releaseSigning = signingConfigs.getByName("release")
      signingConfig = if (releaseSigning.storeFile != null) releaseSigning else null
    }
    debug {
      signingConfig = if (file("${rootDir}/debug.keystore").exists()) signingConfigs.getByName("debugConfig")
        else signingConfigs.getByName("debug")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions {
    unitTests {
      isIncludeAndroidResources = true
      all {
        // Offline Robolectric jars only where they exist (the original build machine); CI downloads them.
        val offline = file("/home/appuser/.m2/repository/org/robolectric/android-all-instrumented/16-robolectric-13921718-i7")
        if (offline.exists()) it.systemProperty("robolectric.dependency.dir", offline.path)
      }
    }
  }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

// Configure the Secrets Gradle Plugin to use .env and .env.example files
// to match the convention used in Web projects.
secrets {
  propertiesFileName = ".env"
  defaultPropertiesFileName = ".env.example"
  ignoreList.add("FIREBASE_APPCHECK_DEBUG_TOKEN")
  ignoreList.add("TEMPO_BACKEND_URL")
  ignoreList.add("TEMPO_API_BASE_URL")
  ignoreList.add("SUPABASE_URL")
  ignoreList.add("SUPABASE_ANON_KEY")
}

// googleServices { missingGoogleServicesStrategy = MissingGoogleServicesStrategy.WARN }

// Some unused dependencies are commented out below instead of being removed.
// This makes it easy to add them back in the future if needed.
dependencies {
  implementation(platform(libs.androidx.compose.bom))
  // implementation(platform(libs.firebase.bom))
  // implementation(libs.accompanist.permissions)
  implementation(libs.androidx.activity.compose)
  // implementation(libs.androidx.camera.camera2)
  // implementation(libs.androidx.camera.core)
  // implementation(libs.androidx.camera.lifecycle)
  // implementation(libs.androidx.camera.view)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.compose.material.icons.extended)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.navigation.compose)
  implementation(libs.androidx.room.ktx)
  implementation(libs.androidx.room.runtime)
  // implementation(libs.coil.compose)
  implementation(libs.converter.moshi)
  // implementation(libs.firebase.ai)
  // Uncomment to use Firestore:
  // implementation(libs.firebase.firestore)

  // Uncomment ALL FOUR of the following dependencies together to use Firebase Auth and Google
  // Sign-In via Credential Manager:
  // implementation(libs.firebase.auth)
  // implementation(libs.androidx.credentials)
  // implementation(libs.androidx.credentials.play.services)
  // implementation(libs.googleid)
  // implementation(libs.firebase.appcheck.recaptcha)
  // implementation(libs.firebase.appcheck.debug)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  implementation(libs.logging.interceptor)
  implementation(libs.moshi.kotlin)
  implementation(libs.okhttp)
  implementation(libs.play.integrity)
  implementation(libs.kotlinx.coroutines.play.services)
  // implementation(libs.play.services.location)
  implementation(libs.retrofit)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  testImplementation(libs.roborazzi)
  testImplementation(libs.roborazzi.compose)
  testImplementation(libs.roborazzi.junit.rule)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
  "ksp"(libs.androidx.room.compiler)
  "ksp"(libs.moshi.kotlin.codegen)
}
