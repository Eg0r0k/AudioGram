package com.eg.audiogram

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps the process out of the cached bucket while audio is playing.
 *
 * The WebView plays the audio, and the framework has no idea: as far as
 * ActivityManager is concerned a backgrounded Audiogram is an ordinary cached
 * process at IMPORTANCE_CACHED, which makes it a candidate for the
 * excessive-CPU killer (observed twice in exit-info as
 * `reason=2 SIGNALED / subreason=7 EXCESSIVE CPU USAGE`, at ~200MB RSS, so not
 * memory pressure). A foreground service of type mediaPlayback states the
 * obvious to the framework and takes the process out of that bucket.
 *
 * It does not affect the hidden-page media restrictions — process priority and
 * frame visibility are unrelated — so it is not a fix for playback stopping.
 */
class PlaybackService : Service() {
  companion object {
    private const val ACTION_START = "com.eg.audiogram.PLAYBACK_START"
    private const val ACTION_STOP = "com.eg.audiogram.PLAYBACK_STOP"

    /**
     * The notification the service should show. The bridge already builds one
     * for the media controls; handing it over avoids maintaining two.
     * Written on the main thread by MediaSessionBridge, read on the main
     * thread by onStartCommand.
     */
    @Volatile
    private var notification: Notification? = null

    @Volatile
    private var running = false

    /**
     * Publishes [current] and makes sure the service is up. Safe to call on
     * every notification refresh — a repeat start just re-posts.
     */
    fun start(context: Context, current: Notification) {
      notification = current
      val intent = Intent(context, PlaybackService::class.java).setAction(ACTION_START)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Exception) {
        // Android 12+ forbids starting a foreground service from the
        // background. Playback normally starts from the UI or from a media
        // button (both allowlisted), but a stray path must not crash — the
        // caller's own notify() still shows the controls.
        Logger.warn("PlaybackService: start refused: " + e.message)
      }
    }

    fun stop(context: Context) {
      notification = null
      if (!running) return
      try {
        context.stopService(Intent(context, PlaybackService::class.java).setAction(ACTION_STOP))
      } catch (e: Exception) {
        Logger.warn("PlaybackService: stop failed: " + e.message)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    val current = notification
    if (current == null) {
      // Nothing to show means nothing to keep alive.
      stopSelf()
      return START_NOT_STICKY
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          MediaSessionBridge.NOTIFICATION_ID,
          current,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
        )
      } else {
        startForeground(MediaSessionBridge.NOTIFICATION_ID, current)
      }
      running = true
    } catch (e: Exception) {
      Logger.warn("PlaybackService: startForeground refused: " + e.message)
      stopSelf()
      return START_NOT_STICKY
    }

    // Playback outlives a restart request only while the bridge keeps feeding
    // it notifications; recreating the service with no state would show a
    // stale card.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping the app away should not leave a playing card behind.
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }
}
