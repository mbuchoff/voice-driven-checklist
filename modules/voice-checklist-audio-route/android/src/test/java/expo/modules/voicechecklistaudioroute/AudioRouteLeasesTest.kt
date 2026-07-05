package expo.modules.voicechecklistaudioroute

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioRouteLeasesTest {
  @Test
  fun releasesPlaybackOnlyRouteWhenSpeechSettles() {
    val leases = AudioRouteLeases()
    leases.holdPlaybackRoute()

    assertTrue(leases.releasePlaybackRoute())
  }

  @Test
  fun keepsRunRouteAfterSpeechSettles() {
    val leases = AudioRouteLeases()
    leases.holdRunRoute()

    assertFalse(leases.releasePlaybackRoute())
  }

  @Test
  fun keepsRouteUntilPlaybackAndRunAreBothReleased() {
    val leases = AudioRouteLeases()
    leases.holdRunRoute()
    leases.holdPlaybackRoute()

    assertFalse(leases.releaseRunRoute())
    assertTrue(leases.releasePlaybackRoute())
  }

  @Test
  fun releasesAllRoutesOnLifecycleTeardown() {
    val leases = AudioRouteLeases()
    leases.holdRunRoute()
    leases.holdPlaybackRoute()

    assertTrue(leases.releaseAllRoutes())
    assertFalse(leases.hasAnyRoute)
  }
}
