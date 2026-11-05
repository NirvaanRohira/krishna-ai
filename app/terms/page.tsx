import { TERMS_VERSION } from '@/lib/legal'
import { EnglishOnlyNote } from '@/components/EnglishOnlyNote'

export const metadata = { title: 'Terms of Use' }

// DRAFT terms. These MUST be reviewed by an Indian lawyer before public launch.
export default function TermsPage() {
  return (
    <main className="legal-page">
      <EnglishOnlyNote />
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
      <p>Paid plans (Plus and Premium) are one-time passes for 30 days or one year, paid through Razorpay. Prices are shown in Indian rupees and include any applicable taxes. <strong>Nothing renews automatically</strong>: when a pass ends you return to the free plan unless you buy again. Buying again adds the new days to the time you have left.</p>
      <p><strong>Refunds.</strong> If you were charged twice, charged for a pass you did not receive, or the service did not work for you, write to the grievance contact below within 7 days of payment and we will refund you to the original payment method. Refunds take 5–7 working days to reach you. A refunded pass ends early by the days it covered.</p>
      <p>[Draft: to be reviewed by a lawyer before launch.]</p>

      <h2>Liability</h2>
      <p>[To be drafted by counsel.]</p>
    </main>
  )
}
