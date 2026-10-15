'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Building2, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { getSupabase } from '@/lib/client';
import { authMessage } from '@/lib/auth';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';
export default function AuthScreen({ recovery = false, hasSession = false, onRecovered }: { recovery?: boolean; hasSession?: boolean; onRecovered?: () => void }) {
  const [mode, setMode] = useState<Mode>(recovery && hasSession ? 'reset' : recovery ? 'forgot' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(recovery && !hasSession ? 'That reset link has expired or is incomplete. Request a new one below.' : '');
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const configured = Boolean(getSupabase());
  const title = { signin: 'Welcome to Rockwood.', signup: 'Create your account.', forgot: 'Forgot your password?', reset: 'Choose a new password.' }[mode];
  const action = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save password' }[mode];

  function changeMode(next: Mode) { setMode(next); setError(''); setNotice(''); setPassword(''); setConfirmEmail(false); }
  const redirect = (reset = false) => `${window.location.origin}/workspace${reset ? '?recovery=1' : ''}`;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const auth = getSupabase()!.auth;
      if (mode === 'signin') {
        const result = await auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) { setConfirmEmail(result.error.code === 'email_not_confirmed'); throw result.error; }
        // A person can return to sign-in from an expired recovery URL.
        if (recovery) onRecovered?.();
      } else if (mode === 'signup') {
        const result = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect() } });
        if (result.error) throw result.error;
        setPassword('');
        if (!result.data.session) { setConfirmEmail(true); setNotice('Check your email for a confirmation link. If you already have an account, sign in or reset your password.'); }
        else if (recovery) onRecovered?.();
      } else if (mode === 'forgot') {
        const result = await auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect(true) });
        if (result.error) throw result.error;
        setNotice('If an account exists for this email, you’ll receive a password reset link. Check your inbox and spam folder.');
      } else {
        const result = await auth.updateUser({ password });
        if (result.error) throw result.error;
        setPassword(''); onRecovered?.();
      }
    } catch (e) { setError(authMessage(e)); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await getSupabase()!.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirect() } });
      if (result.error) throw result.error;
      setNotice('If confirmation is needed, a new link is on its way. Check your inbox and spam folder.');
    } catch (e) { setError(authMessage(e)); } finally { setBusy(false); }
  }
  return <div className="login-page">
    <section className="login-story"><img src="/brand/rockwood-logo.png" alt="Rockwood Development" /><div className="login-copy"><span className="eyebrow">THE PROJECT WORKSPACE</span><h1>Your projects.<br />One place.</h1><p>Properties, permits, schedules and next steps.<br />Keep the whole team up to date.</p></div><div className="architectural-lines" aria-hidden="true"><div /><div /><div /><div /></div></section>
    <section className="login-form-side"><div className="login-form-wrap">
      <span className="login-mark"><Building2 size={27} strokeWidth={1.3} /></span><h2>{title}</h2>
      <p>{mode === 'signup' ? 'Use your email and a password to join the shared Rockwood workspace. You’ll be able to view and edit all properties.' : mode === 'signin' ? 'Sign in to keep the work moving.' : mode === 'forgot' ? 'We’ll email you a link to set a new password.' : 'Save your password and continue to your projects.'}</p>
      <form onSubmit={submit}>
        {mode !== 'reset' && <label>Email address<input type="email" autoComplete={mode === 'signup' ? 'email' : 'username'} required value={email} onChange={e => { setEmail(e.target.value); setConfirmEmail(false); }} placeholder="you@company.com" disabled={busy} /></label>}
        {mode !== 'forgot' && <label>{mode === 'reset' ? 'New password' : 'Password'}<span className="auth-password"><input type={visible ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signin' ? undefined : 8} required value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'} disabled={busy} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label>}
        {(!configured || error) && <div className="alert error" role="alert">{error || 'The workspace connection is not configured. Please contact Rockwood.'}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        <button className="button primary login-submit" disabled={busy || !configured}>{busy ? <><LoaderCircle className="spin" size={18} />Please wait…</> : <>{action}<ArrowRight size={17} /></>}</button>
        {confirmEmail && <button className="button" type="button" onClick={resend} disabled={busy || !email}>Resend confirmation email</button>}
      </form>
      <div className="auth-actions">
        {mode === 'signin' && <><button className="auth-link" onClick={() => changeMode('forgot')} disabled={busy}>Forgot password?</button><div className="auth-divider">New to Rockwood?</div><button className="button auth-create" onClick={() => changeMode('signup')} disabled={busy}>Create account</button></>}
        {mode !== 'signin' && mode !== 'reset' && <button className="auth-link" onClick={() => changeMode('signin')} disabled={busy}>Back to sign in</button>}
      </div>
    </div><span className="login-footer">Rockwood Development · Project management</span></section>
  </div>;
}
