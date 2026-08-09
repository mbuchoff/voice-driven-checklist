---
title: Delete a Voice Checklist account
permalink: /delete-account/
---

# Delete a Voice Checklist account

Google sign-in is optional. Deleting the Voice Checklist account removes the
Amazon Cognito profile used to identify your Google account. Checklist content
is stored only on each device and is not held in the account.

## Delete from the app

1. Open Voice Checklist.
2. Open the **Account settings** gear from the Checklists screen.
3. Choose **Delete Voice Checklist account**. This does not delete your Google
   account.
4. Confirm the deletion.

After Cognito confirms deletion, the app clears the local sign-in credential
and cached name/email, switches to local mode, and preserves the checklists
already stored on that device.

## Request deletion without app access

Email **mbuchoff@gmail.com** from the Google email address associated with the
Voice Checklist account. Use the subject **Voice Checklist account deletion**
and state that you want the account deleted.

The developer may reply with a verification step before deleting the account.
Verified requests have a documented fulfillment target of seven days. A
completion reply will be sent after the Cognito profile has been deleted.

An email request can remove the Cognito account profile, display name, email
address, and Cognito user identifier. It cannot erase checklists from a device,
because those lists were never uploaded. Delete local checklists in the app or
uninstall the app to remove its on-device data.

For more information, read the [Voice Checklist privacy policy](./PRIVACY).
