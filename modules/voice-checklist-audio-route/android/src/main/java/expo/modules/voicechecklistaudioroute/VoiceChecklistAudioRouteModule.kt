package expo.modules.voicechecklistaudioroute

import android.content.Context
import android.os.PowerManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Speaks checklist items through Android media audio, allowing the OS to route
// playback to Bluetooth when connected and speaker otherwise.
class VoiceChecklistAudioRouteModule : Module() {
  private var routedSpeechEngine: RoutedSpeechEngine? = null
  private var countdownWakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("VoiceChecklistAudioRoute")

    OnActivityDestroys {
      shutdownRoutedSpeechEngine()
      releaseCountdownWakeLock()
    }

    AsyncFunction("isSpeechAvailable") { promise: Promise ->
      getRoutedSpeechEngineOrNull()?.isAvailable(promise) ?: promise.resolve(false)
    }

    AsyncFunction("speakRouted") { text: String, locale: String, promise: Promise ->
      val engine = getRoutedSpeechEngineOrNull()
      if (engine == null) {
        promise.reject(TTS_ERROR_CODE, "Android text-to-speech context is unavailable.", null)
        return@AsyncFunction
      }

      engine.speak(text, locale, promise)
    }

    AsyncFunction("stopRoutedSpeech") {
      routedSpeechEngine?.stop()
    }

    // Keeps the processor awake while a step's countdown runs with the screen
    // off, so the run moves on on time. The timeout is a safety net in case
    // a release is missed; JS releases it when the countdown ends.
    Function("acquireCountdownWakeLock") { timeoutMs: Double ->
      acquireCountdownWakeLock(timeoutMs.toLong())
      null
    }

    Function("releaseCountdownWakeLock") {
      releaseCountdownWakeLock()
      null
    }
  }

  @Synchronized
  private fun getRoutedSpeechEngineOrNull(): RoutedSpeechEngine? {
    routedSpeechEngine?.let { return it }
    val context = appContext.reactContext ?: return null
    return RoutedSpeechEngine(context).also { routedSpeechEngine = it }
  }

  @Synchronized
  private fun acquireCountdownWakeLock(timeoutMs: Long) {
    val context = appContext.reactContext ?: return
    val lock = countdownWakeLock ?: (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VoiceChecklist:countdown")
      .also {
        it.setReferenceCounted(false)
        countdownWakeLock = it
      }
    lock.acquire(timeoutMs.coerceAtLeast(1000L))
  }

  @Synchronized
  private fun releaseCountdownWakeLock() {
    countdownWakeLock?.let { if (it.isHeld) it.release() }
  }

  @Synchronized
  private fun shutdownRoutedSpeechEngine() {
    routedSpeechEngine?.shutdown()
    routedSpeechEngine = null
  }
}
