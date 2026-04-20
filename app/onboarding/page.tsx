'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleAccept() {
    setLoading(true)
    await fetch('/api/onboarding/complete', { method: 'POST' })
    router.push('/chat')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 gap-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold text-center">Before you begin</h1>

      <div className="flex flex-col gap-4 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        <p>
          <strong style={{ color: 'var(--foreground)' }}>This is an AI</strong>, not a spiritual authority.
          It draws from the Bhagavad Gita, Upanishads, Yoga Sutras, and Bhagavatam —
          texts that have guided millions. But it is software, not a guru.
        </p>
        <p>
          Use it to reflect, not to replace professional help. If you are in crisis,
          please reach out to <strong style={{ color: 'var(--foreground)' }}>iCall: 9152987821</strong>.
        </p>
        <p>
          The wisdom here is offered with humility. Take what serves you, leave what does not.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full text-xs" style={{ color: 'var(--muted)' }}>
        <label className="flex items-start gap-2">
          <span>By continuing, you acknowledge this is an AI drawing from Sanskrit texts and not a substitute for professional medical, legal, or spiritual guidance.</span>
        </label>
      </div>

      <button
        onClick={handleAccept}
        disabled={loading}
        className="w-full py-3 rounded-lg text-white font-medium"
        style={{ background: '#92400e', opacity: loading ? 0.6 : 1 }}
      >
        {loading ? 'Entering…' : 'I understand — begin'}
      </button>
    </main>
  )
}
