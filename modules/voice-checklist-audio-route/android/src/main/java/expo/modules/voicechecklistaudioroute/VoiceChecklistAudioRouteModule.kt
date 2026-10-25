package expo.modules.voicechecklistaudioroute

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Speaks checklist items through Android media audio, allowing the OS to route
// playback to Bluetooth when connected and speaker otherwise.
class VoiceChecklistAudioRouteModule : Module() {
  private var routedSpeechEngine: RoutedSpeechEngine? = null

  override fun definition() = ModuleDefinition {
    Name("VoiceChecklistAudioRoute")

    OnActivityDestroys { shutdownRoutedSpeechEngine() }

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
}
