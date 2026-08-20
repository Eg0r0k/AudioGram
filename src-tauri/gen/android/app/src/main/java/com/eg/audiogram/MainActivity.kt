package com.eg.audiogram

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  // TauriActivity opts out of WebView-history back handling; opt back in so
  // the system back button pops webview history (overlay sentinels pushed by
  // useOverlayBackButton, then router entries) before closing the activity.
  override val handleBackNavigation: Boolean = true

  private var mediaSessionBridge: MediaSessionBridge? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestRuntimePermissions()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    val bridge = MediaSessionBridge(this, webView)
    mediaSessionBridge = bridge
    webView.addJavascriptInterface(bridge, "AudiogramMediaSession")
  }

  override fun onDestroy() {
    mediaSessionBridge?.destroy()
    mediaSessionBridge = null
    super.onDestroy()
  }

  // Media-audio: the Music-folder binding reads /storage/emulated/0/Music via
  // direct paths. Notifications: the playback media notification on 13+.
  private fun requestRuntimePermissions() {
    val wanted = mutableListOf(
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
        Manifest.permission.READ_MEDIA_AUDIO
      else
        Manifest.permission.READ_EXTERNAL_STORAGE,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      wanted.add(Manifest.permission.POST_NOTIFICATIONS)
    }

    val missing = wanted.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    if (missing.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
    }
  }
}
