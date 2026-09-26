package expo.modules.sosgesture

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log

/**
 * One detector for the whole process, so presses seen by the accessibility service
 * and by the foreground service's media session count towards the same chord, and
 * one cooldown covers both.
 */
object SosEngine {
  private const val TAG = "SosGesture"
  private val detector = ChordDetector()

  /** Set while the JS module is alive, to tell the app the SOS fired. */
  @Volatile
  var listener: ((Map<String, Any>) -> Unit)? = null

  /** A volume key went down. [atMs] is on the SystemClock.uptimeMillis clock. */
  fun press(context: Context, key: ChordDetector.Key, atMs: Long, source: String) {
    if (!SosSettings(context).enabled) return
    val fired = synchronized(detector) { detector.press(key, atMs) }
    if (fired) trigger(context, source)
  }

  fun release(key: ChordDetector.Key) {
    synchronized(detector) { detector.release(key) }
  }

  /** A volume step with no release to follow (the screen-off media session). */
  fun tap(context: Context, key: ChordDetector.Key, atMs: Long, source: String) {
    if (!SosSettings(context).enabled) return
    val fired = synchronized(detector) { detector.tap(key, atMs) }
    if (fired) trigger(context, source)
  }

  /** Buzz so the person knows it worked without looking, then call. */
  fun trigger(context: Context, source: String): SosCaller.Result {
    val settings = SosSettings(context)
    Log.i(TAG, "SOS triggered by $source")
    vibrate(context)
    val result = SosCaller.call(context, settings.number)
    val record = SosSettings.LastTrigger(System.currentTimeMillis(), source, result.value)
    settings.recordTrigger(record)
    listener?.invoke(record.toMap())
    return result
  }

  private fun vibrate(context: Context) {
    try {
      val vibrator = context.getSystemService(Vibrator::class.java) ?: return
      vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 250, 120, 250), -1))
    } catch (e: RuntimeException) {
      Log.w(TAG, "Could not vibrate", e)
    }
  }
}
