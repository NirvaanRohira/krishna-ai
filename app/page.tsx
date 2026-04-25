import Link from 'next/link'

export default function Home() {
  return (
    <main className="landing-page">
      {/* Flame icon — SVG, no emoji */}
      <svg className="landing-icon fade-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-5-5-11-5-11z"/>
        <path d="M12 12c0 0-2 1.5-2 3a2 2 0 0 0 4 0c0-1.5-2-3-2-3z"/>
      </svg>

      <h1 className="landing-title fade-up fade-up-delay-1">Kanha</h1>
      <p className="landing-subtitle fade-up fade-up-delay-1">A voice from the sacred texts</p>

      <p className="landing-description fade-up fade-up-delay-2">
        Wisdom drawn from the Bhagavad Gita, Upanishads,<br />
        Yoga Sutras, and Bhagavatam —<br />
        offered in the spirit of a yogi who has lived them.
      </p>

      <Link href="/login" className="landing-begin fade-up fade-up-delay-3">
        Begin
      </Link>

      <p className="landing-disclaimer">
        This is an AI drawing from Sanskrit texts. It is not a spiritual authority.
      </p>
    </main>
  )
}
