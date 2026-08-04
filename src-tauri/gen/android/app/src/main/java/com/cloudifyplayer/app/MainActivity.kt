package com.cloudifyplayer.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  /**
   * Registered unconditionally, because `registerForActivityResult` must be
   * called before the activity is STARTED — asking for it lazily at the moment
   * playback begins would throw.
   */
  private val requestNotifications =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    askForNotificationPermission()
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
