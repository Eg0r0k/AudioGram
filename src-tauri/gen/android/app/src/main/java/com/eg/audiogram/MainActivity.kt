package com.eg.audiogram

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
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
  private var backBridge: BackBridge? = null
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

    val back = BackBridge(webView)
    backBridge = back
    webView.addJavascriptInterface(back, "AudiogramBack")
    // Registered after super's canGoBack() callback, and the dispatcher runs
    // callbacks newest-first, so this one decides before that check is ever
    // reached — see BackBridge for why the check cannot be trusted.
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (back.claimsBack()) {
            back.dispatchBack()
            return
          }
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
        }
      },
    )
  }

  /** Opens the SAF folder picker; the result lands in [FolderPickerBridge]. */
  fun launchFolderPicker() {
    folderPickerLauncher.launch(null)
  }

  override fun onDestroy() {
    mediaSessionBridge?.destroy()
    mediaSessionBridge = null
    folderPickerBridge = null
    backBridge = null
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
