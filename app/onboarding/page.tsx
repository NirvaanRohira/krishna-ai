'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mark } from '@/components/Mark'
import { useLang } from '@/components/LangProvider'
import { LanguageToggle } from '@/components/LanguageToggle'

export default function OnboardingPage() {
  const { t } = useLang()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Each consent is a separate, unticked box (DPDP: consent must be specific and
  // affirmative — no pre-ticked or bundled consent). Marketing is optional.
  const [age, setAge] = useState(false)
  const [legal, setLegal] = useState(false)
  const [ai, setAi] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const canContinue = age && legal && ai
  const router = useRouter()

  async function completeOnboarding(): Promise<boolean> {
    try {
      const res = await Promise.race([
        fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ageConfirmed18: age, acceptTerms: legal, acceptPrivacy: legal, aiDisclosure: ai, marketingOptIn: marketing,
          }),
        }),
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
      setError(t('onb.failed'))
      setLoading(false)
      return
    }
    router.push('/chat')
  }

  return (
    <main className="onboarding-page">
      <div className="auth-lang"><LanguageToggle /></div>
      <div className="fade-up" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>

        <Mark className="onboarding-mark" />

        <h1 className="onboarding-title">{t('onb.title')}</h1>

        <div className="onboarding-body">
          <p>
            <strong>{t('onb.p1_strong')}</strong> {t('onb.p1')}
          </p>
          <p>
            {t('onb.p2')}{' '}
            <strong>Tele-MANAS 14416</strong> · <strong>iCall 9152987821</strong>.
          </p>
          <p>{t('onb.p3')}</p>
        </div>

        <fieldset className="onboarding-consents">
          <legend className="sr-only">{t('onb.consent')}</legend>
          <label><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> <span>{t('onb.age')}</span></label>
          <label><input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> <span>{t('onb.legal_a')} <Link href="/terms" target="_blank">{t('common.terms')}</Link> {t('onb.legal_and')} <Link href="/privacy" target="_blank">{t('common.privacy_notice')}</Link>{t('onb.legal_b')}</span></label>
          <label><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> <span>{t('onb.ai')}</span></label>
          <label className="onboarding-optional"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> <span>{t('onb.marketing')}</span></label>
        </fieldset>

        <button
          onClick={handleAccept}
          disabled={loading || !canContinue}
          className="btn-primary"
        >
          {loading ? t('onb.entering') : t('onb.begin')}
        </button>

        {error && (
          <p role="alert" className="auth-error" style={{ marginTop: '0.75rem' }}>
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
