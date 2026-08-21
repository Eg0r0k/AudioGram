package com.eg.audiogram

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  // TauriActivity opts out of WebView-history back handling; opt back in so
  // the system back button pops webview history (overlay sentinels pushed by
  // useOverlayBackButton, then router entries) before closing the activity.
  override val handleBackNavigation: Boolean = true

  private var mediaSessionBridge: MediaSessionBridge? = null
  private var folderPickerBridge: FolderPickerBridge? = null
  private lateinit var folderPickerLauncher: ActivityResultLauncher<Uri?>

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Launchers must be registered before the activity is resumed.
    folderPickerLauncher = registerForActivityResult(
      ActivityResultContracts.OpenDocumentTree(),
    ) { uri -> folderPickerBridge?.deliver(uri) }
    requestRuntimePermissions()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    val bridge = MediaSessionBridge(this, webView)
    mediaSessionBridge = bridge
    webView.addJavascriptInterface(bridge, "AudiogramMediaSession")

    val folderPicker = FolderPickerBridge(this, webView)
    folderPickerBridge = folderPicker
    webView.addJavascriptInterface(folderPicker, "AudiogramFolderPicker")
  }

  /** Opens the SAF folder picker; the result lands in [FolderPickerBridge]. */
  fun launchFolderPicker() {
    folderPickerLauncher.launch(null)
  }

  override fun onDestroy() {
    mediaSessionBridge?.destroy()
    mediaSessionBridge = null
    folderPickerBridge = null
    super.onDestroy()
  }

  // Media-audio: watched folders read public storage via direct paths (audio
  // files under any public folder once granted). Notifications: the playback
  // media notification on 13+.
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
