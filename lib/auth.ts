export function authMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'signup_disabled') return 'Account creation is not enabled yet. Please try again after Rockwood finishes activating sign-up.';
  if (code === 'invalid_credentials') return 'The email or password is incorrect. Try again or choose Forgot password.';
  if (code === 'email_not_confirmed') return 'Confirm your email first. You can resend the confirmation below.';
  if (code === 'user_already_exists') return 'This email already has an account. Sign in or choose Forgot password.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Please wait a minute before trying again.';
  return error instanceof Error ? error.message : 'We could not connect. Please try again.';
}

export function recoveryRequested(search: string, hash: string): boolean {
  return new URLSearchParams(search).get('recovery') === '1' || new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery';
}
