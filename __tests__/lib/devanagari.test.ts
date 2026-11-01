import { describe, it, expect } from 'vitest'
import { iastToDevanagari, formatShloka } from '@/lib/devanagari'

describe('IAST → Devanagari', () => {
  it('matches the printed Gita (3.35), joining words that end in a consonant', () => {
    expect(formatShloka('śreyān svadharmo viguṇaḥ paradharmāt svanuṣṭhitāt\nsvadharme nidhanaṃ śreyaḥ paradharmo bhayāvahaḥ', 35)).toBe(
      'श्रेयान्स्वधर्मो विगुणः परधर्मात्स्वनुष्ठितात् ।\nस्वधर्मे निधनं श्रेयः परधर्मो भयावहः ॥ ३५ ॥',
    )
  })

  it('handles clusters, aspirates, independent vowels and marks', () => {
    expect(iastToDevanagari('karmaṇy evādhikāras te mā phaleṣu kadācana')).toBe('कर्मण्येवाधिकारस्ते मा फलेषु कदाचन')
    expect(iastToDevanagari('dharmakṣetre kurukṣetre')).toBe('धर्मक्षेत्रे कुरुक्षेत्रे')
    expect(iastToDevanagari('oṃ')).toBe('ओं')
    expect(iastToDevanagari('ṛṣiḥ')).toBe('ऋषिः')
    expect(iastToDevanagari("so 'ham")).toBe('सो ऽहम्')
  })
})
