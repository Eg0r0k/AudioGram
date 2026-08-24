package com.eg.audiogram

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * Routes the hardware back button to open overlays without consulting
 * WebView.canGoBack().
 *
 * The web layer used to claim back presses by pushing a sentinel history entry
 * per open surface, leaving TauriActivity's canGoBack() check to hand the press
 * to the page. Chromium's history-manipulation intervention breaks that: it
 * marks pushState entries skippable, CanGoBack() then excludes them, and the
 * activity minimises with an overlay still on screen. Measured on device — the
 * page received no popstate at all, its history untouched, while the task went
 * to the background.
 *
 * So the page states how many back steps it owns and the activity asks it
 * directly, which depends on nothing Chromium may reinterpret.
 */
class BackBridge(
  private val webView: WebView,
) {
  companion object {
    private const val BACK_EVENT = "audiogram-back"
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  private var depth = 0

  /** Called from JS whenever the number of dismissible steps changes. */
  @JavascriptInterface
  fun setOverlayDepth(depth: Int) {
    this.depth = depth.coerceAtLeast(0)
  }

  /** Whether the page wants the next back press. */
  fun claimsBack(): Boolean = depth > 0

  /**
   * Hands the press to the page. Optimistically drops the local count so a
   * double press cannot be swallowed twice if the page is slow to report back;
   * the next setOverlayDepth reconciles it.
   */
  fun dispatchBack() {
    if (depth > 0) depth -= 1
    mainHandler.post {
      webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('$BACK_EVENT'))",
        null,
      )
    }
  }
}
