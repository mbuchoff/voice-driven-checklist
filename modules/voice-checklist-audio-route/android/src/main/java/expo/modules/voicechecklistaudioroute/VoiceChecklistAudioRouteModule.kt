package expo.modules.voicechecklistaudioroute

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "VoiceChecklistAudioRoute"

// Routes voice-recognition capture to a connected Bluetooth headset (AirPods) mic
// while a checklist run is active. Without this, the recognizer uses the phone's
// built-in mic, which is muffled in a pocket. Logs decisions under the TAG above so
// the routing can be diagnosed on-device via `adb logcat -s VoiceChecklistAudioRoute`.
class VoiceChecklistAudioRouteModule : Module() {
  private val audioManager: AudioManager
    get() {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      return context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

  private var active = false
  private var previousMode: Int? = null
  private var previousSpeakerphoneOn: Boolean? = null
  private var previousBluetoothScoOn: Boolean? = null

  override fun definition() = ModuleDefinition {
    Name("VoiceChecklistAudioRoute")

    AsyncFunction("start") {
      val manager = audioManager
      Log.i(TAG, "start sdkInt=${Build.VERSION.SDK_INT} mode=${manager.mode} active=$active")

      if (!active) {
        previousMode = manager.mode
        @Suppress("DEPRECATION")
        previousSpeakerphoneOn = manager.isSpeakerphoneOn
        @Suppress("DEPRECATION")
        previousBluetoothScoOn = manager.isBluetoothScoOn
      }

      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      @Suppress("DEPRECATION")
      manager.isSpeakerphoneOn = false

      val routedToBluetooth =
        try {
          routeToBluetooth(manager)
        } catch (error: Throwable) {
          // Routing threw after the audio mode may have changed; restore so a
          // failure cannot strand the device in communication mode.
          restorePreviousAudioState(manager)
          Log.e(TAG, "start failed", error)
          throw error
        }

      if (!routedToBluetooth) {
        // No Bluetooth mic to route to: don't hold the device in communication
        // mode (that routes playback to the earpiece). Restore and report.
        restorePreviousAudioState(manager)
        Log.i(TAG, "start resolved routedToBluetooth=false (restored audio state)")
        return@AsyncFunction false
      }

      active = true
      Log.i(TAG, "start resolved routedToBluetooth=true")
      return@AsyncFunction true
    }

    AsyncFunction("stop") {
      val manager = audioManager
      Log.i(TAG, "stop active=$active")
      if (active) clearBluetoothRoute(manager)
      restorePreviousAudioState(manager)
      active = false
    }
  }

  private fun routeToBluetooth(manager: AudioManager): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val available = manager.availableCommunicationDevices
      Log.i(TAG, "availableCommunicationDevices=${available.map { it.type }}")
      Log.i(TAG, "communicationDevice before=${manager.communicationDevice?.type}")

      val bluetoothDevice =
        available.firstOrNull {
          it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
            it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        }
      if (bluetoothDevice == null) {
        Log.w(TAG, "no Bluetooth communication device found")
        return false
      }
      Log.i(TAG, "found Bluetooth device type=${bluetoothDevice.type}")

      val result = manager.setCommunicationDevice(bluetoothDevice)
      Log.i(TAG, "setCommunicationDevice result=$result communicationDevice after=${manager.communicationDevice?.type}")
      return result
    }

    @Suppress("DEPRECATION")
    if (!manager.isBluetoothScoAvailableOffCall) {
      Log.w(TAG, "Bluetooth SCO unavailable off-call")
      return false
    }

    @Suppress("DEPRECATION")
    manager.startBluetoothSco()
    @Suppress("DEPRECATION")
    manager.isBluetoothScoOn = true
    Log.i(TAG, "startBluetoothSco requested")
    return true
  }

  private fun clearBluetoothRoute(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      manager.clearCommunicationDevice()
      return
    }

    @Suppress("DEPRECATION")
    manager.stopBluetoothSco()
    @Suppress("DEPRECATION")
    manager.isBluetoothScoOn = previousBluetoothScoOn ?: false
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
  }
}
