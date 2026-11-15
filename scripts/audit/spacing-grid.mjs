// Reports margin / padding / gap values in app/globals.css that are off the 4px grid
// (docs/DESIGN.md: spacing is a multiple of 4px; 2px only for nudges). The book's typeset
// pages (book, leaf, share-card, todays-verse rules) are exempt. Exits 1 if any are found.
//
//   node scripts/audit/spacing-grid.mjs [path/to.css]

import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? 'app/globals.css'
const css = readFileSync(file, 'utf8')
const SKIP = /book|leaf|share-card|todays-verse/
const PROP = /(?<![\w-])((?:margin|padding)(?:-[a-z-]+)?|gap|row-gap|column-gap)\s*:\s*([^;{}]+);/g
const NUM = /(?<![\w.#-])(-?\d*\.?\d+)(rem|px)\b/g
const off = []

for (const block of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const selector = block[1].trim().split('\n').pop().trim()
  if (SKIP.test(selector) || /^(from|to|\d+%)/.test(selector)) continue
  for (const decl of block[2].matchAll(PROP)) {
    for (const n of decl[2].matchAll(NUM)) {
      const px = Math.abs(Number(n[1]) * (n[2] === 'rem' ? 16 : 1))
      if (px < 1.5 || px === 2 || px % 4 === 0) continue
      off.push(`${selector} { ${decl[1]}: ${decl[2].trim()} }  ← ${n[0]} = ${+px.toFixed(2)}px`)
    }
  }
}

if (off.length) {
  console.log(`${off.length} spacing value(s) off the 4px grid in ${file}:`)
  for (const o of off) console.log(`  ${o}`)
  process.exit(1)
}
console.log(`All spacing in ${file} is on the 4px grid.`)
