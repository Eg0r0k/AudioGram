package com.eg.audiogram

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
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
import androidx.core.content.ContextCompat
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

    private const val PLACEHOLDER_SIZE = 512
    private const val PLACEHOLDER_BACKGROUND = 0xFF202124.toInt()
    private const val PLACEHOLDER_GLYPH = 0xFF9AA0A6.toInt()
    private const val PLACEHOLDER_GLYPH_FRACTION = 0.42f
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  private var session: MediaSessionCompat? = null
  private var buttonReceiver: android.content.BroadcastReceiver? = null

  private var title = ""
  private var artist = ""
  private var album = ""
  private var artwork: Bitmap? = null
  private var placeholderArtwork: Bitmap? = null

  private var playing = false
  private var positionMs = 0L
  private var durationMs = 0L
  private var canSeek = false
  private var hasNext = false
  private var hasPrevious = false
  private var repeatMode = "off"
  private var liked = false
  private var canLike = false

  // ── JS-facing API (called on the WebView "JavaBridge" thread) ─────────────

  @JavascriptInterface
  fun setMetadata(title: String, artist: String, album: String, artworkBase64: String) {
    val bitmap = decodeArtwork(artworkBase64)
    mainHandler.post {
      val trackChanged = this.title != title || this.artist != artist
      this.title = title
      this.artist = artist
      this.album = album
      // No recycle(): the session/notification hold parcel copies, but the
      // original may still be referenced by an in-flight publish.
      this.artwork = bitmap
      // A fresh track's duration is unknown until the media loads; publishing
      // the previous track's value would draw its seek bar length here.
      if (trackChanged) this.durationMs = 0L
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
    repeatMode: String,
    liked: Boolean,
    canLike: Boolean,
  ) {
    mainHandler.post {
      val playStateChanged = this.playing != playing
      val actionsChanged = this.canSeek != canSeek || this.hasNext != hasNext ||
        this.hasPrevious != hasPrevious || this.repeatMode != repeatMode ||
        this.liked != liked || this.canLike != canLike
      val newDurationMs = safeMs(durationMs)
      val durationChanged = this.durationMs != newDurationMs
      this.playing = playing
      this.positionMs = safeMs(positionMs)
      this.durationMs = newDurationMs
      this.canSeek = canSeek
      this.hasNext = hasNext
      this.hasPrevious = hasPrevious
      this.repeatMode = repeatMode
      this.liked = liked
      this.canLike = canLike
      publishPlaybackState()
      // Metadata is the only channel that carries duration to the seek bar,
      // and it settles after the track-change metadata push.
      if (durationChanged) publishMetadata()
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
    artwork = null
    placeholderArtwork = null
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
      override fun onCustomAction(action: String?, extras: android.os.Bundle?) {
        if (action != null) dispatch(action)
      }
    })
    created.isActive = true
    session = created
    return created
  }

  // ── publishing ────────────────────────────────────────────────────────────

  /**
   * A metadata update that simply omits ALBUM_ART does not clear the art on
   * every system UI — MIUI keeps rendering the last bitmap it was handed, so a
   * track without a cover inherits the previous track's one while showing its
   * own title and artist. Publishing a placeholder instead of nothing makes
   * "no cover" mean no cover.
   */
  private fun artworkOrPlaceholder(): Bitmap? {
    artwork?.let { return it }
    placeholderArtwork?.let { return it }

    val bitmap = try {
      Bitmap.createBitmap(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, Bitmap.Config.ARGB_8888)
    } catch (_: Throwable) {
      // Out of memory here must not take playback down with it.
      return null
    }
    val canvas = Canvas(bitmap)
    canvas.drawColor(PLACEHOLDER_BACKGROUND)
    ContextCompat.getDrawable(activity, R.drawable.ic_stat_music)?.let { glyph ->
      val side = (PLACEHOLDER_SIZE * PLACEHOLDER_GLYPH_FRACTION).toInt()
      val inset = (PLACEHOLDER_SIZE - side) / 2
      glyph.setBounds(inset, inset, inset + side, inset + side)
      glyph.setTint(PLACEHOLDER_GLYPH)
      glyph.draw(canvas)
    }
    placeholderArtwork = bitmap
    return bitmap
  }

  private fun publishMetadata() {
    val builder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
    if (durationMs > 0) builder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
    // Always set the key — see artworkOrPlaceholder().
    builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artworkOrPlaceholder())
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
    val builder = PlaybackStateCompat.Builder()
      .setActions(actions)
      .setState(state, positionMs, if (playing) 1f else 0f)

    // Android 13+ renders custom actions as the extra buttons of the system
    // media controls; older versions get them via our own notification row.
    builder.addCustomAction(
      PlaybackStateCompat.CustomAction.Builder("repeat", "Repeat", repeatIcon()).build(),
    )
    if (canLike) {
      builder.addCustomAction(
        PlaybackStateCompat.CustomAction.Builder(
          "like",
          if (liked) "Unlike" else "Like",
          likeIcon(),
        ).build(),
      )
    }

    val session = ensureSession()
    session.setRepeatMode(
      when (repeatMode) {
        "one" -> PlaybackStateCompat.REPEAT_MODE_ONE
        "all" -> PlaybackStateCompat.REPEAT_MODE_ALL
        else -> PlaybackStateCompat.REPEAT_MODE_NONE
      },
    )
    session.setPlaybackState(builder.build())
  }

  private fun repeatIcon(): Int = when (repeatMode) {
    "one" -> R.drawable.ic_media_repeat_one
    "all" -> R.drawable.ic_media_repeat_on
    else -> R.drawable.ic_media_repeat_off
  }

  private fun likeIcon(): Int =
    if (liked) R.drawable.ic_media_like_filled else R.drawable.ic_media_like

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
      .setLargeIcon(artworkOrPlaceholder())
      .setContentIntent(contentIntent)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(playing)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)

    // Own vector icons: the framework's ic_media_* set renders with a dated
    // outlined look on pre-13 devices. Transport row stays in the compact
    // view (3 slots max); repeat/like show in the expanded card.
    val compactActions = mutableListOf<Int>()
    var actionIndex = 0
    builder.addAction(actionOf(repeatIcon(), "Repeat", "repeat"))
    actionIndex++
    if (hasPrevious) {
      builder.addAction(actionOf(R.drawable.ic_media_prev, "Previous", "previous"))
      compactActions.add(actionIndex)
      actionIndex++
    }
    builder.addAction(
      if (playing) actionOf(R.drawable.ic_media_pause, "Pause", "pause")
      else actionOf(R.drawable.ic_media_play, "Play", "play"),
    )
    compactActions.add(actionIndex)
    actionIndex++
    if (hasNext) {
      builder.addAction(actionOf(R.drawable.ic_media_next, "Next", "next"))
      compactActions.add(actionIndex)
      actionIndex++
    }
    if (canLike) {
      builder.addAction(actionOf(likeIcon(), if (liked) "Unlike" else "Like", "like"))
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

  private fun safeMs(value: Double): Long =
    if (value.isFinite()) value.toLong().coerceAtLeast(0L) else 0L

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
