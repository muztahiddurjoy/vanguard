package expo.modules.sosgesture

import expo.modules.sosgesture.ChordDetector.Key.DOWN
import expo.modules.sosgesture.ChordDetector.Key.UP
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChordDetectorTest {
  @Test
  fun `both keys held at once is the chord`() {
    val d = ChordDetector()
    assertFalse(d.press(UP, 1_000))
    assertTrue(d.press(DOWN, 2_000)) // up is still held, however long ago it went down
  }

  @Test
  fun `one key on its own never fires`() {
    val d = ChordDetector()
    assertFalse(d.press(UP, 1_000))
    d.release(UP)
    assertFalse(d.press(UP, 1_100))
    d.release(UP)
    assertFalse(d.press(UP, 1_200))
  }

  @Test
  fun `presses that do not overlap count only inside the window`() {
    val d = ChordDetector(windowMs = 300)
    d.press(UP, 1_000)
    d.release(UP)
    assertTrue(d.press(DOWN, 1_250))

    val late = ChordDetector(windowMs = 300)
    late.press(UP, 1_000)
    late.release(UP)
    assertFalse(late.press(DOWN, 1_400)) // turning the volume up, then down
  }

  @Test
  fun `media session taps inside the window fire`() {
    val d = ChordDetector(windowMs = 300)
    assertFalse(d.tap(DOWN, 5_000))
    assertTrue(d.tap(UP, 5_040))
  }

  @Test
  fun `media session taps of the same key never fire`() {
    val d = ChordDetector()
    for (t in 0L..2_000L step 50) assertFalse(d.tap(UP, t)) // a held key's repeats
  }

  @Test
  fun `a held chord fires once, then waits out the cooldown`() {
    val d = ChordDetector(windowMs = 300, cooldownMs = 10_000)
    d.press(UP, 1_000)
    assertTrue(d.press(DOWN, 1_010))
    // Key repeats and fresh presses while the call is being placed.
    assertFalse(d.press(DOWN, 1_500))
    assertFalse(d.press(UP, 1_550))
    d.release(UP)
    d.release(DOWN)
    d.press(UP, 9_000)
    assertFalse(d.press(DOWN, 9_050))
    d.release(UP)
    d.release(DOWN)
    // After the cooldown the chord works again.
    d.press(UP, 12_000)
    assertTrue(d.press(DOWN, 12_050))
  }

  @Test
  fun `the chord needs fresh presses after it fires`() {
    val d = ChordDetector(windowMs = 300, cooldownMs = 100)
    d.tap(UP, 1_000)
    assertTrue(d.tap(DOWN, 1_050))
    // DOWN's press was used by that chord, so a lone UP just after is not a new one.
    assertFalse(d.tap(UP, 1_200))
  }

  @Test
  fun `a press from an earlier clock reading does not count`() {
    val d = ChordDetector(windowMs = 300)
    d.tap(UP, 5_000)
    assertFalse(d.tap(DOWN, 4_900))
  }
}
