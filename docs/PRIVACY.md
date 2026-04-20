# Privacy Policy — Voice Checklist

_Last updated: 2026-04-20_

Voice Checklist ("the app") is a voice-driven checklist application. This
policy describes what the app collects, what is transmitted to third
parties, and how to contact the developer.

## Developer

The app is developed and published by Michael Buchoff.
Contact: **mbuchoff@gmail.com**

## Data the app collects

**The app does not collect or transmit any personal data to the
developer.** All checklists you create are stored in a local SQLite
database on your device; they are not uploaded anywhere and are not
accessible to the developer.

Specifically, the app does not:

- Send any personal information to servers operated by the developer.
- Use analytics, advertising, tracking SDKs, or crash reporters.
- Require an account, login, or any personal information to use.
- Share any data with third-party services other than as described below
  for platform-provided speech recognition.

## Microphone and speech recognition

When you start a checklist, the app listens for the voice commands
"next," "repeat," and "previous" so you can advance through items
hands-free.

To do this, the app uses your device's built-in speech recognition
service — on Android this is the Google speech recognition service
bundled with Android, and on iOS this is Apple's speech recognition
framework. These services process the audio captured by the microphone
and return recognized text to the app.

The app does not record, store, or retain audio. Captured audio is
passed directly to the operating system's speech recognition service
and is discarded immediately.

**Please note:** depending on your device settings and the Android /
iOS version, the operating system's speech recognition service may
transmit audio to the platform provider (Google or Apple) for
processing. The handling of that audio is governed by the platform
provider's own privacy policy, not by this app. The developer has no
access to the audio or to the transcriptions returned by the platform.

- Google's speech recognition privacy information: <https://policies.google.com/privacy>
- Apple's Speech Framework privacy information: <https://www.apple.com/legal/privacy/>

## Permissions

The app requests the following permissions:

- **Microphone (`RECORD_AUDIO` on Android, `NSMicrophoneUsageDescription` on iOS)** — used only while a checklist is running, to capture audio for the platform speech recognition service.
- **Speech recognition (`NSSpeechRecognitionUsageDescription` on iOS)** — used only while a checklist is running, to receive recognized voice commands.

You can deny these permissions. If you do, voice control is unavailable
and the app falls back to on-screen buttons for Next / Repeat /
Previous / Stop.

## Children

The app is not directed at children and does not knowingly collect
information from children under 13.

## Changes to this policy

If this policy is updated, the new version will be published at the
same URL and the "Last updated" date above will change.

## Contact

Questions about this policy: **mbuchoff@gmail.com**
