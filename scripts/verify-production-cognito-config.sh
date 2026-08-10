#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  EXPO_PUBLIC_COGNITO_REGION
  EXPO_PUBLIC_COGNITO_USER_POOL_ID
  EXPO_PUBLIC_COGNITO_DOMAIN
  EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID
)
missing_variables=()

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    missing_variables+=("$variable_name")
  fi
done

if (( ${#missing_variables[@]} > 0 )); then
  echo 'Missing required production Cognito configuration:' >&2
  printf '  %s\n' "${missing_variables[@]}" >&2
  exit 1
fi
