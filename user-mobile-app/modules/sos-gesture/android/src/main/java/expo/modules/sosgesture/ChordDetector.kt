package expo.modules.sosgesture

/**
 * Recognizes volume up and volume down pressed together.
 *
 * Two places feed it. The accessibility service sees real key downs and ups while
 * the screen is on; the foreground service's media session sees only "volume
 * adjusted" steps while it is off, which arrive as taps with no release. Either
 * way, a press of one key while the other is held, or within [windowMs] of the
 * other's last press, is the chord. After firing it stays quiet for [cooldownMs],
 * so a chord held down (and its key repeats) places one call, not several.
 *
 * Times are milliseconds on one monotonic clock (SystemClock.uptimeMillis, which
 * is also KeyEvent.getEventTime's clock). Pure Kotlin, so it is unit tested on the JVM.
 */
class ChordDetector(
  private val windowMs: Long = DEFAULT_WINDOW_MS,
  private val cooldownMs: Long = DEFAULT_COOLDOWN_MS,
) {
  enum class Key { UP, DOWN }

  private val held = mutableSetOf<Key>()
  private val lastPress = mutableMapOf<Key, Long>()
  private var firedAt: Long? = null

  /** A key went down. Returns true when this press completes the chord. */
  fun press(key: Key, atMs: Long): Boolean {
    held += key
    val other = if (key == Key.UP) Key.DOWN else Key.UP
    val otherRecent = lastPress[other]?.let { atMs - it in 0..windowMs } ?: false
    lastPress[key] = atMs
    if (other !in held && !otherRecent) return false
    val last = firedAt
    if (last != null && atMs - last < cooldownMs) return false
    firedAt = atMs
    // The next chord needs fresh presses of both keys.
    lastPress.clear()
    return true
  }

  /** A key came back up. */
  fun release(key: Key) {
    held -= key
  }

  /** A press with no release to follow (a media session volume step). */
  fun tap(key: Key, atMs: Long): Boolean {
    val fired = press(key, atMs)
    release(key)
    return fired
  }

  companion object {
    /** Two presses this close together count as "together" even if they did not overlap. */
    const val DEFAULT_WINDOW_MS = 300L

    /** One call per chord: a held chord, or one pressed again at once, does not call twice. */
    const val DEFAULT_COOLDOWN_MS = 10_000L
  }
}
