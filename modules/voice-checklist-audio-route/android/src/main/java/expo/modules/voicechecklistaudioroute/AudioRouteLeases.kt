package expo.modules.voicechecklistaudioroute

internal class AudioRouteLeases {
  private var runRouteHeld = false
  private var playbackRouteHolders = 0

  val hasRunRoute: Boolean
    get() = runRouteHeld

  val hasAnyRoute: Boolean
    get() = runRouteHeld || playbackRouteHolders > 0

  fun holdRunRoute() {
    runRouteHeld = true
  }

  fun holdPlaybackRoute() {
    playbackRouteHolders += 1
  }

  fun releaseRunRoute(): Boolean {
    runRouteHeld = false
    return shouldStopRoute
  }

  fun releasePlaybackRoute(): Boolean {
    if (playbackRouteHolders > 0) playbackRouteHolders -= 1
    return shouldStopRoute
  }

  fun releaseAllRoutes(): Boolean {
    val hadRoute = hasAnyRoute
    reset()
    return hadRoute
  }

  fun reset() {
    runRouteHeld = false
    playbackRouteHolders = 0
  }

  private val shouldStopRoute: Boolean
    get() = !runRouteHeld && playbackRouteHolders == 0
}
