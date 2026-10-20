plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "me.copycat.squee"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "me.copycat.squee"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        resourceConfigurations += listOf("zh", "en")
        // QA switch: `./gradlew assembleDebug -Psquee.forceWebgl=true` pins the WebGL 2 path,
        // which is what devices whose WebView has no WebGPU will take.
        buildConfigField("boolean", "FORCE_WEBGL", project.hasProperty("squee.forceWebgl").toString())
        // QA switch: `-Psquee.shake=3` appends `?shake=3`, tumbling the cat three times on launch.
        buildConfigField("int", "SCRIPTED_SHAKE", ((project.findProperty("squee.shake") as String?)?.toIntOrNull() ?: 0).toString())
    }

    signingConfigs {
        // Placeholder debug signing; release signing is configured in M6 from a local upload keystore.
        create("release") {
            val storePath = (project.findProperty("squee.storeFile") as String?)
            if (storePath != null) {
                storeFile = file(storePath)
                storePassword = project.findProperty("squee.storePassword") as String
                keyAlias = project.findProperty("squee.keyAlias") as String
                keyPassword = project.findProperty("squee.keyPassword") as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if ((project.findProperty("squee.storeFile") as String?) != null) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        // The soft-body bundle is already minified; keep it uncompressed so the WebView can stream it.
        resources.excludes += setOf("META-INF/*.kotlin_module")
    }

    androidResources {
        noCompress += listOf("js", "css", "wasm", "woff2")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3") // ComponentActivity + predictive back dispatcher
    implementation("androidx.webkit:webkit:1.12.1") // WebViewAssetLoader
}
