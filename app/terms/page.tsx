import { TERMS_VERSION } from '@/lib/legal'

export const metadata = { title: 'Terms of Use' }

// DRAFT terms. These MUST be reviewed by an Indian lawyer before public launch.
export default function TermsPage() {
  return (
    <main className="legal-page">
      <h1>Terms of Use</h1>
      <p className="legal-draft">Draft version {TERMS_VERSION}. Pending legal review; not yet final.</p>

      <h2>What this is</h2>
      <p>An AI companion for reflecting on the Bhagavad Gita and related texts. It is <strong>software</strong>. It is not God, not Krishna, not a guru, and not a religious authority. The Krishna figure is an artistic depiction, made with respect for the tradition.</p>

      <h2>Not professional advice</h2>
      <p>Nothing here is medical, mental-health, legal or financial advice. If you are in crisis, call iCall on 9152987821, Tele-MANAS on 14416, or emergency services on 112.</p>

      <h2>Eligibility</h2>
      <p>You must be 18 or older.</p>

      <h2>Acceptable use</h2>
      <p>Do not use the service to harass anyone, to generate content that insults any religion or community, to impersonate others, or to try to break or misuse the AI.</p>

      <h2>Subscriptions</h2>
      <p>[Plan details, auto-renewal, cancellation and refund terms will be added before paid plans launch.]</p>

      <h2>Liability</h2>
      <p>[To be drafted by counsel.]</p>
    </main>
  )
}
