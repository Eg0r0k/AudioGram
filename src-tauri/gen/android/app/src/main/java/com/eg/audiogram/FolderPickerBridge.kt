package com.eg.audiogram

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * SAF folder picker bridge for watched folders.
 *
 * tauri-plugin-dialog has no directory picker on Android; this bridge lets
 * the web side launch `ACTION_OPEN_DOCUMENT_TREE` (registered as an activity
 * result launcher in [MainActivity]) and receive the picked tree URI back as
 * a CustomEvent — the same `addJavascriptInterface` idiom as
 * [MediaSessionBridge].
 *
 * Protocol: `window.AudiogramFolderPicker.pick(requestId)` →
 * `audiogram-folder-picked` CustomEvent with `{ requestId, uri | null }`
 * (null = cancelled or launch failure). One request at a time: a pick while
 * another is pending answers the new request with null immediately.
 */
class FolderPickerBridge(
  private val activity: MainActivity,
  private val webView: WebView,
) {
  companion object {
    private const val PICKED_EVENT = "audiogram-folder-picked"
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private var pendingRequestId: String? = null

  @JavascriptInterface
  fun pick(requestId: String) {
    mainHandler.post {
      if (pendingRequestId != null) {
        dispatch(requestId, null)
        return@post
      }
      pendingRequestId = requestId
      try {
        activity.launchFolderPicker()
      } catch (_: Exception) {
        pendingRequestId = null
        dispatch(requestId, null)
      }
    }
  }

  /** Called by [MainActivity] with the launcher result (null = cancelled). */
  fun deliver(uri: Uri?) {
    val requestId = pendingRequestId ?: return
    pendingRequestId = null
    dispatch(requestId, uri?.toString())
  }

  private fun dispatch(requestId: String, uri: String?) {
    // JSONObject handles the escaping of both strings; JSONObject.NULL
    // serializes to a JSON null literal.
    val detail = JSONObject()
      .put("requestId", requestId)
      .put("uri", uri ?: JSONObject.NULL)
    mainHandler.post {
      webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('$PICKED_EVENT',{detail:$detail}))",
        null,
      )
    }
  }
}
