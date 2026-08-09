# Voice Checklist authentication infrastructure

This stack creates an Amazon Cognito user pool federated only to Google. It is
parameterized for development and production, but each environment uses a
separate S3 state key and creates separate resources.

The stack creates no checklist API, storage, synchronization, or application
backend resources.

## What you need

- OpenTofu 1.12.x.
- AWS credentials allowed to manage Cognito resources.
- A private, versioned S3 bucket with public access blocked for encrypted state.
- One Google OAuth **Web application** client per environment.

## 1. Choose the Cognito domain

Copy the appropriate variable and backend examples without removing the
`.example` files:

```bash
cp environments/development.tfvars.example environments/development.tfvars
cp environments/development.s3.tfbackend.example environments/development.s3.tfbackend
```

Replace the domain prefix with a globally unique value. For example, a prefix
of `voice-checklist-dev-example` in `us-east-1` produces this Google redirect:

```text
https://voice-checklist-dev-example.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

## 2. Create the Google development client

In Google Cloud Console:

1. Create or select a development project.
2. Under **Google Auth Platform**, configure an External app in Testing status.
3. Add the Google accounts that will test the app as test users.
4. Create an OAuth client of type **Web application**.
5. Add only the Cognito `/oauth2/idpresponse` URL above as an authorized
   redirect URI. Do not add the Android or localhost callbacks to Google.
6. Put the public client ID in `development.tfvars`.

Keep the Google client secret out of files, shell history, GitHub, Expo, and
the app. Put it into the current shell without printing it:

```bash
read -r -s -p "Google client secret: " TF_VAR_google_client_secret
export TF_VAR_google_client_secret
```

## 3. Validate and review

Initialize the selected, encrypted state and create a saved plan:

```bash
tofu init -backend-config=environments/development.s3.tfbackend
tofu fmt -check -recursive
tofu validate
tofu test
tofu plan -var-file=environments/development.tfvars -out=development.tfplan
tofu show development.tfplan
```

Do not apply an unreviewed plan. Applying either environment requires explicit
user approval after the plan has been shown. Pull requests validate and run
offline mocked plan tests but never deploy.

## 4. Configure the app after apply

Use `tofu output` to populate `.env.local` for development:

```text
EXPO_PUBLIC_COGNITO_REGION=<aws_region>
EXPO_PUBLIC_COGNITO_USER_POOL_ID=<user_pool_id>
EXPO_PUBLIC_COGNITO_DOMAIN=<cognito_domain>
EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID=<android_client_id>
EXPO_PUBLIC_COGNITO_WEB_CLIENT_ID=<web_client_id>
```

These five values are public configuration. The Google client secret is never
an Expo variable.
