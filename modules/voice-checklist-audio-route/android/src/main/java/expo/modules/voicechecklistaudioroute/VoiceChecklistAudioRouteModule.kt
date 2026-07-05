package expo.modules.voicechecklistaudioroute

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "VoiceChecklistAudioRoute"

// Routes checklist audio away from the phone earpiece while a run is active.
// Bluetooth is preferred when available; otherwise the built-in speaker is used.
// Logs decisions under the TAG above so the route can be diagnosed on-device via
// `adb logcat -s VoiceChecklistAudioRoute`.
class VoiceChecklistAudioRouteModule : Module() {
  private val audioManager: AudioManager
    get() {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      return context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

  private fun audioManagerOrNull(): AudioManager? {
    val context = appContext.reactContext ?: return null
    return context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
  }

  private var active = false
  private var activeRouteTarget: CommunicationRouteTarget? = null
  private var previousMode: Int? = null
  private var previousSpeakerphoneOn: Boolean? = null
  private var previousBluetoothScoOn: Boolean? = null
  private var activeAudioManager: AudioManager? = null
  private var routedSpeechEngine: RoutedSpeechEngine? = null
  private val routeLeases = AudioRouteLeases()

  override fun definition() = ModuleDefinition {
    Name("VoiceChecklistAudioRoute")

    OnActivityDestroys { cleanupAfterActivityDestroyed() }

    AsyncFunction("start") {
      startRunRoute(audioManager)
    }

    AsyncFunction("stop") {
      stopRunRoute(audioManager)
    }

    AsyncFunction("isSpeechAvailable") { promise: Promise ->
      getRoutedSpeechEngineOrNull()?.isAvailable(promise) ?: promise.resolve(false)
    }

    AsyncFunction("speakRouted") { text: String, locale: String, promise: Promise ->
      // Speech can run after voice startup is unavailable, so playback also
      // acquires the route before using the voice-call stream.
      val manager = audioManager
      val releasePlaybackRoute =
        try {
          startPlaybackRoute(manager)
        } catch (error: Throwable) {
          promise.reject(TTS_ERROR_CODE, "Android audio route failed before speech playback.", error)
          return@AsyncFunction
        }
      if (releasePlaybackRoute == null) {
        promise.reject(TTS_ERROR_CODE, "Android audio route unavailable for speech playback.", null)
        return@AsyncFunction
      }

      val engine = getRoutedSpeechEngineOrNull()
      if (engine == null) {
        releasePlaybackRoute()
        promise.reject(TTS_ERROR_CODE, "Android text-to-speech context is unavailable.", null)
        return@AsyncFunction
      }

      engine.speak(text, locale, promise, releasePlaybackRoute)
    }

    AsyncFunction("stopRoutedSpeech") {
      routedSpeechEngine?.stop()
    }
  }

  @Synchronized
  private fun getRoutedSpeechEngineOrNull(): RoutedSpeechEngine? {
    routedSpeechEngine?.let { return it }
    val context = appContext.reactContext ?: return null
    return RoutedSpeechEngine(context).also { routedSpeechEngine = it }
  }

  @Synchronized
  private fun shutdownRoutedSpeechEngine() {
    routedSpeechEngine?.shutdown()
    routedSpeechEngine = null
  }

  @Synchronized
  private fun cleanupAfterActivityDestroyed() {
    shutdownRoutedSpeechEngine()
    val manager = activeAudioManager ?: audioManagerOrNull()
    if (manager != null && active) {
      stopRouteNow(manager)
      return
    }

    if (routeLeases.releaseAllRoutes()) {
      Log.w(TAG, "activity destroyed without an active audio route; cleared route leases only")
    }
    active = false
    activeRouteTarget = null
    previousSpeakerphoneOn = null
    previousMode = null
    previousBluetoothScoOn = null
    activeAudioManager = null
  }

  @Synchronized
  private fun startRunRoute(manager: AudioManager): Boolean {
    val routed = startRoute(manager)
    if (routed) routeLeases.holdRunRoute()
    return routed
  }

  @Synchronized
  private fun stopRunRoute(manager: AudioManager) {
    Log.i(TAG, "stop run route active=$active")
    if (routeLeases.releaseRunRoute() && active) stopRouteNow(manager)
  }

  @Synchronized
  private fun startPlaybackRoute(manager: AudioManager): (() -> Unit)? {
    val routed = startRoute(manager)
    if (!routed) return null
    if (routeLeases.hasRunRoute) return {}

    routeLeases.holdPlaybackRoute()
    return { releasePlaybackRoute(manager) }
  }

  @Synchronized
  private fun releasePlaybackRoute(manager: AudioManager) {
    if (routeLeases.releasePlaybackRoute() && active) stopRouteNow(manager)
  }

  @Synchronized
  private fun startRoute(manager: AudioManager): Boolean {
    Log.i(TAG, "start sdkInt=${Build.VERSION.SDK_INT} mode=${manager.mode} active=$active")
    val availableDevices =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val available = manager.availableCommunicationDevices
        Log.i(TAG, "availableCommunicationDevices=${available.map { it.type }}")
        Log.i(TAG, "communicationDevice before=${manager.communicationDevice?.type}")
        available
      } else {
        emptyList()
      }
    val target =
      chooseCommunicationRouteTarget(
        sdkInt = Build.VERSION.SDK_INT,
        communicationDeviceTypes = availableDevices.map { it.type },
        bluetoothScoAvailableOffCall = manager.isBluetoothScoAvailableOffCallCompat(),
      )
    val routeDevice =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        findCommunicationDevice(availableDevices, target)
      } else {
        null
      }

    Log.i(TAG, "selected target=$target routeDevice=${routeDevice?.type}")

    if (active) {
      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      if (currentRouteIsReady(manager, target)) {
        Log.i(TAG, "start resolved target=$target routed=true (already active)")
        activeRouteTarget = target
        activeAudioManager = manager
        return true
      }

      Log.w(TAG, "active route is not ready for target=$target; rerouting")
      val rerouted =
        try {
          routeToTarget(manager, target, routeDevice)
        } catch (error: Throwable) {
          stopRouteNow(manager)
          Log.e(TAG, "reroute failed", error)
          throw error
        }
      if (!rerouted) {
        stopRouteNow(manager)
        Log.i(TAG, "start resolved target=$target rerouted=false (restored audio state)")
        return false
      }
      activeRouteTarget = target
      activeAudioManager = manager
      settleRoute(target)
      Log.i(TAG, "start resolved target=$target routed=true (rerouted)")
      return true
    }

    previousMode = manager.mode
    @Suppress("DEPRECATION")
    previousSpeakerphoneOn = manager.isSpeakerphoneOn
    @Suppress("DEPRECATION")
    previousBluetoothScoOn = manager.isBluetoothScoOn

    manager.mode = AudioManager.MODE_IN_COMMUNICATION

    val routed =
      try {
        routeToTarget(manager, target, routeDevice)
      } catch (error: Throwable) {
        // Routing threw after the audio mode may have changed; restore so a
        // failure cannot strand the device in communication mode.
        restorePreviousAudioState(manager)
        Log.e(TAG, "start failed", error)
        throw error
      }

    if (!routed) {
      restorePreviousAudioState(manager)
      Log.i(TAG, "start resolved target=$target routed=false (restored audio state)")
      return false
    }

    active = true
    activeRouteTarget = target
    activeAudioManager = manager
    settleRoute(target)
    Log.i(TAG, "start resolved target=$target routed=true")
    return true
  }

  @Synchronized
  private fun stopRouteNow(manager: AudioManager) {
    Log.i(TAG, "stop route active=$active")
    if (active) clearActiveRoute(manager)
    restorePreviousAudioState(manager)
    active = false
    activeAudioManager = null
    routeLeases.reset()
  }

  private fun findCommunicationDevice(
    devices: List<AudioDeviceInfo>,
    target: CommunicationRouteTarget,
  ): AudioDeviceInfo? =
    when (target) {
      CommunicationRouteTarget.BLUETOOTH ->
        devices.firstOrNull { isBluetoothCommunicationDeviceType(it.type) }
      CommunicationRouteTarget.SPEAKER ->
        devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
    }

  private fun routeToTarget(
    manager: AudioManager,
    target: CommunicationRouteTarget,
    routeDevice: AudioDeviceInfo?,
  ): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (routeDevice == null) {
        Log.w(TAG, "no communication device found for target=$target")
        return false
      }
      val result = manager.setCommunicationDevice(routeDevice)
      Log.i(TAG, "setCommunicationDevice result=$result communicationDevice after=${manager.communicationDevice?.type}")
      return result
    }

    return when (target) {
      CommunicationRouteTarget.BLUETOOTH -> {
        @Suppress("DEPRECATION")
        manager.isSpeakerphoneOn = true
        Log.w(TAG, "Bluetooth communication routing is unavailable before Android 12; speakerphone enabled")
        true
      }
      CommunicationRouteTarget.SPEAKER -> {
        @Suppress("DEPRECATION")
        manager.isSpeakerphoneOn = true
        Log.i(TAG, "speakerphone enabled")
        true
      }
    }
  }

  private fun currentRouteIsReady(
    manager: AudioManager,
    target: CommunicationRouteTarget,
  ): Boolean {
    val communicationDeviceType =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        manager.communicationDevice?.type
      } else {
        null
      }
    @Suppress("DEPRECATION")
    val speakerphoneOn = manager.isSpeakerphoneOn
    return isCommunicationRouteReady(
      sdkInt = Build.VERSION.SDK_INT,
      target = target,
      communicationDeviceType = communicationDeviceType,
      speakerphoneOn = speakerphoneOn,
    )
  }

  private fun settleRoute(target: CommunicationRouteTarget) {
    val delayMillis = routeSettleDelayMillis(target)
    if (delayMillis <= 0L) return
    Log.i(TAG, "settling target=$target delayMs=$delayMillis")
    try {
      Thread.sleep(delayMillis)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
  }

  @Synchronized
  private fun clearActiveRoute(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      manager.clearCommunicationDevice()
      activeRouteTarget = null
      return
    }

    if (activeRouteTarget == CommunicationRouteTarget.BLUETOOTH) {
      @Suppress("DEPRECATION")
      manager.stopBluetoothSco()
      @Suppress("DEPRECATION")
      manager.isBluetoothScoOn = previousBluetoothScoOn ?: false
    }
    activeRouteTarget = null
  }

  private fun restorePreviousAudioState(manager: AudioManager) {
    previousSpeakerphoneOn?.let {
      @Suppress("DEPRECATION")
      manager.isSpeakerphoneOn = it
    }
    previousMode?.let { manager.mode = it }

    previousSpeakerphoneOn = null
    previousMode = null
    previousBluetoothScoOn = null
    activeRouteTarget = null
  }

  private fun AudioManager.isBluetoothScoAvailableOffCallCompat(): Boolean {
    @Suppress("DEPRECATION")
    return isBluetoothScoAvailableOffCall
  }
}
