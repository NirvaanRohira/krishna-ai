'use client'
import { useLang } from '@/components/LangProvider'

/** EN ⇄ हिं. Shows the language you'd switch *to*, in that language. */
export function LanguageToggle({ className = 'icon-btn lang-btn' }: { className?: string }) {
  const { lang, t, setLang } = useLang()
  const next = lang === 'hi' ? 'en' : 'hi'
  return (
    <button type="button" className={className} onClick={() => setLang(next)} aria-label={t('lang.switch_label')} title={t('lang.switch_label')} lang={next}>
      {t('lang.switch_to')}
    </button>
  )
}
