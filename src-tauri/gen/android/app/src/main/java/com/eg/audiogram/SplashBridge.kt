package com.eg.audiogram

import android.webkit.JavascriptInterface

/**
 * Lets the web app end the launch splash once it has actually painted its
 * UI. Without this the splash would drop on the activity's first frame,
 * which is a blank WebView still loading the bundle.
 */
class SplashBridge {
  @Volatile
  var isReady = false
    private set

  @JavascriptInterface
  fun hide() {
    isReady = true
  }
}
