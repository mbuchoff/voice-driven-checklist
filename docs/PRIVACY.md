# Privacy Policy — Voice Checklist

_Last updated: 2026-07-30_

Voice Checklist ("the app") is a voice-driven checklist application. This
policy explains what information is processed, what remains on your device,
and how to contact the developer.

## Developer

The app is developed and published by Michael Buchoff.
Contact: **mbuchoff@gmail.com**

## Checklists remain on your device

Checklist titles, items, ordering, and history are stored in a local SQLite
database on your device. Voice Checklist does not upload checklist content,
even when you choose Google sign-in. The developer, Google, and Amazon Web
Services do not receive your checklist content from the app.

The export feature lets you save a local backup file through the operating
system share sheet. You choose where that file goes; the developer does not
receive it.

## Optional Google sign-in

You can use every checklist feature without an account by choosing **Use on
this device**. If you instead choose Google sign-in, Google authenticates you
and Amazon Cognito manages the app account.

For authentication and account management, the app and Amazon Cognito process:

- Your Google display name, if available.
- Your Google email address.
- A Cognito user identifier associated with your Google account.

The app caches those three profile fields in its on-device database so it can
identify the selected account while offline. Amazon Cognito retains the account
profile until it is deleted. This information is used only for sign-in,
account selection, session management, and account deletion. It is not used
for advertising, tracking, profiling, or sale.

Google's and AWS's handling of authentication data is also governed by their
policies:

- Google Privacy Policy: <https://policies.google.com/privacy>
- AWS Privacy Notice: <https://aws.amazon.com/privacy/>

## Authentication credential storage

The app stores only the refresh token needed to restore Google sign-in:

- On Android, it is encrypted using Android Keystore through Expo SecureStore
  and excluded from Android backup.
- On web, it is stored in a namespaced, origin-scoped `localStorage` entry.
  Web storage does not provide the same operating-system protection as Android
  SecureStore, so the hosted web app must prevent untrusted script execution.

Access and ID tokens remain in memory and are not persisted. Authentication
data is encrypted in transit using HTTPS.

## Account deletion

In the app, open **Account settings** and choose **Delete Google account**.
After confirmation, the app asks Cognito to delete the account, clears the
local sign-in credential and cached profile, and switches to local mode.
Checklists stored on the device are preserved.

If you cannot access the app, follow the instructions at
<https://mbuchoff.github.io/voice-driven-checklist/delete-account/>. The
developer targets completion of verified email deletion requests within seven
days.

Switching to **Use on this device** signs out and clears the local credential;
it does not delete the Cognito account.

## Microphone and speech recognition

When you start a checklist, the app listens for the voice commands "next,"
"repeat," and "previous" so you can advance through items hands-free.

The app uses your device's built-in speech recognition service. On Android,
this is typically Google's speech recognition service. The service processes
microphone audio and returns recognized text to the app.

Voice Checklist does not record, store, or retain audio. Captured audio is
passed directly to the operating system's speech recognition service and is
discarded immediately. Depending on your device settings and Android version,
the operating system service may transmit audio to Google for processing. The
developer has no access to the audio or returned transcriptions.

## Other collection and sharing

The app does not:

- Use analytics, advertising, tracking SDKs, or crash reporters.
- Sell personal information.
- Upload or synchronize checklist content.
- Share information for advertising or marketing.

## Permissions

The app requests these permissions:

- **Microphone (`RECORD_AUDIO`)** — used only while a checklist is running, to
  capture audio for the platform speech recognition service.
- **Notifications (`POST_NOTIFICATIONS`)** — used for the ongoing Android
  notification while voice listening is active.

You can deny these permissions. Voice control will be unavailable, but the
on-screen checklist controls remain usable.

## Children

The app is not directed at children and does not knowingly collect information
from children under 13.

## Changes to this policy

If this policy changes, the updated version will be published at this URL and
the "Last updated" date will change.

## Contact

Questions or privacy requests: **mbuchoff@gmail.com**
