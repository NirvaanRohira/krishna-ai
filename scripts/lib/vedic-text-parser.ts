import type { ParsedVerse } from './gretil-parser'

function stripItxPreamble(text: string): string {
  const idx = text.indexOf('\\begin{document}')
  return idx >= 0 ? text.slice(idx) : text
}

function cleanItxText(raw: string): string {
  return raw
    // Strip Vedic accent markers: \' \" \` embedded in words
    .replace(/\\'/g, '')
    .replace(/\\"/g, '')
    .replace(/\\`/g, '')
    // Anusvara notation {\m+} → M
    .replace(/\{\\m\+?\}/g, 'M')
    // LaTeX commands with args
    .replace(/\\[a-zA-Z]+\{[^}]*\}/g, ' ')
    // Remaining LaTeX commands
    .replace(/\\[a-zA-Z]+/g, ' ')
    // Remaining braces
    .replace(/[{}]/g, ' ')
    // ITRANS end-of-line markers
    .replace(/##/g, '')
    // Sub-verse numbering inside anuvakas: .. N ..
    .replace(/\.\.\s*\d+\s*\.\./g, '')
    // Textual variants in parens
    .replace(/\([^)]+\)/g, '')
    // Pipe characters (prose separators)
    .replace(/\|/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHeader(text: string): string {
  const idx = text.indexOf('# Text')
  return idx >= 0 ? text.slice(idx + 6) : text
}

function cleanVerse(raw: string): string {
  return raw
    .replace(/\$|&|%/g, '')   // prosodic markers
    .replace(/\s*\/\s*\n/g, ' ') // Sanskrit metre half-verse breaks
    .replace(/\s*\/\s*$/gm, '') // trailing / on lines
    .replace(/\s+/g, ' ')
    .trim()
}

// Handles: text || prefix_N || or text || prefix_N.N ||
// Used for: Isha (isup), Mandukya (mandup), Prashna (prup), Yoga Sutras (ys)
export function parseGretilInline(fullText: string, prefix: string): ParsedVerse[] {
  const body = stripHeader(fullText)
  // Match: text then || prefix_N || or || prefix_N.N ||
  // Uses negative lookahead so "isup_" won't match "isupbh_"
  const re = new RegExp(
    `([\\s\\S]*?)\\s*\\|\\|\\s*${prefix}_(\\d+)(?:\\.(\\d+))?\\s*\\|\\|`,
    'g'
  )

  const results: ParsedVerse[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const rawText = match[1]
    const firstNum = parseInt(match[2], 10)
    const secondNum = match[3] !== undefined ? parseInt(match[3], 10) : undefined

    const text = cleanVerse(rawText)
    if (!text) continue // skip header-only captures

    if (secondNum !== undefined) {
      results.push({ chapter: firstNum, verse: secondNum, text })
    } else {
      results.push({ chapter: 1, verse: firstNum, text })
    }
  }
  return results
}

// Handles: multi-line verses ending with // prefix_N.N //
// Used for: Katha (kau)
export function parseGretilBlock(fullText: string, prefix: string): ParsedVerse[] {
  const body = stripHeader(fullText)
  const re = new RegExp(
    `([\\s\\S]*?)\\/\\/ ${prefix}_(\\d+)\\.(\\d+) \\/\\/`,
    'g'
  )

  const results: ParsedVerse[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const rawText = match[1]
    const chapter = parseInt(match[2], 10)
    const verse = parseInt(match[3], 10)
    const text = cleanVerse(rawText)
    if (!text) continue
    results.push({ chapter, verse, text })
  }
  return results
}

// Handles: || aitup_N,N.N || (adhyaya,section.mantra)
// Encodes book_chapter as adhyaya * 10 + section
export function parseAitareya(fullText: string): ParsedVerse[] {
  const body = stripHeader(fullText)
  const re = /([^\|]*?)\s*\|\|\s*aitup_(\d+),(\d+)\.(\d+)\s*\|\|/g

  const results: ParsedVerse[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const rawText = match[1]
    const adhyaya = parseInt(match[2], 10)
    const section = parseInt(match[3], 10)
    const mantra = parseInt(match[4], 10)
    const text = cleanVerse(rawText)
    if (!text) continue
    results.push({
      chapter: adhyaya * 10 + section,
      verse: mantra,
      text,
    })
  }
  return results
}

// Handles: // bhp_SS.CC.VVV // and // bhp_SS.CC.VVV* //
// Encodes book_chapter as skandha * 1000 + chapter_within_skandha
export function parseBhagavatam(fullText: string): ParsedVerse[] {
  const body = stripHeader(fullText)
  // Match text before each verse marker; marker may use || ... // or just // ... //
  const re = /([\s\S]*?)\/\/\s*bhp_(\d{2})\.(\d{2})\.(\d{3})\*?\s*\/\//g

  const results: ParsedVerse[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const rawText = match[1]
    const skandha = parseInt(match[2], 10)
    const chapter = parseInt(match[3], 10)
    const verse = parseInt(match[4], 10)
    const text = cleanVerse(rawText)
    if (!text) continue
    results.push({
      chapter: skandha * 1000 + chapter,
      verse,
      text,
    })
  }
  return results
}

// ── Sanskrit Documents ITRANS (.itx) parsers ──────────────────────

// Kena Upanishad: 4 khandas, verse marker || N||
// Chapter boundary: || iti kenopaniShadi XXX khaNDaH ||
export function parseItxKena(fullText: string): ParsedVerse[] {
  const body = stripItxPreamble(fullText)
  const results: ParsedVerse[] = []
  let chapter = 1
  let accum = ''

  const CHAPTER_END = /\|\|[^|]*iti\s+kenopaniShadi\s+(\S+)\s+khaNDaH/i
  const VERSE_END = /^(.*?)\|\|\s*(\d+)\|\|/

  for (const line of body.split('\n')) {
    const trimmed = line.trim()

    // Chapter boundary — ordinal tells which chapter just ENDED; advance to next
    if (CHAPTER_END.test(trimmed)) {
      const m = trimmed.match(/(\S+)\s+khaNDaH/i)
      if (m) {
        const ord = m[1].toLowerCase()
        if (ord.includes('prathama')) chapter = 2      // khanda 1 ended → 2
        else if (ord.includes('dvit')) chapter = 3    // khanda 2 ended → 3
        else if (ord.includes('tr^it') || ord.includes('trit')) chapter = 4
        // chaturthaH = last khanda; no advance needed
      }
      accum = ''
      continue
    }

    // Skip pure LaTeX control lines (no verse content)
    if (/^\\[a-zA-Z]/.test(trimmed) && !trimmed.includes('||')) {
      accum = ''
      continue
    }

    const verseMatch = trimmed.match(/^([\s\S]*?)\|\|\s*(\d+)\|\|/)
    if (verseMatch) {
      const raw = accum + ' ' + verseMatch[1]
      const verse = parseInt(verseMatch[2], 10)
      const text = cleanItxText(raw)
      if (text) results.push({ chapter, verse, text })
      accum = ''
    } else {
      accum += ' ' + trimmed
    }
  }
  return results
}

// Mundaka Upanishad: 3 Mundakas × 2 Khandas, verse marker || N||
// Chapter encoded as mundaka*10+khanda (11, 12, 21, 22, 31, 32)
// Section start: || prathamamuNDake prathamaH khaNDaH ||
export function parseItxMundaka(fullText: string): ParsedVerse[] {
  const body = stripItxPreamble(fullText)
  const results: ParsedVerse[] = []
  let chapter = 0
  let accum = ''

  const MUNDAKA_MAP: Array<[RegExp, number]> = [
    [/prathamamuNDake\s+prathamaH/i, 11],
    [/prathamamuNDake\s+dvitIyaH/i, 12],
    [/dvitIya\s*muNDake\s+prathamaH/i, 21],
    [/dvitIya\s*muNDake\s+dvitIyaH/i, 22],
    [/tR\^itIya\s*muNDake\s+prathamaH/i, 31],
    [/tR\^itIya\s*muNDake\s+dvitIyaH/i, 32],
  ]

  for (const line of body.split('\n')) {
    const trimmed = line.trim()

    // Section END marker — skip (just separates sections)
    if (/iti\s+muNDakopaniShadi/i.test(trimmed)) {
      accum = ''
      continue
    }

    // Section START marker — set chapter
    const mapped = MUNDAKA_MAP.find(([re]) => re.test(trimmed))
    if (mapped) {
      chapter = mapped[1]
      accum = ''
      continue
    }

    if (chapter === 0) continue // before first section

    if (/^\\[a-zA-Z]/.test(trimmed) && !trimmed.includes('||')) {
      accum = ''
      continue
    }

    const verseMatch = trimmed.match(/^([\s\S]*?)\|\|\s*(\d+)\|\|/)
    if (verseMatch) {
      const raw = accum + ' ' + verseMatch[1]
      const verse = parseInt(verseMatch[2], 10)
      const text = cleanItxText(raw)
      if (text) results.push({ chapter, verse, text })
      accum = ''
    } else {
      accum += ' ' + trimmed
    }
  }
  return results
}

// Taittiriya Upanishad: 3 vallis, each anuvAka is one verse unit
// Chapter = valli number (1-3); verse = anuvAka number within valli
// Anuvaka end: iti N.anuvAkaH  or  ityN.anuvAkaH
// Valli boundary: \section{...vallI}
export function parseItxTaittiriya(fullText: string): ParsedVerse[] {
  const body = stripItxPreamble(fullText)
  const results: ParsedVerse[] = []
  let chapter = 0
  let anuvakaNum = 0
  let accum = ''

  const VALLI_SECTION = /\\section\{[^}]*(shIkShAvallI|brahmAnandavallI|bhR[^}]*vallI)/i
  const ANUVAKA_END = /anuvAkaH/i  // any line containing this keyword ends an anuvaka
  const VALLI_COMPLETE = /vallI\s+samAptA/i

  for (const line of body.split('\n')) {
    const trimmed = line.trim()

    // Valli section header — advance chapter, reset anuvaka count
    if (VALLI_SECTION.test(trimmed)) {
      chapter++
      anuvakaNum = 0
      accum = ''
      continue
    }

    // Valli completion marker — flush
    if (VALLI_COMPLETE.test(trimmed)) {
      accum = ''
      continue
    }

    // Anuvaka end marker — emit accumulated text as one verse
    if (ANUVAKA_END.test(trimmed)) {
      anuvakaNum++
      // Remove the anuvaka marker itself from the line before appending
      const textPart = trimmed.replace(ANUVAKA_END, '').trim()
      const raw = accum + ' ' + textPart
      const text = cleanItxText(raw)
      if (chapter > 0 && text) results.push({ chapter, verse: anuvakaNum, text })
      accum = ''
      continue
    }

    accum += ' ' + trimmed
  }
  return results
}
