import { en, hi, type MessageKey } from './messages'

// The interface language. Replies follow the language the person writes in (see
// lib/prompts/chat.ts); this only decides the buttons, labels and pages around them.
export type Lang = 'en' | 'hi'
export const LANGS: Lang[] = ['en', 'hi']
export const LANG_COOKIE = 'kanha_lang'

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, hi }

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'hi'
}

/** A saved choice wins; otherwise a browser set to Hindi gets Hindi; otherwise English. */
export function pickLang(cookie: string | undefined | null, acceptLanguage: string | undefined | null): Lang {
  if (isLang(cookie)) return cookie
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? ''
  return first.startsWith('hi') ? 'hi' : 'en'
}

export type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string

export function translator(lang: Lang): TFn {
  const table = MESSAGES[lang]
  return (key, vars) => {
    let s = table[key] ?? en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
    return s
  }
}

/** Dates the way each language writes them (en-IN: "2 November 2026"; hi-IN: "2 नवंबर 2026"). */
export function formatDate(lang: Lang, iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', opts)
}

export type { MessageKey }
