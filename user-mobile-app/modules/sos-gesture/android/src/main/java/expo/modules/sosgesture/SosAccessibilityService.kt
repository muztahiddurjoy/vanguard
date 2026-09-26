package expo.modules.sosgesture

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

/**
 * Hears the volume buttons whatever is on screen: another app, the home screen or
 * the lock screen. Android only hands key events to an app in front, or to an
 * accessibility service that asks to filter them, which is why this exists.
 *
 * It reads the two volume keys and nothing else, and never consumes them, so the
 * volume still changes as usual. The screen must be on: Android does not pass keys
 * to accessibility services while it is off (SosForegroundService covers that).
 */
class SosAccessibilityService : AccessibilityService() {
  override fun onKeyEvent(event: KeyEvent): Boolean {
    val key = when (event.keyCode) {
      KeyEvent.KEYCODE_VOLUME_UP -> ChordDetector.Key.UP
      KeyEvent.KEYCODE_VOLUME_DOWN -> ChordDetector.Key.DOWN
      else -> return false
    }
    when (event.action) {
      KeyEvent.ACTION_DOWN ->
        if (event.repeatCount == 0) SosEngine.press(this, key, event.eventTime, SOURCE)
      KeyEvent.ACTION_UP -> SosEngine.release(key)
    }
    return false
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

  override fun onInterrupt() = Unit

  companion object {
    const val SOURCE = "volumeButtons"

    /** Whether the person switched this service on in the system's accessibility settings. */
    fun isEnabled(context: Context): Boolean {
      val mine = ComponentName(context, SosAccessibilityService::class.java)
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
      ) ?: return false
      return enabled.split(':').any { ComponentName.unflattenFromString(it) == mine }
    }
  }
}
