package expo.modules.voicechecklistaudioroute

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import expo.modules.kotlin.Promise
import java.util.ArrayDeque
import java.util.Locale
import java.util.Queue
import java.util.UUID

internal const val TTS_ERROR_CODE = "ERR_VOICE_CHECKLIST_TTS"

private const val TAG = "VoiceChecklistAudioRoute"
private const val TTS_ROUTE_WARMUP_TEXT = "a"
private const val TTS_ROUTE_WARMUP_VOLUME = 0.0f

internal class RoutedSpeechEngine(
  private val maxSpeechInputLength: Int = Int.MAX_VALUE,
  private val logInfo: (String) -> Unit = {},
  private val createSynthesizer: (
    listener: RoutedSpeechSynthesizerListener,
    onInitialized: (Int) -> Unit,
  ) -> RoutedSpeechSynthesizer,
) {
  constructor(context: Context) : this(
    maxSpeechInputLength = TextToSpeech.getMaxSpeechInputLength(),
    logInfo = { message -> Log.i(TAG, message) },
    createSynthesizer = { listener, onInitialized ->
      AndroidRoutedSpeechSynthesizer(context, listener, onInitialized)
    }
  )

  private val pendingSpeech: Queue<RoutedSpeech> = ArrayDeque()
  private val pendingSpeechAvailability: Queue<Promise> = ArrayDeque()
  private val activeSpeech = mutableMapOf<String, RoutedSpeech>()
  private var synthesizer: RoutedSpeechSynthesizer? = null
  private var initializing = false
  private var ready = false
  private var failed = false
  private var initGeneration = 0

  @Synchronized
  fun isAvailable(promise: Promise) {
    when {
      ready -> promise.resolve(true)
      failed -> promise.resolve(false)
      else -> {
        pendingSpeechAvailability.add(promise)
        ensureStartedLocked()
      }
    }
  }

  @Synchronized
  fun speak(text: String, locale: String, promise: Promise, onSettled: () -> Unit) {
    if (text.length > maxSpeechInputLength) {
      promise.reject(TTS_ERROR_CODE, "Speech input text is too long.", null)
      onSettled()
      return
    }

    val speech = RoutedSpeech(
      id = UUID.randomUUID().toString(),
      text = text,
      locale = locale,
      promise = promise,
      onSettled = onSettled,
    )

    when {
      ready -> speakLocked(speech)
      failed -> rejectSpeech(speech, "Android text-to-speech is unavailable.")
      else -> {
        completePendingSpeechLocked()
        pendingSpeech.add(speech)
        ensureStartedLocked()
      }
    }
  }

  @Synchronized
  fun stop() {
    synthesizer?.stop()
    completeAllActiveSpeechLocked()
    completePendingSpeechLocked()
  }

  @Synchronized
  fun shutdown() {
    initGeneration += 1
    synthesizer?.stop()
    synthesizer?.shutdown()
    synthesizer = null
    initializing = false
    ready = false
    failed = false
    completeAllActiveSpeechLocked()
    completePendingSpeechLocked()
    resolvePendingSpeechAvailabilityLocked(false)
  }

  private fun ensureStartedLocked() {
    if (synthesizer != null || initializing || failed) return

    initializing = true
    val generation = initGeneration
    synthesizer =
      createSynthesizer(
        object : RoutedSpeechSynthesizerListener {
          override fun onStart(utteranceId: String) {
            val kind = if (utteranceId.endsWith(":route-warmup")) "route-warmup" else "speech"
            logInfo("routed TTS started kind=$kind")
          }

          override fun onDone(utteranceId: String) {
            completeSpeech(utteranceId)
          }

          override fun onStop(utteranceId: String) {
            completeSpeech(utteranceId)
          }

          override fun onError(utteranceId: String) {
            rejectActiveSpeech(utteranceId, "Android text-to-speech failed during playback.")
          }
        },
        { status -> onInitialized(generation, status) },
      )
  }

  @Synchronized
  private fun onInitialized(generation: Int, status: Int) {
    if (generation != initGeneration) return
    initializing = false
    if (status != TextToSpeech.SUCCESS) {
      failed = true
      resolvePendingSpeechAvailabilityLocked(false)
      rejectPendingSpeechLocked("Android text-to-speech failed to initialize.")
      return
    }

    ready = true
    logInfo("routed TTS initialized usage=VOICE_COMMUNICATION")
    resolvePendingSpeechAvailabilityLocked(true)
    while (pendingSpeech.isNotEmpty()) {
      speakLocked(pendingSpeech.remove())
    }
  }

  private fun speakLocked(speech: RoutedSpeech) {
    val tts = checkNotNull(synthesizer)
    val locale = Locale.forLanguageTag(speech.locale)
    val languageAvailable = tts.isLanguageAvailable(locale)
    tts.language =
      if (
        languageAvailable != TextToSpeech.LANG_MISSING_DATA &&
        languageAvailable != TextToSpeech.LANG_NOT_SUPPORTED
      ) {
        locale
      } else {
        Locale.getDefault()
      }

    completeAllActiveSpeechLocked()
    activeSpeech[speech.id] = speech
    val warmupResult = tts.speakRouteWarmup(
      utteranceId = "${speech.id}:route-warmup",
      volume = TTS_ROUTE_WARMUP_VOLUME,
    )
    logInfo("speakRouted warmup result=$warmupResult volume=$TTS_ROUTE_WARMUP_VOLUME")
    if (warmupResult == TextToSpeech.ERROR) {
      rejectActiveSpeechLocked(speech.id, "Android text-to-speech rejected the route warmup.")
      return
    }
    val result = tts.speak(speech.text, speech.id)
    logInfo("speakRouted result=$result stream=VOICE_CALL textLength=${speech.text.length}")
    if (result == TextToSpeech.ERROR) {
      rejectActiveSpeechLocked(speech.id, "Android text-to-speech rejected the utterance.")
    }
  }

  @Synchronized
  private fun completeSpeech(utteranceId: String) {
    activeSpeech.remove(utteranceId)?.let { speech ->
      speech.promise.resolve()
      speech.onSettled()
    }
  }

  @Synchronized
  private fun rejectActiveSpeech(utteranceId: String, message: String) {
    rejectActiveSpeechLocked(utteranceId, message)
  }

  private fun completeAllActiveSpeechLocked() {
    val speeches = activeSpeech.values.toList()
    activeSpeech.clear()
    speeches.forEach { speech ->
      speech.promise.resolve()
      speech.onSettled()
    }
  }

  private fun completePendingSpeechLocked() {
    while (pendingSpeech.isNotEmpty()) {
      val speech = pendingSpeech.remove()
      speech.promise.resolve()
      speech.onSettled()
    }
  }

  private fun rejectActiveSpeechLocked(utteranceId: String, message: String) {
    activeSpeech.remove(utteranceId)?.let { speech ->
      speech.promise.reject(TTS_ERROR_CODE, message, null)
      speech.onSettled()
    }
  }

  private fun rejectSpeech(speech: RoutedSpeech, message: String) {
    speech.promise.reject(TTS_ERROR_CODE, message, null)
    speech.onSettled()
  }

  private fun rejectPendingSpeechLocked(message: String) {
    while (pendingSpeech.isNotEmpty()) {
      rejectSpeech(pendingSpeech.remove(), message)
    }
  }

  private fun resolvePendingSpeechAvailabilityLocked(available: Boolean) {
    while (pendingSpeechAvailability.isNotEmpty()) {
      pendingSpeechAvailability.remove().resolve(available)
    }
  }
}

private data class RoutedSpeech(
  val id: String,
  val text: String,
  val locale: String,
  val promise: Promise,
  val onSettled: () -> Unit,
)

internal interface RoutedSpeechSynthesizer {
  var language: Locale

  fun isLanguageAvailable(locale: Locale): Int

  fun speakRouteWarmup(utteranceId: String, volume: Float): Int

  fun speak(text: String, utteranceId: String): Int

  fun stop()

  fun shutdown()
}

internal interface RoutedSpeechSynthesizerListener {
  fun onStart(utteranceId: String)

  fun onDone(utteranceId: String)

  fun onStop(utteranceId: String)

  fun onError(utteranceId: String)
}

private class AndroidRoutedSpeechSynthesizer(
  context: Context,
  listener: RoutedSpeechSynthesizerListener,
  onInitialized: (Int) -> Unit,
) : RoutedSpeechSynthesizer {
  private val textToSpeech =
    TextToSpeech(context.applicationContext) { status ->
      onInitialized(status)
    }

  override var language: Locale
    get() = textToSpeech.language
    set(value) {
      textToSpeech.language = value
    }

  init {
    textToSpeech.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    textToSpeech.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String) {
        listener.onStart(utteranceId)
      }

      override fun onDone(utteranceId: String) {
        listener.onDone(utteranceId)
      }

      override fun onStop(utteranceId: String, interrupted: Boolean) {
        listener.onStop(utteranceId)
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String) {
        listener.onError(utteranceId)
      }
    })
  }

  override fun isLanguageAvailable(locale: Locale): Int =
    textToSpeech.isLanguageAvailable(locale)

  override fun speakRouteWarmup(utteranceId: String, volume: Float): Int =
    textToSpeech.speak(
      TTS_ROUTE_WARMUP_TEXT,
      TextToSpeech.QUEUE_FLUSH,
      routedSpeechParams(volume = volume),
      utteranceId,
    )

  override fun speak(text: String, utteranceId: String): Int {
    return textToSpeech.speak(text, TextToSpeech.QUEUE_ADD, routedSpeechParams(), utteranceId)
  }

  private fun routedSpeechParams(volume: Float? = null) =
    Bundle().apply {
      putString(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL.toString())
      if (volume != null) {
        putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume)
      }
    }

  override fun stop() {
    textToSpeech.stop()
  }

  override fun shutdown() {
    textToSpeech.shutdown()
  }
}
