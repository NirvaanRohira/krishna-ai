import { getT } from '@/lib/i18n/server'

/** On legal pages: in Hindi, say plainly that the binding text is the English one for now. */
export async function EnglishOnlyNote() {
  const { lang, t } = await getT()
  if (lang !== 'hi') return null
  return <p className="legal-lang-note" lang="hi" role="note">{t('legal.english_only')}</p>
}
