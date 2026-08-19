package com.eg.audiogram

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestAudioPermission()
  }

  // The Music-folder binding reads /storage/emulated/0/Music via direct
  // paths, which needs the media-audio permission at runtime.
  private fun requestAudioPermission() {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      Manifest.permission.READ_MEDIA_AUDIO
    else
      Manifest.permission.READ_EXTERNAL_STORAGE

    if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(permission), 1)
    }
  }
}
