'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { Mark } from '@/components/Mark'
import { useLang } from '@/components/LangProvider'
import { LanguageToggle } from '@/components/LanguageToggle'

export default function LoginPage() {
  const { lang, t } = useLang()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = createBrowserSupabaseClient()
    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/chat` } })
    if (otpError) {
      // Do NOT claim success when the link was never sent (rate limits, provider errors).
      setError(t('login.otp_failed'))
      return
    }
    setSubmitted(true)
  }

  async function handleGoogle() {
    setError(null)
    const supabase = createBrowserSupabaseClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    })
    if (oauthError) {
      setError(t('login.google_failed'))
    }
  }

  if (submitted) {
    return (
      <main className="auth-page">
        <div className="auth-card auth-sent fade-up">
          <Mark className="auth-mark" />
          <h1>{t('login.check_title')}</h1>
          <p>{t('login.check_body', { email })}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-lang"><LanguageToggle /></div>
      <div className="auth-card fade-up">
        <div>
          <Mark className="auth-mark" />
          <h1 className="auth-title">{lang === 'hi' ? 'कान्हा' : 'Kanha'}</h1>
          <p className="auth-subtitle">{t('login.subtitle')}</p>
        </div>

        {/* Google OAuth */}
        <button onClick={handleGoogle} className="btn-ghost" type="button">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {t('login.google')}
        </button>

        <div className="auth-divider">{t('login.or')}</div>

        {/* Magic link */}
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email" className="sr-only">{t('login.email')}</label>
          <input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="field-input"
            aria-label={t('login.email')}
            autoComplete="email"
          />
          <button type="submit" className="btn-primary">
            {t('login.send_link')}
          </button>
        </form>

        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}

        <p className="auth-fine">
          {t('login.fine')}
        </p>
      </div>
    </main>
  )
}
