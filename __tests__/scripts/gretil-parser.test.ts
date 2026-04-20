import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseGitaHtml, type ParsedVerse } from '../../scripts/lib/gretil-parser'

const FIXTURE = `
dhṛtarāṣṭra uvāca  Bhg_01.001 [=MBh_06,023.001]<BR>
dharmakṣetre kurukṣetre samavetā yuyutsavaḥ  Bhg_01.001a [=MBh_06,023.001a]<BR>
māmakāḥ pāṇḍavāś caiva kim akurvata saṃjaya  Bhg_01.001c [=MBh_06,023.001c]<BR>

saṃjaya uvāca  Bhg_01.002 [=MBh_06,023.002]<BR>
dṛṣṭvā tu pāṇḍavānīkaṃ vyūḍhaṃ duryodhanas tadā  Bhg_01.002a [=MBh_06,023.002a]<BR>
ācāryam upasaṃgamya rājā vacanam abravīt  Bhg_01.002c [=MBh_06,023.002c]<BR>

paśyaitāṃ pāṇḍuputrāṇām ācārya mahatīṃ camūm  Bhg_01.003a [=MBh_06,023.003a]<BR>
vyūḍhāṃ drupadaputreṇa tava śiṣyeṇa dhīmatā  Bhg_01.003c [=MBh_06,023.003c]<BR>
`

describe('parseGitaHtml', () => {
  test('returns one object per unique chapter-verse pair', () => {
    const verses = parseGitaHtml(FIXTURE)
    expect(verses).toHaveLength(3)
  })

  test('extracts chapter number as an integer', () => {
    const [v] = parseGitaHtml(FIXTURE)
    expect(v.chapter).toBe(1)
  })

  test('extracts verse number as an integer', () => {
    const [, v2] = parseGitaHtml(FIXTURE)
    expect(v2.verse).toBe(2)
  })

  test('combines a-pada and c-pada into a single text string', () => {
    const [v] = parseGitaHtml(FIXTURE)
    expect(v.text).toContain('dharmakṣetre kurukṣetre samavetā yuyutsavaḥ')
    expect(v.text).toContain('māmakāḥ pāṇḍavāś caiva kim akurvata saṃjaya')
  })

  test('omits speaker-label lines from verse text', () => {
    const [v] = parseGitaHtml(FIXTURE)
    expect(v.text).not.toContain('dhṛtarāṣṭra uvāca')
  })

  test('results are ordered by chapter then verse', () => {
    const verses = parseGitaHtml(FIXTURE)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(3)
  })

  test('parses all 700 verses from the real GRETIL file', () => {
    const html = readFileSync(
      join(__dirname, '../../scripts/data/raw/bhagavad_gita_gretil.htm'),
      'utf-8'
    )
    const verses = parseGitaHtml(html)
    expect(verses).toHaveLength(700)
  })

  test('chapter 18 last verse number is 78', () => {
    const html = readFileSync(
      join(__dirname, '../../scripts/data/raw/bhagavad_gita_gretil.htm'),
      'utf-8'
    )
    const verses = parseGitaHtml(html)
    const ch18 = verses.filter((v) => v.chapter === 18)
    expect(ch18[ch18.length - 1].verse).toBe(78)
  })
})
