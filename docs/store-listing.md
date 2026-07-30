# Google Play Store listing copy

Draft text for the Play Console listing. Paste each field into the
corresponding form in Play Console → Main store listing.

## App name (max 30 chars)

```
Voice Checklist
```

_(15 chars.)_

## Short description (max 80 chars)

```
Hands-free checklists. Say "next" to advance, "repeat" to hear an item again.
```

_(78 chars.)_

## Full description (max 4000 chars)

```
Voice Checklist is a simple, hands-free checklist app. Create a list
of steps, press Start, and the app reads each item aloud. Say "next"
to advance, "repeat" to hear the current item again, or "previous"
to go back. When you're done with your hands — cooking, working on
a car, running through a pre-flight, doing a procedure — your voice
does the driving.

Features
• Voice-driven playback — "next," "repeat," "previous" move through
  the list without touching the screen.
• Spoken item text — each item is read aloud by the device's
  text-to-speech voice.
• Manual fallback — on-screen Previous / Repeat / Next / Stop
  buttons are always available, so the app works even if voice
  control or the speech engine is unavailable.
• Follows your system appearance — the UI switches automatically
  between light and dark mode based on your Android settings.
• Local by design — all checklist content stays on your device and
  remains available offline.
• Your choice — use the app without an account or optionally continue
  with Google for identity and account management. Google sign-in does
  not upload or synchronize checklist content in this release.

Privacy
• Checklist titles and items stay on your device and are not uploaded
  to the developer, Google, or Amazon Cognito.
• Optional Google sign-in processes your name, email address, and a
  Cognito user ID only for authentication and account management.
• No advertising, analytics, tracking, or sale of personal data.
• The microphone is used only while a checklist is running, to pass
  audio to Android's speech recognition service for the three
  supported voice commands. Audio is not recorded, stored, or sent
  to the developer.
• Depending on your device and Android version, Android's speech
  recognition service may transmit audio to Google for processing;
  that handling is governed by Google's privacy policy.

Permissions used
• Microphone — required for voice commands; the app works without it
  if you prefer to use the on-screen buttons.
```

_(~1450 chars.)_

## Category

- **App category:** Tools
- **Tags:** Productivity, Accessibility, Voice

(Play Console lets you pick up to five tags after the listing is
published.)

## Contact details

- **Email (required, shown publicly):** mbuchoff@gmail.com
- **Phone (optional):** leave blank
- **Website (optional):** <https://github.com/mbuchoff/voice-driven-checklist>

## Privacy policy URL

Once the repo has the privacy policy enabled via GitHub Pages:

```
https://mbuchoff.github.io/voice-driven-checklist/PRIVACY
```

Alternative if GitHub Pages isn't set up yet (Play Console accepts
this but a real page is preferred):

```
https://github.com/mbuchoff/voice-driven-checklist/blob/main/docs/PRIVACY.md
```

## Account deletion URL

Use this URL in **App content → Data deletion** and in the store listing where
an account-deletion link is requested:

```text
https://mbuchoff.github.io/voice-driven-checklist/delete-account/
```

The in-app path is **Checklists → Account settings gear → Delete Google
account**. Both paths delete the Cognito profile while preserving checklist
content that exists only on the device.

## Data safety declaration

Answers for the Play Console Data Safety form:

- **Does your app collect or share any of the required user data types?** Yes,
  optional collection for Google sign-in.
- **Personal info → Name:** Collected, optional; account management and app
  functionality; not used for advertising.
- **Personal info → Email address:** Collected, optional; account management
  and app functionality; not used for advertising.
- **Device or other IDs → User IDs:** Collected, optional. This is the Cognito
  subject used for account management and app functionality.
- **Shared:** No. Google and Amazon Cognito process authentication data as
  identity/service providers; it is not transferred for advertising or sold.
- **Is all collected user data encrypted in transit?** Yes.
- **Can users request deletion?** Yes. Provide both the in-app path and
  `https://mbuchoff.github.io/voice-driven-checklist/delete-account/`.
- **Checklist content:** Not collected and not shared. It remains in the local
  SQLite database even in Google mode.

**Audio:** Although the app uses the microphone, the audio is processed
by the platform's on-device / cloud speech recognition service and is
not collected or shared by the app itself. Per Google's Data Safety
guidance, audio processed transiently by a system service and not
retained by the app does not need to be declared as "data collection."
If Play Console challenges this, the honest declaration is:

- Data type: **Audio / Voice or sound recordings**
- Collected: No, shared: No (handled by system speech recognition service)
- Processing: Ephemeral, not stored

## Content rating questionnaire

All answers:

- Violence, blood, sexual content, crude humor, profanity, drugs,
  gambling, user-generated content, user interaction: **No**
- Purchases or advertising: **No**

Expected rating: **IARC 3+ (Everyone)**.

## App access

- **Is all or part of your app restricted behind a login?** No. Every checklist
  feature is available in **Use on this device** mode. Google sign-in is
  optional.

## Ads

- **Does your app contain ads?** No.
