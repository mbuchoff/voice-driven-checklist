package expo.modules.voicechecklistpower

import android.content.Context
import android.os.PowerManager
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// What a step's countdown needs to stay on time with the screen off: a wake
// lock, and a clock that keeps counting while the phone sleeps.
class VoiceChecklistPowerModule : Module() {
  private var countdownWakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("VoiceChecklistPower")

    OnActivityDestroys {
      releaseCountdownWakeLock()
    }

    // Keeps the processor awake while a step's countdown runs with the screen
    // off, so the run moves on on time. The timeout is a safety net in case
    // a release is missed; JS releases it when the run leaves the step.
    Function("acquireCountdownWakeLock") { timeoutMs: Double ->
      acquireCountdownWakeLock(timeoutMs.toLong())
      null
    }

    Function("releaseCountdownWakeLock") {
      releaseCountdownWakeLock()
      null
    }

    // Milliseconds since boot, counting deep sleep and unmoved by changes to
    // the time of day, so a countdown measures the time that really passed.
    Function("elapsedRealtimeMillis") {
      SystemClock.elapsedRealtime().toDouble()
    }
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
}
