// Lightweight language detection for choosing a TTS voice. Script ranges are unambiguous;
// Hinglish (Hindi in Latin letters) is detected from common function words.
// Devanagari defaults to Hindi (Marathi shares the script; the LLM still replies correctly,
// the voice will just be Hindi-accented — acceptable until we track a user preference).

export type Lang = 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'kn' | 'ml' | 'gu' | 'pa' | 'or' | 'hinglish'

const SCRIPTS: [RegExp, Lang][] = [
  [/[ऀ-ॿ]/g, 'hi'],
  [/[ঀ-৿]/g, 'bn'],
  [/[਀-੿]/g, 'pa'],
  [/[઀-૿]/g, 'gu'],
  [/[଀-୿]/g, 'or'],
  [/[஀-௿]/g, 'ta'],
  [/[ఀ-౿]/g, 'te'],
  [/[ಀ-೿]/g, 'kn'],
  [/[ഀ-ൿ]/g, 'ml'],
]

const HINGLISH_WORDS = new Set([
  'hai', 'hain', 'nahi', 'nahin', 'kya', 'kyun', 'kyu', 'mein', 'main', 'mera', 'meri', 'mere', 'tum', 'aap',
  'kaise', 'kaisa', 'kuch', 'bahut', 'bhi', 'toh', 'aur', 'lekin', 'kar', 'karna', 'karo', 'raha', 'rahi',
  'hoon', 'hu', 'ho', 'tha', 'thi', 'ki', 'ka', 'ke', 'ko', 'se', 'yeh', 'woh', 'ab', 'jab', 'kab', 'dil', 'zindagi',
])

export function detectLanguage(text: string): Lang {
  let best: Lang = 'en'
  let bestCount = 0
  for (const [re, lang] of SCRIPTS) {
    const n = text.match(re)?.length ?? 0
    if (n > bestCount) { best = lang; bestCount = n }
  }
  const letters = text.replace(/[\s\d.,!?;:'"()\-–—।॥]/g, '').length || 1
  if (bestCount / letters > 0.3) return best

  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  if (words.length >= 3) {
    const hits = words.filter((w) => HINGLISH_WORDS.has(w)).length
    if (hits / words.length >= 0.2) return 'hinglish'
  }
  return 'en'
}

/** BCP-47 locale used by Indian TTS voices. Hinglish is read best by an en-IN voice. */
export function ttsLocale(lang: Lang): string {
  return lang === 'en' || lang === 'hinglish' ? 'en-IN' : `${lang}-IN`
}
