// IAST (the scholarly romanisation the corpus is stored in) → Devanagari.
// Deterministic and dependency-free: "śreyān svadharmo" → "श्रेयान् स्वधर्मो".

const VOWELS: Record<string, [independent: string, sign: string]> = {
  a: ['अ', ''], 'ā': ['आ', 'ा'], i: ['इ', 'ि'], 'ī': ['ई', 'ी'], u: ['उ', 'ु'], 'ū': ['ऊ', 'ू'],
  'ṛ': ['ऋ', 'ृ'], 'ṝ': ['ॠ', 'ॄ'], 'ḷ': ['ऌ', 'ॢ'], e: ['ए', 'े'], ai: ['ऐ', 'ै'], o: ['ओ', 'ो'], au: ['औ', 'ौ'],
}

const CONSONANTS: Record<string, string> = {
  k: 'क', kh: 'ख', g: 'ग', gh: 'घ', 'ṅ': 'ङ', c: 'च', ch: 'छ', j: 'ज', jh: 'झ', 'ñ': 'ञ',
  'ṭ': 'ट', 'ṭh': 'ठ', 'ḍ': 'ड', 'ḍh': 'ढ', 'ṇ': 'ण', t: 'त', th: 'थ', d: 'द', dh: 'ध', n: 'न',
  p: 'प', ph: 'फ', b: 'ब', bh: 'भ', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व',
  'ś': 'श', 'ṣ': 'ष', s: 'स', h: 'ह', 'ḻ': 'ळ',
}

const MARKS: Record<string, string> = { 'ṃ': 'ं', 'ṁ': 'ं', 'ḥ': 'ः', "'": 'ऽ', '’': 'ऽ', '|': '।' }
const VIRAMA = '्'
const DIGITS = '०१२३४५६७८९'

const TOKENS = [...Object.keys(VOWELS), ...Object.keys(CONSONANTS), ...Object.keys(MARKS)].sort((a, b) => b.length - a.length)

export function iastToDevanagari(input: string): string {
  const s = input.normalize('NFC').toLowerCase().replace(/m̐/g, 'ँ')
  let out = ''
  let afterConsonant = false
  let i = 0
  while (i < s.length) {
    const tok = TOKENS.find((t) => s.startsWith(t, i))
    if (tok && tok in CONSONANTS) {
      if (afterConsonant) out += VIRAMA
      out += CONSONANTS[tok]
      afterConsonant = true
    } else if (tok && tok in VOWELS) {
      out += afterConsonant ? VOWELS[tok][1] : VOWELS[tok][0]
      afterConsonant = false
    } else if (s[i] === ' ' && afterConsonant && /[a-zāīūṛṝḷṅñṭḍṇśṣḻ]/.test(s[i + 1] ?? '')) {
      // Printed editions join a word ending in a consonant to the next one
      // ("karmaṇy evādhikāras te" → कर्मण्येवाधिकारस्ते): drop the space, keep the cluster open.
    } else {
      if (afterConsonant) out += VIRAMA
      afterConsonant = false
      if (tok) out += MARKS[tok]
      else {
        const ch = s[i]
        out += /\d/.test(ch) ? DIGITS[Number(ch)] : ch
      }
    }
    i += tok ? tok.length : 1
  }
  if (afterConsonant) out += VIRAMA
  return out
}

/** A verse laid out as in printed editions: half-verses split by । and closed with ॥ n ॥. */
export function formatShloka(iast: string, verse?: number | string): string {
  const lines = iast.split(/\n+/).map((l) => l.trim()).filter(Boolean).map(iastToDevanagari)
  // Non-breaking spaces keep "॥ ३५ ॥" together with the last word of the verse.
  const n = verse !== undefined && String(verse).trim() ? `\u00a0॥\u00a0${iastToDevanagari(String(verse))}\u00a0॥` : '\u00a0॥'
  return lines.map((l, i) => (i < lines.length - 1 ? `${l}\u00a0।` : `${l}${n}`)).join('\n')
}
