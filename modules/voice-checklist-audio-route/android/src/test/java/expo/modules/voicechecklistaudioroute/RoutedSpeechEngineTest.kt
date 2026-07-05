package expo.modules.voicechecklistaudioroute

import android.speech.tts.TextToSpeech
import expo.modules.kotlin.Promise
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class RoutedSpeechEngineTest {
  @Test
  fun queuesSpeechUntilSynthesizerIsReady() {
    val fake = FakeSpeechSynthesizer()
    lateinit var initialize: (Int) -> Unit
    val engine = RoutedSpeechEngine { listener, onInitialized ->
      fake.listener = listener
      initialize = onInitialized
      fake
    }
    val promise = TestPromise()
    var settled = 0

    engine.speak("Item one", "en-US", promise) { settled += 1 }
    assertTrue(fake.spoken.isEmpty())

    initialize(TextToSpeech.SUCCESS)
    val spoken = fake.spoken.single()
    assertEquals(listOf("route-warmup:0.0", "speak:Item one"), fake.speechEvents)
    assertEquals("Item one", spoken.text)
    assertEquals(Locale.forLanguageTag("en-US"), fake.language)
    assertFalse(promise.settled)

    fake.listener.onDone(spoken.utteranceId)

    assertTrue(promise.resolved)
    assertEquals(1, settled)
  }

  @Test
  fun stopResolvesQueuedSpeechAndReleasesItsRoute() {
    val fake = FakeSpeechSynthesizer()
    val engine = RoutedSpeechEngine { listener, _ ->
      fake.listener = listener
      fake
    }
    val promise = TestPromise()
    var settled = 0

    engine.speak("Item one", "en-US", promise) { settled += 1 }
    engine.stop()

    assertTrue(promise.resolved)
    assertEquals(1, settled)
    assertTrue(fake.spoken.isEmpty())
  }

  @Test
  fun initFailureRejectsQueuedSpeech() {
    val fake = FakeSpeechSynthesizer()
    lateinit var initialize: (Int) -> Unit
    val engine = RoutedSpeechEngine { listener, onInitialized ->
      fake.listener = listener
      initialize = onInitialized
      fake
    }
    val promise = TestPromise()
    var settled = 0

    engine.speak("Item one", "en-US", promise) { settled += 1 }
    initialize(TextToSpeech.ERROR)

    assertEquals(TTS_ERROR_CODE, promise.rejectedCode)
    assertEquals(1, settled)
    assertTrue(fake.spoken.isEmpty())
  }

  @Test
  fun warmsTheTtsRouteBeforeAudibleSpeech() {
    val fake = FakeSpeechSynthesizer()
    lateinit var initialize: (Int) -> Unit
    val engine = RoutedSpeechEngine { listener, onInitialized ->
      fake.listener = listener
      initialize = onInitialized
      fake
    }

    engine.speak("Item one", "en-US", TestPromise()) {}
    initialize(TextToSpeech.SUCCESS)

    assertEquals(listOf("route-warmup:0.0", "speak:Item one"), fake.speechEvents)
  }

  @Test
  fun newerPendingSpeechSupersedesOlderPendingSpeech() {
    val fake = FakeSpeechSynthesizer()
    lateinit var initialize: (Int) -> Unit
    val engine = RoutedSpeechEngine { listener, onInitialized ->
      fake.listener = listener
      initialize = onInitialized
      fake
    }
    val firstPromise = TestPromise()
    val secondPromise = TestPromise()
    var firstSettled = 0
    var secondSettled = 0

    engine.speak("First", "en-US", firstPromise) { firstSettled += 1 }
    engine.speak("Second", "en-US", secondPromise) { secondSettled += 1 }
    initialize(TextToSpeech.SUCCESS)

    assertTrue(firstPromise.resolved)
    assertEquals(1, firstSettled)
    assertEquals(listOf("Second"), fake.spoken.map { it.text })
    assertFalse(secondPromise.settled)
    assertEquals(0, secondSettled)
  }

  @Test
  fun newerActiveSpeechSupersedesOlderActiveSpeech() {
    val fake = FakeSpeechSynthesizer()
    lateinit var initialize: (Int) -> Unit
    val engine = RoutedSpeechEngine { listener, onInitialized ->
      fake.listener = listener
      initialize = onInitialized
      fake
    }
    val firstPromise = TestPromise()
    val secondPromise = TestPromise()
    var firstSettled = 0
    var secondSettled = 0

    engine.speak("First", "en-US", firstPromise) { firstSettled += 1 }
    initialize(TextToSpeech.SUCCESS)
    engine.speak("Second", "en-US", secondPromise) { secondSettled += 1 }

    assertTrue(firstPromise.resolved)
    assertEquals(1, firstSettled)
    assertEquals(listOf("First", "Second"), fake.spoken.map { it.text })
    assertFalse(secondPromise.settled)
    assertEquals(0, secondSettled)
  }
}

private data class SpokenText(val text: String, val utteranceId: String)

private class FakeSpeechSynthesizer : RoutedSpeechSynthesizer {
  lateinit var listener: RoutedSpeechSynthesizerListener
  val spoken = mutableListOf<SpokenText>()
  val speechEvents = mutableListOf<String>()
  override var language: Locale = Locale.ROOT
  var nextSpeakResult = TextToSpeech.SUCCESS

  override fun isLanguageAvailable(locale: Locale): Int = TextToSpeech.LANG_AVAILABLE

  override fun speakRouteWarmup(utteranceId: String, volume: Float): Int {
    speechEvents.add("route-warmup:$volume")
    return TextToSpeech.SUCCESS
  }

  override fun speak(text: String, utteranceId: String): Int {
    speechEvents.add("speak:$text")
    spoken.add(SpokenText(text, utteranceId))
    return nextSpeakResult
  }

  override fun stop() = Unit

  override fun shutdown() = Unit
}

private class TestPromise : Promise {
  var resolved = false
    private set
  var rejectedCode: String? = null
    private set

  val settled: Boolean
    get() = resolved || rejectedCode != null

  override fun resolve(value: Any?) {
    resolved = true
  }

  override fun reject(code: String, message: String?, cause: Throwable?) {
    rejectedCode = code
  }
}
