package com.cloudifyplayer.app

import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
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
    private lateinit var root: FrameLayout
    private val handler = Handler(Looper.getMainLooper())

    /**
     * The popup window, while one is open.
     *
     * "Continue with Google" (and Apple, and Facebook) is a `window.open`, and an
     * Android WebView that has not been told it may have more than one window
     * does not merely refuse it — it takes the *current* window to `about:blank`,
     * which is a white screen with no error, no back and no way forward. That was
     * the whole bug: the sign-in page did not fail, it disappeared.
     */
    private var popup: WebView? = null

    /**
     * The token that was already in the jar when this screen opened, which is
     * never a sign-in *we* just watched happen.
     *
     * A token SoundCloud has stopped accepting still sits in the cookie jar, and
     * the poll below cannot tell it from a fresh one — it reads it within half a
     * second, so the screen closed itself before the form even rendered, the app
     * stored a dead token, `/me` rejected it, and pressing sign-in again found
     * the same cookie. Recording the old value (and expiring the cookie, so
     * SoundCloud actually shows the form) is what breaks that loop.
     */
    private var staleToken: String? = null

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
        // Before the page loads, not after: the poll starts in `onResume`.
        staleToken = readToken()
        clearToken()

        webView = newWebView()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message,
            ): Boolean = openPopup(resultMsg)
        }

        // From targetSdk 35 the platform lays every window out edge to edge, so
        // the page would start underneath the status bar and end underneath the
        // gesture bar. SoundCloud's page knows nothing about either, so the inset
        // is applied here instead. White, because their sign-in pages are, and a
        // strip of the app's dark theme above a white page looks like a glitch.
        root = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
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
                    // The popup owns back while it is up — otherwise the only way
                    // out of an OAuth screen is to abandon the whole sign-in.
                    val open = popup
                    if (open != null) {
                        if (open.canGoBack()) open.goBack() else closePopup()
                    } else if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        Result.cancelled = true
                        finish()
                    }
                }
            },
        )
    }

    /**
     * A WebView configured the way this screen needs, for both the sign-in page
     * and any window it opens.
     *
     * Shared rather than duplicated because the settings are load-bearing on the
     * popup too: the user-agent fix is what an OAuth provider looks at to decide
     * whether it is talking to a browser, and a popup left on the stock string
     * gets refused on sight.
     */
    private fun newWebView(): WebView = WebView(this).apply {
        layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        // "Continue with Google" is a popup, and these two are what make one
        // possible at all. Without them `window.open` does not open a window —
        // it blanks the one you are looking at.
        settings.setSupportMultipleWindows(true)
        settings.javaScriptCanOpenWindowsAutomatically = true
        // Android WebView advertises itself with "; wv" in the UA, which is
        // an easy signal for anti-bot checks to refuse. Everything else about
        // the string stays honest — spoofing `navigator.*` is what actually
        // gets flagged.
        settings.userAgentString = settings.userAgentString?.replace("; wv", "")
        webViewClient = WebViewClient()
        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
    }

    /**
     * Give the page the window it asked for.
     *
     * Laid over the sign-in page rather than beside it: it is a modal step in one
     * flow, and the page underneath is not interactive while it is up. The token
     * still arrives the same way — `CookieManager` is process-wide, so whichever
     * window completes the sign-in, the cookie lands in the one jar the poll
     * loop is watching.
     */
    private fun openPopup(resultMsg: Message): Boolean {
        closePopup()

        val window = newWebView()
        window.webChromeClient = object : WebChromeClient() {
            override fun onCloseWindow(view: WebView) = closePopup()

            // A provider that opens a further window of its own — an account
            // chooser, a 2FA step — reuses this one rather than being refused.
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message,
            ): Boolean = openPopup(resultMsg)
        }

        root.addView(window)
        popup = window

        val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
        transport.webView = window
        resultMsg.sendToTarget()
        return true
    }

    private fun closePopup() {
        val open = popup ?: return
        popup = null
        root.removeView(open)
        open.destroy()
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
        closePopup()
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
        COOKIE_DOMAINS.asSequence().mapNotNull(::readTokenFrom).firstOrNull { it != staleToken }

    /**
     * Expire the token cookie on every host we look at.
     *
     * By name rather than `removeAllCookies`, which would also drop SoundCloud's
     * anti-bot cookies and invite the captcha this webview exists to avoid. Both
     * a host-only and a domain cookie can carry the name, and expiring one does
     * not remove the other, so both are written.
     */
    private fun clearToken() {
        val cookies = CookieManager.getInstance()
        for (url in COOKIE_DOMAINS) {
            cookies.setCookie(url, "$TOKEN_COOKIE=; Max-Age=0; Path=/")
            cookies.setCookie(url, "$TOKEN_COOKIE=; Max-Age=0; Path=/; Domain=$COOKIE_DOMAIN")
        }
        cookies.flush()
    }

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

        /** Covers both hosts above, for the domain-cookie form of the token. */
        private const val COOKIE_DOMAIN = ".soundcloud.com"
        private const val POLL_MS = 500L
    }
}
