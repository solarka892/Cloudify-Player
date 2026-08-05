package com.cloudifyplayer.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.Locale

class MainActivity : TauriActivity() {
  /**
   * Registered unconditionally, because `registerForActivityResult` must be
   * called before the activity is STARTED — asking for it lazily at the moment
   * playback begins would throw.
   */
  private val requestNotifications =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

  /** Kept only to re-publish the insets on resume; the webview is Tauri's. */
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    askForNotificationPermission()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    publishInsets(webView)
  }

  override fun onResume() {
    super.onResume()
    // Coming back from the sign-in screen, or a dev-server reload, starts a
    // document that has never been told the insets. Asking again is cheap.
    syncInsets()
  }

  /**
   * Re-publish the insets into whatever document is loaded now.
   *
   * Both the first inset dispatch and the first `onResume` happen before the
   * frontend's document exists, so the properties they set are thrown away with
   * the page they were set on. The frontend therefore asks for them itself once
   * it has mounted, through `syncInsets` on the plugin.
   */
  fun syncInsets() {
    webView?.let { view -> view.post { view.requestApplyInsets() } }
  }

  /**
   * Hand the real system-bar insets to CSS as `--inset-top`/`--inset-bottom`
   * and so on, in CSS pixels.
   *
   * `env(safe-area-inset-*)` cannot carry this on Android: the webview fills
   * those from the display cutout alone. On a notched phone the top value is
   * therefore right by coincidence and the bottom one is 0 with a gesture bar
   * plainly there — which left the tab bar's labels underneath it. See
   * `pt-safe`/`pb-safe` in `src/styles/globals.css` for the consuming end.
   */
  private fun publishInsets(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val density = view.resources.displayMetrics.density
      // Locale.US: a decimal comma would not be CSS.
      fun css(px: Int) = String.format(Locale.US, "%.2fpx", px / density)
      webView.evaluateJavascript(
        """
        (() => {
          const s = document.documentElement.style;
          s.setProperty('--inset-top', '${css(bars.top)}');
          s.setProperty('--inset-right', '${css(bars.right)}');
          s.setProperty('--inset-bottom', '${css(bars.bottom)}');
          s.setProperty('--inset-left', '${css(bars.left)}');
        })()
        """.trimIndent(),
        null,
      )
      insets
    }
  }

  /**
   * Ask for POST_NOTIFICATIONS on Android 13+.
   *
   * The permission is declared in the manifest but was never requested, so the
   * transport notification simply never appeared — playback worked, but the
   * lock-screen and shade controls that `PlaybackService` exists to provide did
   * not, and the only way to turn them on was to find the app in system
   * settings. Asked once at launch; Android itself suppresses the dialog after
   * the user has answered, so there is no need to remember that here.
   *
   * Declining costs the notification and nothing else — the foreground service
   * still holds the process up, so audio keeps playing with the screen off.
   */
  private fun askForNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val granted =
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    if (granted) return
    requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
  }
}
