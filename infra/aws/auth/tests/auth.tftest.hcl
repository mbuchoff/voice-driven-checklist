mock_provider "aws" {}

variables {
  aws_region            = "us-east-1"
  cognito_domain_prefix = "voice-checklist-test"
  google_client_id      = "test-client.apps.googleusercontent.com"
  google_client_secret  = "test-secret"
}

run "development_auth_contract" {
  command = plan

  variables {
    environment = "development"
  }

  assert {
    condition = toset(keys(aws_cognito_user_pool_client.app)) == toset([
      "android_debug",
      "web_localhost",
    ])
    error_message = "Development must create separate Android debug and localhost web clients."
  }

  assert {
    condition = toset(aws_cognito_user_pool_client.app["android_debug"].callback_urls) == toset([
      "voicechecklist://auth/callback",
    ])
    error_message = "The Android debug client must return only to the app callback."
  }

  assert {
    condition = toset(aws_cognito_user_pool_client.app["web_localhost"].callback_urls) == toset([
      "http://localhost:8082/auth/callback",
    ])
    error_message = "The development web client must return only to localhost."
  }
}

run "production_auth_contract" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition     = toset(keys(aws_cognito_user_pool_client.app)) == toset(["android_play"])
    error_message = "Production must create only the Android Play client until web hosting is selected."
  }

  assert {
    condition = toset(aws_cognito_user_pool_client.app["android_play"].callback_urls) == toset([
      "voicechecklist://auth/callback",
    ])
    error_message = "The Android Play client must return only to the app callback."
  }
}

run "public_client_security_contract" {
  command = plan

  variables {
    environment = "development"
  }

  assert {
    condition = alltrue([
      for client in values(aws_cognito_user_pool_client.app) :
      client.generate_secret == false &&
      client.allowed_oauth_flows_user_pool_client == true &&
      toset(client.allowed_oauth_flows) == toset(["code"]) &&
      toset(client.allowed_oauth_scopes) == toset([
        "openid",
        "email",
        "profile",
        "aws.cognito.signin.user.admin",
      ]) &&
      toset(client.supported_identity_providers) == toset(["Google"]) &&
      client.enable_token_revocation == true &&
      !contains(client.explicit_auth_flows, "ALLOW_REFRESH_TOKEN_AUTH")
    ])
    error_message = "Every app client must be a revocable Google-only public code-flow client."
  }

  assert {
    condition = alltrue([
      for client in values(aws_cognito_user_pool_client.app) :
      client.access_token_validity == 60 &&
      client.id_token_validity == 60 &&
      client.refresh_token_validity == 30 &&
      client.token_validity_units[0].access_token == "minutes" &&
      client.token_validity_units[0].id_token == "minutes" &&
      client.token_validity_units[0].refresh_token == "days" &&
      client.refresh_token_rotation[0].feature == "ENABLED" &&
      client.refresh_token_rotation[0].retry_grace_period_seconds == 10
    ])
    error_message = "Every app client must use 60-minute tokens and 30-day rotating refresh tokens with a 10-second grace period."
  }
}

run "managed_google_login_contract" {
  command = plan

  variables {
    environment = "development"
  }

  assert {
    condition = (
      aws_cognito_user_pool_domain.auth.managed_login_version == 2 &&
      length(aws_cognito_managed_login_branding.app) == length(aws_cognito_user_pool_client.app)
    )
    error_message = "Every client must have Cognito managed-login branding."
  }

  assert {
    condition = (
      aws_cognito_identity_provider.google.provider_name == "Google" &&
      aws_cognito_identity_provider.google.provider_type == "Google" &&
      aws_cognito_identity_provider.google.provider_details.authorize_scopes == "openid email profile"
    )
    error_message = "The user pool must federate to Google for the minimum identity scopes."
  }
}

run "rejects_unknown_environment" {
  command = plan

  variables {
    environment = "staging"
  }

  expect_failures = [var.environment]
}
