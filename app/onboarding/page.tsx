'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function completeOnboarding(): Promise<boolean> {
    try {
      const res = await Promise.race([
        fetch('/api/onboarding/complete', { method: 'POST' }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      return (res as Response).ok
    } catch {
      return false
    }
  }

  async function handleAccept() {
    setLoading(true)
    setError(null)
    // The profile's onboarding flag is set server-side here; if it fails, the middleware
    // will bounce the user back to /onboarding forever. So verify success (with one retry)
    // instead of pushing to /chat regardless, which created a silent redirect loop.
    let ok = await completeOnboarding()
    if (!ok) ok = await completeOnboarding()
    if (!ok) {
      setError('Something went wrong saving your preferences. Please try again.')
      setLoading(false)
      return
    }
    router.push('/chat')
  }

  return (
    <main className="onboarding-page">
      <div className="fade-up" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>

        {/* Flame */}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1.5rem', opacity: 0.7 }} aria-hidden="true">
          <path d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-5-5-11-5-11z"/>
          <path d="M12 12c0 0-2 1.5-2 3a2 2 0 0 0 4 0c0-1.5-2-3-2-3z"/>
        </svg>

        <h1 className="onboarding-title">Before you begin</h1>

        <div className="onboarding-body">
          <p>
            <strong>This is an AI</strong>, not a spiritual authority.
            It draws from the Bhagavad Gita, Upanishads, Yoga Sutras,
            and Srimad Bhagavatam — texts that have guided millions.
            But it is software, not a guru.
          </p>
          <p>
            Use it to reflect, not to replace professional help.
            If you are in crisis, please reach out to{' '}
            <strong>iCall: 9152987821</strong>.
          </p>
          <p>
            The wisdom here is offered with humility.
            Take what serves you, leave what does not.
          </p>
        </div>

        <p className="onboarding-fine">
          By continuing, you acknowledge this is an AI drawing from Sanskrit texts
          and not a substitute for professional medical, legal, or spiritual guidance.
        </p>

        <button
          onClick={handleAccept}
          disabled={loading}
          className="btn-primary"
          style={{ maxWidth: '18rem' }}
        >
          {loading ? 'Entering…' : 'I understand — begin'}
        </button>

        {error && (
          <p role="alert" style={{ fontSize: '0.75rem', color: 'var(--danger, #c0392b)', textAlign: 'center', marginTop: '0.75rem' }}>
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
