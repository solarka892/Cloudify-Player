package com.cloudifyplayer.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
internal class SetSecretArgs {
    lateinit var key: String
    lateinit var value: String
}

@InvokeArg
internal class KeyArgs {
    lateinit var key: String
}

@InvokeArg
internal class PlaybackArgs {
    var title: String = ""
    var artist: String = ""
    var artworkUrl: String? = null
    var durationMs: Long = 0
    var positionMs: Long = 0
    var playing: Boolean = false
    var canSkipNext: Boolean = false
    var canSkipPrevious: Boolean = false
}

/**
 * Everything on Android that Rust cannot do for itself.
 *
 * See `src-tauri/src/android/mod.rs` for the calling side and why each of these
 * exists. Commands are named to match it exactly — the pairing is by string, so a
 * rename on one side is a runtime failure, not a compile error.
 *
 * The `POST_NOTIFICATIONS` permission is declared here so the frontend can ask
 * for it through Tauri's standard `requestPermissions`. It is not required for
 * playback to keep working: without it the foreground service still runs, the
 * notification is simply not shown.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
    ],
)
class CloudifyPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: WebView) {
        super.load(webView)
        // The playback service needs to reach the frontend to forward lock-screen
        // and headset commands, and it has no handle on the plugin otherwise.
        active = this
    }

    // ── secure storage ─────────────────────────────────────────────────────

    @Command
    fun setSecret(invoke: Invoke) {
        val args = invoke.parseArgs(SetSecretArgs::class.java)
        SecureStore.set(activity, args.key, args.value)
        invoke.resolve()
    }

    @Command
    fun getSecret(invoke: Invoke) {
        val args = invoke.parseArgs(KeyArgs::class.java)
        val result = JSObject()
        // Absent rather than null when there is nothing: the Rust side treats a
        // missing field as "not logged in".
        SecureStore.get(activity, args.key)?.let { result.put("value", it) }
        invoke.resolve(result)
    }

    @Command
    fun deleteSecret(invoke: Invoke) {
        val args = invoke.parseArgs(KeyArgs::class.java)
        SecureStore.delete(activity, args.key)
        invoke.resolve()
    }

    // ── sign-in ────────────────────────────────────────────────────────────

    @Command
    fun startLogin(invoke: Invoke) {
        LoginActivity.Result.reset()
        activity.startActivity(Intent(activity, LoginActivity::class.java))
        invoke.resolve()
    }

    @Command
    fun pollLogin(invoke: Invoke) {
        val result = JSObject()
        LoginActivity.Result.token?.let { result.put("token", it) }
        result.put("cancelled", LoginActivity.Result.cancelled)
        invoke.resolve(result)
    }

    @Command
    fun cancelLogin(invoke: Invoke) {
        LoginActivity.Result.reset()
        invoke.resolve()
    }

    // ── background playback ────────────────────────────────────────────────

    @Command
    fun updatePlayback(invoke: Invoke) {
        val args = invoke.parseArgs(PlaybackArgs::class.java)

        val intent = Intent(activity, PlaybackService::class.java).apply {
            action = PlaybackService.ACTION_UPDATE
            putExtra(PlaybackService.EXTRA_TITLE, args.title)
            putExtra(PlaybackService.EXTRA_ARTIST, args.artist)
            putExtra(PlaybackService.EXTRA_ARTWORK, args.artworkUrl)
            putExtra(PlaybackService.EXTRA_DURATION, args.durationMs)
            putExtra(PlaybackService.EXTRA_POSITION, args.positionMs)
            putExtra(PlaybackService.EXTRA_PLAYING, args.playing)
            putExtra(PlaybackService.EXTRA_CAN_NEXT, args.canSkipNext)
            putExtra(PlaybackService.EXTRA_CAN_PREVIOUS, args.canSkipPrevious)
        }

        // From Oreo on, a background app may only start a service that promises
        // to go into the foreground — which this one does, in `publish`.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(intent)
        } else {
            activity.startService(intent)
        }
        invoke.resolve()
    }

    @Command
    fun stopPlayback(invoke: Invoke) {
        activity.startService(
            Intent(activity, PlaybackService::class.java)
                .setAction(PlaybackService.ACTION_TEARDOWN),
        )
        invoke.resolve()
    }

    companion object {
        /**
         * The live plugin, for [PlaybackService] to reach the frontend through.
         *
         * A service is a separate object with no route back to the plugin, and
         * both live as long as the process, so a static reference is the whole
         * mechanism. Written on load and read from the service's threads.
         */
        @Volatile
        private var active: CloudifyPlugin? = null

        /**
         * Forward a transport command to the frontend, which owns the player.
         *
         * Delivered as `plugin:cloudify|mediaAction`; the frontend subscribes with
         * `addPluginListener`. Dropped when nothing is listening yet — the app is
         * not playing anything at that point anyway.
         */
        fun emitMediaAction(action: String, positionMs: Long?) {
            val plugin = active ?: return
            val payload = JSObject().apply {
                put("action", action)
                positionMs?.let { put("positionMs", it) }
            }
            plugin.trigger("mediaAction", payload)
        }
    }
}
