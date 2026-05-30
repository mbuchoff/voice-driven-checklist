const fs = require('fs');
const path = require('path');
const { withDangerousMod, withMainApplication } = require('expo/config-plugins');

const PACKAGE_REGISTRATION = '          add(VoiceChecklistAudioRoutePackage())';

function createAudioRouteModuleSource(packageName) {
  return `package ${packageName}

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VoiceChecklistAudioRouteModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var active = false
  private var previousMode: Int? = null
  private var previousSpeakerphoneOn: Boolean? = null
  private var previousBluetoothScoOn: Boolean? = null

  override fun getName(): String = "VoiceChecklistAudioRoute"

  companion object {
    private const val TAG = "VoiceChecklistAudioRoute"
  }

  @ReactMethod
  fun start(promise: Promise) {
    try {
      Log.i(TAG, "start sdkInt=" + Build.VERSION.SDK_INT + " mode=" + audioManager.mode + " active=" + active)
      if (!active) {
        previousMode = audioManager.mode
        @Suppress("DEPRECATION")
        previousSpeakerphoneOn = audioManager.isSpeakerphoneOn
        @Suppress("DEPRECATION")
        previousBluetoothScoOn = audioManager.isBluetoothScoOn
      }

      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      @Suppress("DEPRECATION")
      audioManager.isSpeakerphoneOn = false

      val routedToBluetooth = routeToBluetooth()
      if (!routedToBluetooth) {
        // No Bluetooth mic to route to: don't hold the device in communication
        // mode (that routes playback to the earpiece). Restore audio and report.
        restorePreviousAudioState()
        Log.i(TAG, "start resolved routedToBluetooth=false (restored audio state)")
        promise.resolve(false)
        return
      }

      active = true
      Log.i(TAG, "start resolved routedToBluetooth=true")
      promise.resolve(true)
    } catch (error: Throwable) {
      // Routing threw after the audio mode may have changed; restore so a
      // failure cannot strand the device in communication mode.
      restorePreviousAudioState()
      Log.e(TAG, "start failed", error)
      promise.reject(
        "ERR_VOICE_CHECKLIST_AUDIO_ROUTE",
        "Unable to route voice checklist audio.",
        error,
      )
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      Log.i(TAG, "stop active=" + active)
      if (active) clearBluetoothRoute()
      restorePreviousAudioState()
      active = false
      promise.resolve(null)
    } catch (error: Throwable) {
      Log.e(TAG, "stop failed", error)
      promise.reject(
        "ERR_VOICE_CHECKLIST_AUDIO_ROUTE",
        "Unable to restore voice checklist audio route.",
        error,
      )
    }
  }

  private fun routeToBluetooth(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val available = audioManager.availableCommunicationDevices
      Log.i(TAG, "availableCommunicationDevices=" + available.map { it.type })
      Log.i(TAG, "communicationDevice before=" + audioManager.communicationDevice?.type)

      val bluetoothDevice = available.firstOrNull {
        it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
          it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
      }
      if (bluetoothDevice == null) {
        Log.w(TAG, "no Bluetooth communication device found")
        return false
      }
      Log.i(TAG, "found Bluetooth device type=" + bluetoothDevice.type)

      val result = audioManager.setCommunicationDevice(bluetoothDevice)
      Log.i(
        TAG,
        "setCommunicationDevice result=" + result +
          " communicationDevice after=" + audioManager.communicationDevice?.type,
      )
      return result
    }

    @Suppress("DEPRECATION")
    if (!audioManager.isBluetoothScoAvailableOffCall) {
      Log.w(TAG, "Bluetooth SCO unavailable off-call")
      return false
    }

    @Suppress("DEPRECATION")
    audioManager.startBluetoothSco()
    @Suppress("DEPRECATION")
    audioManager.isBluetoothScoOn = true
    Log.i(TAG, "startBluetoothSco requested")
    return true
  }

  private fun clearBluetoothRoute() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audioManager.clearCommunicationDevice()
      return
    }

    @Suppress("DEPRECATION")
    audioManager.stopBluetoothSco()
    @Suppress("DEPRECATION")
    audioManager.isBluetoothScoOn = previousBluetoothScoOn ?: false
  }

  private fun restorePreviousAudioState() {
    previousSpeakerphoneOn?.let {
      @Suppress("DEPRECATION")
      audioManager.isSpeakerphoneOn = it
    }
    previousMode?.let {
      audioManager.mode = it
    }

    previousSpeakerphoneOn = null
    previousMode = null
    previousBluetoothScoOn = null
  }
}
`;
}

function createAudioRoutePackageSource(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

@Suppress("DEPRECATION")
class VoiceChecklistAudioRoutePackage : ReactPackage {
  @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> =
    listOf(VoiceChecklistAudioRouteModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
`;
}

function addAudioRoutePackageToMainApplication(contents) {
  if (contents.includes(PACKAGE_REGISTRATION)) return contents;

  const packageListBlock = /PackageList\(this\)\.packages\.apply\s*\{\n/;
  if (!packageListBlock.test(contents)) {
    throw new Error('Could not add VoiceChecklistAudioRoutePackage to MainApplication.');
  }

  return contents.replace(packageListBlock, (match) => `${match}${PACKAGE_REGISTRATION}\n`);
}

function getPackageSourceDir(projectRoot, packageName) {
  return path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    ...packageName.split('.'),
  );
}

function withAudioRoutePackageRegistration(config) {
  return withMainApplication(config, (mainApplicationConfig) => {
    mainApplicationConfig.modResults.contents = addAudioRoutePackageToMainApplication(
      mainApplicationConfig.modResults.contents,
    );
    return mainApplicationConfig;
  });
}

function withAudioRouteNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (nativeFilesConfig) => {
      const packageName = nativeFilesConfig.android?.package;
      if (!packageName) {
        throw new Error('android.package is required for VoiceChecklistAudioRoute.');
      }

      const sourceDir = getPackageSourceDir(
        nativeFilesConfig.modRequest.projectRoot,
        packageName,
      );
      await fs.promises.mkdir(sourceDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(sourceDir, 'VoiceChecklistAudioRouteModule.kt'),
        createAudioRouteModuleSource(packageName),
      );
      await fs.promises.writeFile(
        path.join(sourceDir, 'VoiceChecklistAudioRoutePackage.kt'),
        createAudioRoutePackageSource(packageName),
      );

      return nativeFilesConfig;
    },
  ]);
}

module.exports = function withVoiceChecklistAudioRoute(config) {
  return withAudioRouteNativeFiles(withAudioRoutePackageRegistration(config));
};

module.exports.addAudioRoutePackageToMainApplication = addAudioRoutePackageToMainApplication;
module.exports.createAudioRouteModuleSource = createAudioRouteModuleSource;
module.exports.createAudioRoutePackageSource = createAudioRoutePackageSource;
