package expo.modules.sosgesture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Re-arms SOS after the phone restarts or the app is updated, if the person had it on. */
class SosBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in RESTART_ACTIONS || !SosSettings(context).enabled) return
    try {
      SosForegroundService.start(context)
    } catch (e: RuntimeException) {
      // e.g. ForegroundServiceStartNotAllowedException on a device with stricter rules.
      Log.w("SosGesture", "Could not re-arm SOS after ${intent.action}", e)
    }
  }

  private companion object {
    val RESTART_ACTIONS = setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED)
  }
}
