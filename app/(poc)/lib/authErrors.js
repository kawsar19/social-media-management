// The auth API routes return machine-readable error codes. The login and
// signup pages render whatever they catch, so map the codes to human text
// here rather than leaking "invalid_credentials" into the UI.
const MESSAGES = {
  missing_fields: "Please fill in every field.",
  validation_failed: "Check your details and try again.",
  invalid_credentials: "Wrong email or password.",
  email_exists: "An account with that email already exists. Sign in instead.",
  use_google_signin: "This account was created with Google. Use the Google button above.",
  missing_credential: "Google didn't send a sign-in token. Please try again.",
  invalid_credential: "We couldn't verify that Google account. Please try again.",
  email_not_verified: "That Google account has no verified email address.",
  google_not_configured: "Google sign-in isn't set up on this server yet.",
  google_script_failed: "Couldn't reach Google. Check your connection and retry.",
  google_login_failed: "Google sign-in failed. Please try again.",
  server_error: "Something went wrong on our end. Please try again.",
};

export function authErrorMessage(code) {
  return MESSAGES[code] || "Something went wrong. Please try again.";
}
