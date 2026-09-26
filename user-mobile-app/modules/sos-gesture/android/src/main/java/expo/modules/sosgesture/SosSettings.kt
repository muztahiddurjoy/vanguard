package expo.modules.sosgesture

import android.content.Context
import android.content.pm.PackageManager

/**
 * What the SOS services need when the app itself is not running: whether the
 * person turned SOS on, the number to call, and the last time it fired.
 */
class SosSettings(context: Context) {
  private val appContext = context.applicationContext
  private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  var enabled: Boolean
    get() = prefs.getBoolean(KEY_ENABLED, false)
    set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

  /** The number from app.json (the sos-gesture config plugin writes it into the manifest). */
  val number: String
    get() = configuredNumber(appContext)

  val lastTrigger: LastTrigger?
    get() {
      val at = prefs.getLong(KEY_LAST_AT, 0L)
      if (at == 0L) return null
      return LastTrigger(
        at = at,
        source = prefs.getString(KEY_LAST_SOURCE, null) ?: "unknown",
        result = prefs.getString(KEY_LAST_RESULT, null) ?: "unknown",
      )
    }

  fun recordTrigger(trigger: LastTrigger) {
    prefs.edit()
      .putLong(KEY_LAST_AT, trigger.at)
      .putString(KEY_LAST_SOURCE, trigger.source)
      .putString(KEY_LAST_RESULT, trigger.result)
      .apply()
  }

  data class LastTrigger(val at: Long, val source: String, val result: String) {
    fun toMap(): Map<String, Any> = mapOf("at" to at.toDouble(), "source" to source, "result" to result)
  }

  companion object {
    private const val PREFS = "expo.modules.sosgesture"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_LAST_AT = "lastTriggeredAt"
    private const val KEY_LAST_SOURCE = "lastSource"
    private const val KEY_LAST_RESULT = "lastResult"
    const val NUMBER_META_DATA = "expo.modules.sosgesture.NUMBER"

    fun configuredNumber(context: Context): String {
      @Suppress("DEPRECATION")
      val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      return info.metaData?.getString(NUMBER_META_DATA).orEmpty()
    }
  }
}
