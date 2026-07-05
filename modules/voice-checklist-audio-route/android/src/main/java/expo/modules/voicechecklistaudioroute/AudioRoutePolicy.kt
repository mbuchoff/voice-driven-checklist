package expo.modules.voicechecklistaudioroute

import android.media.AudioDeviceInfo
import android.os.Build

internal fun isBluetoothCommunicationDeviceType(type: Int): Boolean =
  type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
    type == AudioDeviceInfo.TYPE_BLE_HEADSET

internal enum class CommunicationRouteTarget {
  BLUETOOTH,
  SPEAKER,
}

internal fun chooseCommunicationRouteTarget(
  sdkInt: Int,
  communicationDeviceTypes: List<Int>,
  @Suppress("UNUSED_PARAMETER") bluetoothScoAvailableOffCall: Boolean,
): CommunicationRouteTarget =
  if (sdkInt >= Build.VERSION_CODES.S) {
    if (communicationDeviceTypes.any(::isBluetoothCommunicationDeviceType)) {
      CommunicationRouteTarget.BLUETOOTH
    } else {
      CommunicationRouteTarget.SPEAKER
    }
  } else {
    CommunicationRouteTarget.SPEAKER
  }

internal fun routeSettleDelayMillis(target: CommunicationRouteTarget): Long =
  when (target) {
    CommunicationRouteTarget.SPEAKER -> 350L
    CommunicationRouteTarget.BLUETOOTH -> 1200L
  }

internal fun isCommunicationRouteReady(
  sdkInt: Int,
  target: CommunicationRouteTarget,
  communicationDeviceType: Int?,
  speakerphoneOn: Boolean,
): Boolean =
  if (sdkInt >= Build.VERSION_CODES.S) {
    when (target) {
      CommunicationRouteTarget.BLUETOOTH ->
        communicationDeviceType != null &&
          isBluetoothCommunicationDeviceType(communicationDeviceType)
      CommunicationRouteTarget.SPEAKER ->
        communicationDeviceType == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
    }
  } else {
    target == CommunicationRouteTarget.SPEAKER && speakerphoneOn
  }
