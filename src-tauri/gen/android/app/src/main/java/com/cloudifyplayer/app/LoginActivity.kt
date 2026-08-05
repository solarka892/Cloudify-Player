package com.cloudifyplayer.app

import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * SoundCloud's sign-in page, in a WebView whose cookie jar we can read.
 *
 * The api-v2 bearer is only ever handed out as the web app's `oauth_token`
 * cookie, so signing in has to happen somewhere `CookieManager` can see — and
 * Tauri cannot open a second window on mobile to do it. Being Chromium rather
 * than WebKitGTK, this webview also tends to get past SoundCloud's anti-bot
 * check, which is what blocks the equivalent desktop flow.
 *
 * The result is left in [Result] for `CloudifyPlugin.pollLogin` to collect: the
 * plugin outlives this Activity, and a token is only a string.
 */
class LoginActivity : AppCompatActivity() {

    /**
     * Outcome of the last sign-in attempt, read by the plugin.
     *
     * Written from the main thread and read from whichever thread the plugin
     * command arrives on, hence `@Volatile`.
     */
    object Result {
        @Volatile
        var token: String? = null

        @Volatile
        var cancelled: Boolean = false

        fun reset() {
            token = null
            cancelled = false
        }
    }

    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())

    /** Re-checks the cookie jar until the token shows up. */
    private val pollCookies = object : Runnable {
        override fun run() {
            val token = readToken()
            if (token != null) {
                Result.token = token
                finish()
                return
            }
            handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Result.reset()

        CookieManager.getInstance().setAcceptCookie(true)

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Android WebView advertises itself with "; wv" in the UA, which is
            // an easy signal for anti-bot checks to refuse. Everything else about
            // the string stays honest — spoofing `navigator.*` is what actually
            // gets flagged.
            settings.userAgentString = settings.userAgentString?.replace("; wv", "")
            webViewClient = WebViewClient()
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // From targetSdk 35 the platform lays every window out edge to edge, so
        // the page would start underneath the status bar and end underneath the
        // gesture bar. SoundCloud's page knows nothing about either, so the inset
        // is applied here instead. White, because their sign-in pages are, and a
        // strip of the app's dark theme above a white page looks like a glitch.
        val root = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        root.addView(webView)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            // The soft keyboard covers the bottom of a form it is being typed
            // into, so it displaces the page rather than overlapping it.
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            insets
        }
        // Dark status bar icons: the app's own theme is dark, which on a white
        // page leaves the clock and the battery invisible.
        WindowInsetsControllerCompat(window, root).isAppearanceLightStatusBars = true

        setContentView(root)
        webView.loadUrl(SIGNIN_URL)

        // Backing out is a cancellation, not a silent no-op: the Rust side is
        // sitting in a poll loop waiting to hear either way.
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        Result.cancelled = true
                        finish()
                    }
                }
            },
        )
    }

    override fun onResume() {
        super.onResume()
        handler.post(pollCookies)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(pollCookies)
    }

    override fun onDestroy() {
        handler.removeCallbacks(pollCookies)
        // A dismissal we were not told about (task switcher, system kill) still
        // has to end the Rust poll loop rather than leave it waiting for the
        // full timeout.
        if (Result.token == null) {
            Result.cancelled = true
        }
        webView.destroy()
        super.onDestroy()
    }

    /**
     * The `oauth_token` value from the cookie jar, or null while it is absent.
     *
     * `CookieManager` reads the native store, so unlike `document.cookie` it can
     * see HttpOnly cookies — which is the whole reason this Activity exists.
     */
    private fun readToken(): String? =
        COOKIE_DOMAINS.asSequence().mapNotNull(::readTokenFrom).firstOrNull()

    private fun readTokenFrom(url: String): String? {
        val cookies = CookieManager.getInstance().getCookie(url) ?: return null
        return cookies.split(';')
            .asSequence()
            .map { it.trim() }
            .firstOrNull { it.startsWith("$TOKEN_COOKIE=") }
            ?.substringAfter('=')
            ?.takeIf { it.isNotEmpty() }
    }

    companion object {
        private const val SIGNIN_URL = "https://soundcloud.com/signin"

        /**
         * Where to look for the token, mobile host first.
         *
         * A phone user agent gets redirected to `m.soundcloud.com`, and the
         * `oauth_token` cookie is then set *host-only* on that host. `getCookie`
         * returns the domain cookies of whatever host it is asked about, so a
         * query for `soundcloud.com` cannot see it — which left the poll loop
         * running forever after a sign-in that had in fact succeeded. The
         * desktop host stays in the list because the redirect is the web app's
         * choice, not a promise.
         */
        private val COOKIE_DOMAINS = listOf(
            "https://m.soundcloud.com",
            "https://soundcloud.com",
        )
        private const val TOKEN_COOKIE = "oauth_token"
        private const val POLL_MS = 500L
    }
}
