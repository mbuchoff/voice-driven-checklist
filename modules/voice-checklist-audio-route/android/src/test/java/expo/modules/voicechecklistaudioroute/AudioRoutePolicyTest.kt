package expo.modules.voicechecklistaudioroute

import android.media.AudioDeviceInfo
import android.os.Build
import org.junit.Assert.assertEquals
import org.junit.Test

class AudioRoutePolicyTest {
  @Test
  fun selectsSpeakerWhenBluetoothCommunicationDeviceIsUnavailable() {
    val target =
      chooseCommunicationRouteTarget(
        sdkInt = Build.VERSION_CODES.S,
        communicationDeviceTypes = listOf(
          AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
          AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        ),
        bluetoothScoAvailableOffCall = false,
      )

    assertEquals(CommunicationRouteTarget.SPEAKER, target)
  }

  @Test
  fun prefersBluetoothCommunicationDeviceOverSpeaker() {
    val target =
      chooseCommunicationRouteTarget(
        sdkInt = Build.VERSION_CODES.S,
        communicationDeviceTypes = listOf(
          AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        ),
        bluetoothScoAvailableOffCall = false,
      )

    assertEquals(CommunicationRouteTarget.BLUETOOTH, target)
  }

  @Test
  fun selectsSpeakerForPreSDeviceEvenWhenBluetoothScoIsAvailable() {
    val target =
      chooseCommunicationRouteTarget(
        sdkInt = Build.VERSION_CODES.R,
        communicationDeviceTypes = emptyList(),
        bluetoothScoAvailableOffCall = true,
      )

    assertEquals(CommunicationRouteTarget.SPEAKER, target)
  }

  @Test
  fun selectsSpeakerForPreSDeviceWhenBluetoothScoIsUnavailable() {
    val target =
      chooseCommunicationRouteTarget(
        sdkInt = Build.VERSION_CODES.R,
        communicationDeviceTypes = emptyList(),
        bluetoothScoAvailableOffCall = false,
      )

    assertEquals(CommunicationRouteTarget.SPEAKER, target)
  }

  @Test
  fun givesSpeakerRouteTimeToBecomeAudibleBeforeSpeechStarts() {
    assertEquals(350L, routeSettleDelayMillis(CommunicationRouteTarget.SPEAKER))
  }

  @Test
  fun givesBluetoothScoMoreTimeToConnectBeforeSpeechStarts() {
    assertEquals(1200L, routeSettleDelayMillis(CommunicationRouteTarget.BLUETOOTH))
  }

  @Test
  fun speakerRouteIsReadyWhenSpeakerIsTheCommunicationDevice() {
    assertEquals(
      true,
      isCommunicationRouteReady(
        sdkInt = Build.VERSION_CODES.S,
        target = CommunicationRouteTarget.SPEAKER,
        communicationDeviceType = AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        speakerphoneOn = false,
      ),
    )
  }

  @Test
  fun speakerRouteIsNotReadyWhenEarpieceIsStillTheCommunicationDevice() {
    assertEquals(
      false,
      isCommunicationRouteReady(
        sdkInt = Build.VERSION_CODES.S,
        target = CommunicationRouteTarget.SPEAKER,
        communicationDeviceType = AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
        speakerphoneOn = false,
      ),
    )
  }

  @Test
  fun bluetoothRouteIsReadyWhenBluetoothIsTheCommunicationDevice() {
    assertEquals(
      true,
      isCommunicationRouteReady(
        sdkInt = Build.VERSION_CODES.S,
        target = CommunicationRouteTarget.BLUETOOTH,
        communicationDeviceType = AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        speakerphoneOn = false,
      ),
    )
  }
}
