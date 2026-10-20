# squee has no reflection-based code; the WebView bundle is plain JS and already minified.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
