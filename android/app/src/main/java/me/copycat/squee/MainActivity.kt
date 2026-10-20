package me.copycat.squee

import android.annotation.SuppressLint
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * squee · 猫咪牛奶布丁
 *
 * One full-screen WebView serving the bundled build of lunaark/milk-meow-jelly from an
 * https://appassets.androidplatform.net origin. The https origin is required: the page is an ES
 * module bundle (blocked on file:// by CORS) and secure-context-only APIs such as navigator.gpu
 * need a trustworthy origin. The app is fully offline; nothing but the bundled assets is reachable.
 */
class MainActivity : ComponentActivity() {

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(ASSET_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private lateinit var webView: WebView
    private var lastOrientation: Int = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw behind the system bars and keep the page inside the safe area (see the inset listener).
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION") // Pre-Android 15 still needs the bar colours to be transparent.
        run {
            window.statusBarColor = Color.TRANSPARENT
            window.navigationBarColor = Color.TRANSPARENT
        }

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(BACKGROUND)
            overScrollMode = View.OVER_SCROLL_NEVER
            isLongClickable = false
            setOnLongClickListener { true }
            webViewClient = BundleOnlyClient(assetLoader)
            webChromeClient = ConsoleBridge
            with(settings) {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                cacheMode = WebSettings.LOAD_NO_CACHE
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                mediaPlaybackRequiresUserGesture = true
                textZoom = 100 // ignore the system font scale so the fixed HUD layout stays intact
            }
        }
        setContentView(webView)

        // Android 15 (targetSdk 35) forces edge-to-edge; the cat must not hide behind the bars.
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            Log.i("squee", "decor insets t=${bars.top} b=${bars.bottom}")
            webView.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // The toy is a single bundled page: the only history entries it ever creates are
                // in-page anchors, so every back press leaves the app instead of feeling stuck.
                finish()
            }
        })

        if (savedInstanceState == null) webView.loadUrl(PAGE_URL) else webView.restoreState(savedInstanceState)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // WebGPU canvases inside Android WebView can wedge their compositor when the surface is
        // resized, leaving a blank page after rotation. Reloading the bundled page re-creates the
        // device and swapchain; the chosen flavour is restored from localStorage by the page.
        val rotated=newConfig.orientation!=lastOrientation
        lastOrientation=newConfig.orientation
        if(rotated) {
            webView.postDelayed({ if(!isFinishing&&!isDestroyed)webView.reload() },ROTATION_RELOAD_DELAY_MS)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    /** Serves the bundle only; every other host is refused so the app stays offline. */
    private class BundleOnlyClient(
        private val loader: WebViewAssetLoader,
    ) : WebViewClient() {
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == ASSET_DOMAIN) return false
            Log.w("squee", "Blocked off-bundle navigation: $url")
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            reportCapabilities(view)
        }
    }

    /** Mirrors page console output to logcat so GPU capability probes can be read over adb. */
    private object ConsoleBridge : WebChromeClient() {
        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            Log.i("squee", "page: ${message.message()} @${message.lineNumber()}")
            return true
        }
    }

    companion object {
        private const val ASSET_DOMAIN = "appassets.androidplatform.net"
        private const val ROTATION_RELOAD_DELAY_MS = 700L

        /** QA query flags: `?webgl` pins the WebGL 2 path, `?shake=n` tumbles the cat n times. */
        private val PAGE_URL = "https://$ASSET_DOMAIN/assets/dist/index.html" +
            (if (BuildConfig.FORCE_WEBGL) "?webgl" else "") +
            (if (BuildConfig.SCRIPTED_SHAKE > 0) "?shake=${BuildConfig.SCRIPTED_SHAKE}" else "")

        /** Matches the pudding stage background so the inset padding blends into the page. */
        private const val BACKGROUND = 0xFFF1E9DF.toInt()

        /** Logs which render backend the page obtained, for on-device verification (M0/M4). */
        fun reportCapabilities(webView: WebView) {
            val script = """
                (function(){try{
                  var gpu=!!navigator.gpu;
                  var c=document.createElement('canvas'),gl2=!!c.getContext('webgl2');
                  console.log('PROBE gpu='+gpu+' webgl2='+gl2+' ua='+navigator.userAgent);
                  if(gpu)navigator.gpu.requestAdapter().then(function(a){console.log('PROBE adapter='+(a?'yes':'null'));});
                }catch(e){console.log('PROBE error='+e.message);}})();
            """.trimIndent()
            webView.post { webView.evaluateJavascript(script, null) }
        }
    }
}
