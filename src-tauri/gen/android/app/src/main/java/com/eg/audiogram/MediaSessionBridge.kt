package com.eg.audiogram

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle

/**
 * Web Media Session -> Android MediaSession bridge.
 *
 * Android WebView implements `navigator.mediaSession` but never surfaces it as
 * a system media notification / lock-screen controls — only full browsers do.
 * The web side mirrors its media state into this bridge over a
 * `addJavascriptInterface` object, and transport controls come back through a
 * CustomEvent dispatched into the page.
 */
class MediaSessionBridge(
  private val activity: MainActivity,
  private val webView: WebView,
) {
  companion object {
    private const val CHANNEL_ID = "audiogram.playback"
    private const val NOTIFICATION_ID = 0xA7D1
    private const val ACTION_EVENT = "audiogram-media-action"
    private const val BUTTON_ACTION = "com.eg.audiogram.MEDIA_BUTTON"
    private const val EXTRA_COMMAND = "command"
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  private var session: MediaSessionCompat? = null
  private var buttonReceiver: android.content.BroadcastReceiver? = null

  private var title = ""
  private var artist = ""
  private var album = ""
  private var artwork: Bitmap? = null

  private var playing = false
  private var positionMs = 0L
  private var durationMs = 0L
  private var canSeek = false
  private var hasNext = false
  private var hasPrevious = false

  // ── JS-facing API (called on the WebView "JavaBridge" thread) ─────────────

  @JavascriptInterface
  fun setMetadata(title: String, artist: String, album: String, artworkBase64: String) {
    val bitmap = decodeArtwork(artworkBase64)
    mainHandler.post {
      this.title = title
      this.artist = artist
      this.album = album
      this.artwork?.recycle()
      this.artwork = bitmap
      publishMetadata()
      publishNotification()
    }
  }

  @JavascriptInterface
  fun setPlaybackState(
    playing: Boolean,
    positionMs: Double,
    durationMs: Double,
    canSeek: Boolean,
    hasNext: Boolean,
    hasPrevious: Boolean,
  ) {
    mainHandler.post {
      val playStateChanged = this.playing != playing
      val actionsChanged = this.canSeek != canSeek || this.hasNext != hasNext || this.hasPrevious != hasPrevious
      this.playing = playing
      this.positionMs = positionMs.toLong().coerceAtLeast(0L)
      this.durationMs = durationMs.toLong().coerceAtLeast(0L)
      this.canSeek = canSeek
      this.hasNext = hasNext
      this.hasPrevious = hasPrevious
      publishPlaybackState()
      // Re-posting the notification every position tick makes it flicker;
      // only the play/pause icon and action row depend on these flags.
      if (playStateChanged || actionsChanged) publishNotification()
    }
  }

  @JavascriptInterface
  fun release() {
    mainHandler.post { tearDown() }
  }

  // ── lifecycle (main thread) ───────────────────────────────────────────────

  fun destroy() {
    mainHandler.post { tearDown() }
  }

  private fun tearDown() {
    notificationManager().cancel(NOTIFICATION_ID)
    session?.run {
      isActive = false
      release()
    }
    session = null
    buttonReceiver?.let {
      try {
        activity.unregisterReceiver(it)
      } catch (_: Exception) {
        // already unregistered
      }
    }
    buttonReceiver = null
    artwork?.recycle()
    artwork = null
    title = ""
    artist = ""
    album = ""
    playing = false
  }

  private fun ensureButtonReceiver() {
    if (buttonReceiver != null) return
    val receiver = object : android.content.BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        val command = intent?.getStringExtra(EXTRA_COMMAND) ?: return
        dispatch(command)
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      activity.registerReceiver(
        receiver,
        android.content.IntentFilter(BUTTON_ACTION),
        Context.RECEIVER_NOT_EXPORTED,
      )
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      activity.registerReceiver(receiver, android.content.IntentFilter(BUTTON_ACTION))
    }
    buttonReceiver = receiver
  }

  private fun ensureSession(): MediaSessionCompat {
    session?.let { return it }
    ensureButtonReceiver()
    val created = MediaSessionCompat(activity, "AudiogramMediaSession")
    created.setCallback(object : MediaSessionCompat.Callback() {
      override fun onPlay() = dispatch("play")
      override fun onPause() = dispatch("pause")
      override fun onStop() = dispatch("stop")
      override fun onSkipToNext() = dispatch("next")
      override fun onSkipToPrevious() = dispatch("previous")
      override fun onSeekTo(pos: Long) = dispatch("seekto", pos)
    })
    created.isActive = true
    session = created
    return created
  }

  // ── publishing ────────────────────────────────────────────────────────────

  private fun publishMetadata() {
    val builder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
    if (durationMs > 0) builder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
    artwork?.let { builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) }
    ensureSession().setMetadata(builder.build())
  }

  private fun publishPlaybackState() {
    var actions = PlaybackStateCompat.ACTION_PLAY or
      PlaybackStateCompat.ACTION_PAUSE or
      PlaybackStateCompat.ACTION_PLAY_PAUSE or
      PlaybackStateCompat.ACTION_STOP
    if (canSeek) actions = actions or PlaybackStateCompat.ACTION_SEEK_TO
    if (hasNext) actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
    if (hasPrevious) actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS

    val state = if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
    ensureSession().setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(actions)
        .setState(state, positionMs, if (playing) 1f else 0f)
        .build(),
    )
  }

  @SuppressLint("MissingPermission")
  private fun publishNotification() {
    if (title.isEmpty() && artist.isEmpty()) return
    ensureChannel()

    val launchIntent = Intent(activity, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val contentIntent = PendingIntent.getActivity(
      activity, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = NotificationCompat.Builder(activity, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_music)
      .setContentTitle(title)
      .setContentText(artist)
      .setSubText(album.ifEmpty { null })
      .setLargeIcon(artwork)
      .setContentIntent(contentIntent)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(playing)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)

    val compactActions = mutableListOf<Int>()
    if (hasPrevious) {
      builder.addAction(actionOf(android.R.drawable.ic_media_previous, "Previous", "previous"))
      compactActions.add(compactActions.size)
    }
    builder.addAction(
      if (playing) actionOf(android.R.drawable.ic_media_pause, "Pause", "pause")
      else actionOf(android.R.drawable.ic_media_play, "Play", "play"),
    )
    compactActions.add(compactActions.size)
    if (hasNext) {
      builder.addAction(actionOf(android.R.drawable.ic_media_next, "Next", "next"))
      compactActions.add(compactActions.size)
    }

    builder.setStyle(
      MediaStyle()
        .setMediaSession(ensureSession().sessionToken)
        .setShowActionsInCompactView(*compactActions.toIntArray()),
    )

    try {
      notificationManager().notify(NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // Notifications permission denied — session (lock screen / headset)
      // controls still work without the notification card.
    }
  }

  private fun actionOf(icon: Int, label: String, action: String): NotificationCompat.Action {
    // Android 13+ builds the media-control buttons from PlaybackState actions
    // (through the session callback); these notification actions only matter
    // on older versions, where they broadcast back to our in-app receiver.
    val intent = Intent(BUTTON_ACTION)
      .setPackage(activity.packageName)
      .putExtra(EXTRA_COMMAND, action)
    val pending = PendingIntent.getBroadcast(
      activity,
      action.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Action(icon, label, pending)
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = notificationManager()
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Playback",
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun notificationManager(): NotificationManager =
    activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  // ── helpers ───────────────────────────────────────────────────────────────

  private fun decodeArtwork(base64: String): Bitmap? {
    if (base64.isEmpty()) return null
    return try {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Exception) {
      null
    }
  }

  private fun dispatch(action: String, positionMs: Long = -1L) {
    mainHandler.post {
      val detail =
        if (positionMs >= 0) "{\"action\":\"$action\",\"positionMs\":$positionMs}"
        else "{\"action\":\"$action\"}"
      webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('$ACTION_EVENT',{detail:$detail}))",
        null,
      )
    }
  }
}
