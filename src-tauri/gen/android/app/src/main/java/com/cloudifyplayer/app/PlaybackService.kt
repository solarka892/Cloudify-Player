package com.cloudifyplayer.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Keeps playback alive while the app is in the background, and puts real
 * transport controls on the lock screen.
 *
 * The audio itself is played by the WebView — this service never touches a
 * sample. What it provides is the two things a WebView cannot:
 *
 *   1. **A reason for Android not to freeze us.** A backgrounded app has its
 *      WebView starved of CPU and is eventually frozen outright, which for a
 *      music player means the sound stopping on screen-off. A foreground service
 *      is the sanctioned way to say "this process is doing something the user
 *      asked for".
 *   2. **A `MediaSession`.** That is what populates the lock screen, the
 *      notification shade and Bluetooth displays, and how the system knows to
 *      route headset buttons and media keys to us.
 *
 * Commands arriving from any of those surfaces are forwarded to the frontend via
 * [CloudifyPlugin], which owns the actual player. `MediaSessionCompat` rather
 * than the platform class throughout: its token is what `MediaStyle` wants, and
 * it backports the media-button routing.
 */
class PlaybackService : Service() {

    private var session: MediaSessionCompat? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false

    /** Last state pushed in, so a bitmap arriving late can rebuild the same view. */
    private var current: State? = null

    /** One-at-a-time artwork fetches; a queue of them would only ever be stale. */
    private val artworkExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var artworkUrl: String? = null
    private var artwork: Bitmap? = null

    private data class State(
        val title: String,
        val artist: String,
        val artworkUrl: String?,
        val durationMs: Long,
        val positionMs: Long,
        val playing: Boolean,
        val canSkipNext: Boolean,
        val canSkipPrevious: Boolean,
    )

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()

        session = MediaSessionCompat(this, "cloudify").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() = forward(ACTION_PLAY)
                override fun onPause() = forward(ACTION_PAUSE)
                override fun onSkipToNext() = forward(ACTION_NEXT)
                override fun onSkipToPrevious() = forward(ACTION_PREVIOUS)
                override fun onStop() = forward(ACTION_STOP_PLAYBACK)
                override fun onSeekTo(pos: Long) = forward(ACTION_SEEK, pos)
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_UPDATE -> {
                val state = intent.toState()
                current = state
                if (state.playing) requestAudioFocus() else abandonAudioFocus()
                loadArtwork(state.artworkUrl)
                publish(state)
            }

            ACTION_TEARDOWN -> {
                stopSelfAndForeground()
                return START_NOT_STICKY
            }

            // A notification button: the user's intent is for the *player* to
            // act, so it goes to the frontend and comes back as an update.
            ACTION_PLAY, ACTION_PAUSE, ACTION_NEXT, ACTION_PREVIOUS -> {
                forward(intent.action!!)
            }
        }
        // Not sticky: a restart with no state would put up an empty notification
        // for a player that is not playing anything.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        artworkExecutor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        abandonAudioFocus()
        session?.isActive = false
        session?.release()
        session = null
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping the app away should not leave a notification behind for a
        // player that is about to be gone.
        stopSelfAndForeground()
        super.onTaskRemoved(rootIntent)
    }

    // ── surfaces ───────────────────────────────────────────────────────────

    private fun publish(state: State) {
        val session = session ?: return

        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.artist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, state.durationMs)
                .apply {
                    artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) }
                }
                .build(),
        )

        var actions = PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_STOP
        if (state.canSkipNext) actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
        if (state.canSkipPrevious) actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS

        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setState(
                    if (state.playing) {
                        PlaybackStateCompat.STATE_PLAYING
                    } else {
                        PlaybackStateCompat.STATE_PAUSED
                    },
                    state.positionMs,
                    if (state.playing) 1.0f else 0.0f,
                )
                .setActions(actions)
                .build(),
        )

        val notification = buildNotification(state)
        if (isForeground) {
            // Already up: replacing the notification avoids the flicker that
            // re-entering the foreground causes.
            notificationManager().notify(NOTIFICATION_ID, notification)
        } else {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                } else {
                    0
                },
            )
            isForeground = true
        }
    }

    private fun buildNotification(state: State): android.app.Notification {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(state.title)
            .setContentText(state.artist)
            .setLargeIcon(artwork)
            .setContentIntent(openAppIntent())
            .setDeleteIntent(servicePendingIntent(ACTION_TEARDOWN))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setShowWhen(false)
            // The transport controls are the point; anything else is noise.
            .setSilent(true)
            .setOngoing(state.playing)

        // Which buttons exist decides which indices `MediaStyle` can promote into
        // the compact view, so the two are built together.
        val compact = mutableListOf<Int>()
        if (state.canSkipPrevious) {
            builder.addAction(
                android.R.drawable.ic_media_previous,
                "Previous",
                servicePendingIntent(ACTION_PREVIOUS),
            )
            compact.add(compact.size)
        }
        builder.addAction(
            if (state.playing) {
                android.R.drawable.ic_media_pause
            } else {
                android.R.drawable.ic_media_play
            },
            if (state.playing) "Pause" else "Play",
            servicePendingIntent(if (state.playing) ACTION_PAUSE else ACTION_PLAY),
        )
        compact.add(compact.size)
        if (state.canSkipNext) {
            builder.addAction(
                android.R.drawable.ic_media_next,
                "Next",
                servicePendingIntent(ACTION_NEXT),
            )
            compact.add(compact.size)
        }

        builder.setStyle(
            androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session?.sessionToken)
                .setShowActionsInCompactView(*compact.toIntArray()),
        )
        return builder.build()
    }

    private fun openAppIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        return PendingIntent.getActivity(this, 0, intent, pendingIntentFlags())
    }

    private fun servicePendingIntent(action: String): PendingIntent {
        val intent = Intent(this, PlaybackService::class.java).setAction(action)
        return PendingIntent.getService(this, action.hashCode(), intent, pendingIntentFlags())
    }

    private fun pendingIntentFlags(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Playback",
            // Low: a persistent transport control should never make a sound or
            // push itself in front of anything.
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shows the current track and its controls"
            setShowBadge(false)
        }
        notificationManager().createNotificationChannel(channel)
    }

    private fun notificationManager() =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun stopSelfAndForeground() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        isForeground = false
        stopSelf()
    }

    // ── artwork ────────────────────────────────────────────────────────────

    /**
     * Fetch the cover for the notification and lock screen.
     *
     * The WebView has the image already, but its cache is not reachable from here
     * and a `Notification` needs a real `Bitmap`, so it is fetched again. Cheap in
     * practice: one small image per track change, served with cache headers the
     * platform honours.
     */
    private fun loadArtwork(url: String?) {
        if (url == artworkUrl) return
        artworkUrl = url
        artwork = null
        if (url == null) return

        artworkExecutor.execute {
            val bitmap = try {
                (URL(url).openConnection() as HttpURLConnection).run {
                    connectTimeout = ARTWORK_TIMEOUT_MS
                    readTimeout = ARTWORK_TIMEOUT_MS
                    inputStream.use { BitmapFactory.decodeStream(it) }
                }
            } catch (e: Exception) {
                // No cover is cosmetic; the controls still work without one.
                null
            }

            // A track change while this was in flight makes the result garbage.
            if (bitmap != null && url == artworkUrl) {
                artwork = bitmap
                // Touching a notification has to happen on the main thread.
                mainHandler.post { current?.let { publish(it) } }
            }
        }
    }

    // ── audio focus ────────────────────────────────────────────────────────

    /**
     * Claim audio focus so the rest of the system knows who is playing.
     *
     * Without it two apps talk over each other and nothing tells us to get out of
     * the way of a phone call. The frontend owns the player, so a focus change is
     * forwarded there rather than acted on here.
     */
    private fun requestAudioFocus() {
        if (hasAudioFocus) return
        val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build(),
                )
                .setOnAudioFocusChangeListener(focusListener)
                .build()
            audioFocusRequest = request
            manager.requestAudioFocus(request)
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(
                focusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN,
            )
        }
        hasAudioFocus = granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            -> forward(ACTION_PAUSE)

            AudioManager.AUDIOFOCUS_GAIN -> if (current?.playing == true) forward(ACTION_PLAY)
        }
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return
        val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(focusListener)
        }
        hasAudioFocus = false
    }

    // ── plumbing ───────────────────────────────────────────────────────────

    /** Hand a transport command to the frontend, which owns the player. */
    private fun forward(action: String, position: Long? = null) {
        CloudifyPlugin.emitMediaAction(action, position)
    }

    private fun Intent.toState() = State(
        title = getStringExtra(EXTRA_TITLE).orEmpty(),
        artist = getStringExtra(EXTRA_ARTIST).orEmpty(),
        artworkUrl = getStringExtra(EXTRA_ARTWORK),
        durationMs = getLongExtra(EXTRA_DURATION, 0L),
        positionMs = getLongExtra(EXTRA_POSITION, 0L),
        playing = getBooleanExtra(EXTRA_PLAYING, false),
        canSkipNext = getBooleanExtra(EXTRA_CAN_NEXT, false),
        canSkipPrevious = getBooleanExtra(EXTRA_CAN_PREVIOUS, false),
    )

    companion object {
        const val ACTION_UPDATE = "com.cloudifyplayer.app.UPDATE"
        const val ACTION_TEARDOWN = "com.cloudifyplayer.app.TEARDOWN"
        const val ACTION_PLAY = "com.cloudifyplayer.app.PLAY"
        const val ACTION_PAUSE = "com.cloudifyplayer.app.PAUSE"
        const val ACTION_NEXT = "com.cloudifyplayer.app.NEXT"
        const val ACTION_PREVIOUS = "com.cloudifyplayer.app.PREVIOUS"
        const val ACTION_STOP_PLAYBACK = "com.cloudifyplayer.app.STOP"
        const val ACTION_SEEK = "com.cloudifyplayer.app.SEEK"

        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_ARTWORK = "artwork"
        const val EXTRA_DURATION = "duration"
        const val EXTRA_POSITION = "position"
        const val EXTRA_PLAYING = "playing"
        const val EXTRA_CAN_NEXT = "canNext"
        const val EXTRA_CAN_PREVIOUS = "canPrevious"

        private const val CHANNEL_ID = "cloudify_playback"
        private const val NOTIFICATION_ID = 1
        private const val ARTWORK_TIMEOUT_MS = 8_000

        /**
         * Whether the notification is currently up.
         *
         * On the companion rather than the instance because `onStartCommand` can
         * be reached on a service the system recreated, and calling
         * `startForeground` twice flickers the notification.
         */
        @Volatile
        private var isForeground = false
    }
}
