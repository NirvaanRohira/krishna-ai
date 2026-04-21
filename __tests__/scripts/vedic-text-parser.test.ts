import { describe, it, expect } from 'vitest'
import {
  parseGretilInline,
  parseGretilBlock,
  parseAitareya,
  parseBhagavatam,
  parseItxKena,
  parseItxMundaka,
  parseItxTaittiriya,
} from '../../scripts/lib/vedic-text-parser'

// ── parseGretilInline ──────────────────────────────────────────────
// Handles: || prefix_N || (single-number, e.g. Isha, Mandukya)
//          || prefix_N.N || (chapter.verse, e.g. Yoga Sutras, Prashna)

describe('parseGretilInline', () => {
  it('parses single-number marker (Isha style)', () => {
    const text = `
# Text
oṃ īśā vāsyam idaṃ sarvaṃ || isup_1 ||
kurvann eveha karmāṇi || isup_2 ||
`
    const verses = parseGretilInline(text, 'isup')
    expect(verses).toHaveLength(2)
    expect(verses[0]).toMatchObject({ chapter: 1, verse: 1 })
    expect(verses[0].text).toContain('oṃ īśā vāsyam')
    expect(verses[1]).toMatchObject({ chapter: 1, verse: 2 })
  })

  it('parses chapter.verse marker (Yoga Sutras style — all on one line)', () => {
    const sample = `# Text\natha yogānuśāsanam || ys_1.1 ||yogaś cittavṛttinirodhaḥ || ys_1.2 ||tadā draṣṭuḥ || ys_1.3 ||`
    const verses = parseGretilInline(sample, 'ys')
    expect(verses).toHaveLength(3)
    expect(verses[0]).toMatchObject({ chapter: 1, verse: 1 })
    expect(verses[0].text).toContain('yogānuśāsanam')
    expect(verses[1]).toMatchObject({ chapter: 1, verse: 2 })
    expect(verses[2]).toMatchObject({ chapter: 1, verse: 3 })
  })

  it('does not match commentary markers (isupbh_ ≠ isup_)', () => {
    const text = `# Text\noṃ īśā vāsyam || isup_1 ||\nsome commentary text || isupbh_1 ||\n`
    const verses = parseGretilInline(text, 'isup')
    expect(verses).toHaveLength(1)
    expect(verses[0].verse).toBe(1)
  })

  it('strips header text before first verse marker', () => {
    const text = `
Patañjali: Yogasūtra
# Header
## Data entry: Someone
# Text
atha yogānuśāsanam || ys_1.1 ||
`
    const verses = parseGretilInline(text, 'ys')
    expect(verses).toHaveLength(1)
    expect(verses[0].text).not.toContain('Patañjali')
    expect(verses[0].text).not.toContain('Data entry')
  })

  it('handles Mandukya single-chapter format (mandup_N)', () => {
    const text = `# Text\noṃ ity etad akṣaram || mandup_1 ||\nsarvaṃ hy etad brahma || mandup_2 ||\n`
    const verses = parseGretilInline(text, 'mandup')
    expect(verses).toHaveLength(2)
    expect(verses[0]).toMatchObject({ chapter: 1, verse: 1 })
    expect(verses[1]).toMatchObject({ chapter: 1, verse: 2 })
  })

  it('handles Prashna two-part format (prup_N.N)', () => {
    const text = `# Text\nsukeśā ca bhāradvājaḥ || prup_1.1 ||\ntān ha sa ṛṣir uvāca || prup_1.2 ||\n`
    const verses = parseGretilInline(text, 'prup')
    expect(verses).toHaveLength(2)
    expect(verses[0]).toMatchObject({ chapter: 1, verse: 1 })
    expect(verses[1]).toMatchObject({ chapter: 1, verse: 2 })
  })
})

// ── parseGretilBlock ───────────────────────────────────────────────
// Handles: text spread across multiple lines ending with // kau_N.N //

describe('parseGretilBlock', () => {
  const KATHA_SAMPLE = `# Text

kaṭhopaniṣat

uśan ha vai vājaśravasaḥ sarvavedasaṃ dadau /
tasya ha naciketā nāma putra āsa // kau_1.1 //

taṃ ha kumāraṃ santaṃ dakṣiṇāsu nīyamānāsu śraddhāviveśa /
so 'manyata // kau_1.2 //

pītodakā jagdhatṛṇā dugdhadohā nirindriyāḥ /
anandā nāma te lokās tān sa gacchati tā dadat // kau_1.3 //
`

  it('parses multi-line verses delimited by // ref //  markers', () => {
    const verses = parseGretilBlock(KATHA_SAMPLE, 'kau')
    expect(verses).toHaveLength(3)
  })

  it('extracts chapter and verse from kau_N.N marker', () => {
    const verses = parseGretilBlock(KATHA_SAMPLE, 'kau')
    expect(verses[0]).toMatchObject({ chapter: 1, verse: 1 })
    expect(verses[2]).toMatchObject({ chapter: 1, verse: 3 })
  })

  it('assembles multi-line verse text correctly', () => {
    const verses = parseGretilBlock(KATHA_SAMPLE, 'kau')
    expect(verses[0].text).toContain('vājaśravasaḥ')
    expect(verses[0].text).toContain('naciketā')
  })

  it('strips the / line-break character used in Sanskrit meter', () => {
    const verses = parseGretilBlock(KATHA_SAMPLE, 'kau')
    // The / line-break at end of first half-verse should not appear as literal slash
    expect(verses[0].text).not.toMatch(/\s+\/\s+/)
  })
})

// ── parseAitareya ──────────────────────────────────────────────────
// Handles: || aitup_N,N.N || (adhyaya,section.mantra notation)

describe('parseAitareya', () => {
  const SAMPLE = `# Text
ātmā vā idam eka evāgra āsīt | nānyat kiñcana miṣat | sa īkṣata lokān nu sṛjā iti || aitup_1,1.1 ||
sa imāṃl lokān asṛjata || aitup_1,1.2 ||
sa īkṣateme nu lokāḥ || aitup_1,1.3 ||
nāsike nirabhidyetām || aitup_1,2.1 ||
`

  it('parses aitup_N,N.N markers', () => {
    const verses = parseAitareya(SAMPLE)
    expect(verses).toHaveLength(4)
  })

  it('encodes adhyaya and section into book_chapter', () => {
    const verses = parseAitareya(SAMPLE)
    // adhyaya=1, section=1 → chapter=11
    expect(verses[0].chapter).toBe(11)
    // adhyaya=1, section=2 → chapter=12
    expect(verses[3].chapter).toBe(12)
  })

  it('extracts mantra as verse number', () => {
    const verses = parseAitareya(SAMPLE)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[3].verse).toBe(1)
  })
})

// ── parseBhagavatam ────────────────────────────────────────────────
// Handles: // bhp_SS.CC.VVV // and // bhp_SS.CC.VVV* //
// Encodes skandha and chapter as: book_chapter = skandha * 1000 + chapter

describe('parseBhagavatam', () => {
  const SAMPLE = `# Text
janmādyasya yato 'nvayāditarataś $ cārtheṣvabhijñaḥ svarāṭ &tejovārimṛdāṃ % dhāmnā svena sadā nirastakuhakaṃ satyaṃ paraṃ dhīmahi // bhp_01.01.001* //
dharmaḥ projjhitakaitavo 'tra // bhp_01.01.002* //

naimiṣe 'nimiṣakṣetre īśayaḥ śaunakādayaḥ /
satraṃ svargāya lokāya sahasrasamam āsata // bhp_01.01.004 //

tapaḥsvādhyāyeśvarapraṇidhānāni kriyāyogaḥ // bhp_02.01.001 //
`

  it('parses both starred and non-starred verse markers', () => {
    const verses = parseBhagavatam(SAMPLE)
    expect(verses.length).toBeGreaterThanOrEqual(4)
  })

  it('encodes skandha and chapter into book_chapter', () => {
    const verses = parseBhagavatam(SAMPLE)
    // Skandha 1, Chapter 1 → 1001
    expect(verses[0].chapter).toBe(1001)
  })

  it('handles Skandha 2 correctly', () => {
    const verses = parseBhagavatam(SAMPLE)
    const sk2 = verses.find(v => v.chapter === 2001)
    expect(sk2).toBeDefined()
  })

  it('extracts the verse number', () => {
    const verses = parseBhagavatam(SAMPLE)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
  })

  it('strips prosodic markers ($ & %) from verse text', () => {
    const verses = parseBhagavatam(SAMPLE)
    expect(verses[0].text).not.toContain('$')
    expect(verses[0].text).not.toContain('&')
    expect(verses[0].text).not.toContain('%')
  })
})

// ── parseItxKena ───────────────────────────────────────────────────
// ITRANS .itx format: verse text followed by || N||
// 4 khandas; chapter boundary marker: || iti kenopaniShadi XXX khaNDaH ||

describe('parseItxKena', () => {
  const SAMPLE = `\\begin{document}
\\engtitle{.. Kena Upanishad ..}##
\\medskip\\hrule\\medskip
OM keneShitaM patati preShitaM manaH
    kena prANaH prathamaH praiti yuktaH || 1||
shrotrasya shrotraM manaso mano yad.h || 2||
          || iti kenopaniShadi prathamaH khaNDaH ||
\\medskip\\hrule\\medskip
yadi manyase suvedeti || 1||
nAhaM manye suvedeti || 2||
       || iti kenopaniShadi dvitIyaH khaNDaH ||
`

  it('parses verses from both khandas', () => {
    const verses = parseItxKena(SAMPLE)
    expect(verses).toHaveLength(4)
  })

  it('assigns correct chapter numbers', () => {
    const verses = parseItxKena(SAMPLE)
    expect(verses[0].chapter).toBe(1)
    expect(verses[1].chapter).toBe(1)
    expect(verses[2].chapter).toBe(2)
    expect(verses[3].chapter).toBe(2)
  })

  it('assigns correct verse numbers within each khanda', () => {
    const verses = parseItxKena(SAMPLE)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(1)
    expect(verses[3].verse).toBe(2)
  })

  it('strips LaTeX commands from verse text', () => {
    const verses = parseItxKena(SAMPLE)
    expect(verses[0].text).not.toContain('\\medskip')
    expect(verses[0].text).not.toContain('\\hrule')
    expect(verses[0].text).not.toContain('\\engtitle')
  })

  it('includes the Sanskrit text in the verse', () => {
    const verses = parseItxKena(SAMPLE)
    expect(verses[0].text).toContain('keneShitaM')
  })
})

// ── parseItxMundaka ────────────────────────────────────────────────
// ITRANS .itx format: verse text followed by || N||
// 6 sections (3 Mundakas × 2 Khandas); chapter encoded as mundaka*10+khanda

describe('parseItxMundaka', () => {
  const SAMPLE = `\\begin{document}
|| prathamamuNDake prathamaH khaNDaH ||
brahmA devAnAM prathamaH || 1||
atharvaNe yAM pravadeta brahmA || 2||
|| iti muNDakopaniShadi prathamamuNDake prathamaH khaNDaH ||

|| prathamamuNDake dvitIyaH khaNDaH ||
tadetatsatyaM || 1||
|| iti muNDakopaniShadi prathamamuNDake dvitIyaH khaNDaH ||

|| dvitIya muNDake prathamaH khaNDaH ||
aprANo hyamanAH shubhro || 1||
|| iti muNDakopaniShadi dvitIyamuNDake prathamaH khaNDaH ||
`

  it('parses verses across sections', () => {
    const verses = parseItxMundaka(SAMPLE)
    expect(verses).toHaveLength(4)
  })

  it('encodes mundaka and khanda into chapter (mundaka*10+khanda)', () => {
    const verses = parseItxMundaka(SAMPLE)
    expect(verses[0].chapter).toBe(11) // M1K1
    expect(verses[1].chapter).toBe(11) // M1K1
    expect(verses[2].chapter).toBe(12) // M1K2
    expect(verses[3].chapter).toBe(21) // M2K1
  })

  it('verse numbers reset per section', () => {
    const verses = parseItxMundaka(SAMPLE)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(1)
    expect(verses[3].verse).toBe(1)
  })

  it('includes Sanskrit text', () => {
    const verses = parseItxMundaka(SAMPLE)
    expect(verses[0].text).toContain('brahmA devAnAM')
  })
})

// ── parseItxTaittiriya ─────────────────────────────────────────────
// ITRANS .itx format with Vedic accents; each anuvaka is one verse unit
// 3 vallis (chapters 1-3); anuvaka = verse; end marker: iti N.anuvAkaH

describe('parseItxTaittiriya', () => {
  // Accent markers in ITRANS: \' (udatta) and \` (anudatta) are embedded in words
  const SAMPLE = [
    '\\begin{document}',
    '\\section{prathamA shIkShAvallI}',
    "OM shAnti\\'H shAnti\\'H shAnti\\'H .. 1..",
    'iti prathamo.anuvAkaH ..',
    '',
    'varNaH svaraH ityuktaH .. 1..',
    'iti dvitIyo.anuvAkaH ..',
    '',
    '.. iti shIkShAvallI samAptA ..',
    '\\section{dvitIyA brahmAnandavallI}',
    'brahmavidyA .. 1..',
    'iti prathamo.anuvAkaH ..',
    '',
    '.. iti brahmAnandavallI samAptA ..',
  ].join('\n')

  it('parses each anuvaka as one verse', () => {
    const verses = parseItxTaittiriya(SAMPLE)
    expect(verses).toHaveLength(3)
  })

  it('assigns valli as chapter', () => {
    const verses = parseItxTaittiriya(SAMPLE)
    expect(verses[0].chapter).toBe(1)
    expect(verses[1].chapter).toBe(1)
    expect(verses[2].chapter).toBe(2)
  })

  it('assigns sequential anuvaka numbers as verse', () => {
    const verses = parseItxTaittiriya(SAMPLE)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(1)
  })

  it("strips the \\' Vedic udatta accent marker", () => {
    const verses = parseItxTaittiriya(SAMPLE)
    // Input has sha\'ntiH — after stripping should be shAntiH without backslash
    expect(verses[0].text).not.toContain("\\")
  })

  it('strips LaTeX section commands from text', () => {
    const verses = parseItxTaittiriya(SAMPLE)
    expect(verses[0].text).not.toContain('section')
  })

  it('contains the Sanskrit words after cleaning', () => {
    const verses = parseItxTaittiriya(SAMPLE)
    expect(verses[0].text).toContain('shAntiH')
  })
})
