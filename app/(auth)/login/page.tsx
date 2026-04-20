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

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-center text-lg">Check your email for the sign-in link.</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center">Sign in to Krishna AI</h1>
        <label htmlFor="email" className="sr-only">Email</label>
        <input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border rounded px-4 py-2 text-base"
          aria-label="Email"
        />
        <button type="submit" className="bg-amber-700 text-white rounded px-4 py-2 text-base hover:bg-amber-800">
          Send magic link
        </button>
      </form>
    </main>
  )
}
