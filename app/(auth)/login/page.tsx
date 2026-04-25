'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/chat` } })
    setSubmitted(true)
  }

  async function handleGoogle() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    })
  }

  if (submitted) {
    return (
      <main className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center', gap: '0.75rem' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 300, color: 'var(--fg)', margin: 0 }}>
            Check your email
          </p>
          <p style={{ fontSize: '0.825rem', color: 'var(--fg-muted)', margin: 0, fontStyle: 'italic' }}>
            The sign-in link is on its way.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-card fade-up">
        <div style={{ textAlign: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 0.75rem' }} aria-hidden="true">
            <path d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-5-5-11-5-11z"/>
            <path d="M12 12c0 0-2 1.5-2 3a2 2 0 0 0 4 0c0-1.5-2-3-2-3z"/>
          </svg>
          <h1 className="auth-title">Kanha</h1>
          <p className="auth-subtitle">Sign in to continue</p>
        </div>

        {/* Google OAuth */}
        <button onClick={handleGoogle} className="btn-ghost" type="button">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider">or</div>

        {/* Magic link */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          <label htmlFor="email" className="sr-only">Email address</label>
          <input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="field-input"
            aria-label="Email address"
            autoComplete="email"
          />
          <button type="submit" className="btn-primary">
            Send magic link
          </button>
        </form>

        <p style={{ fontSize: '0.65rem', color: 'var(--fg-dim)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
          By signing in you acknowledge this is an AI drawing from Sanskrit texts,
          not a substitute for professional guidance.
        </p>
      </div>
    </main>
  )
}
