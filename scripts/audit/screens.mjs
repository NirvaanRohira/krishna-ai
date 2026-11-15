// Screenshots of the public screens at phone and desktop width, light and dark, for UI
// audits (UnSlop) and before/after comparisons. Works against a local server or the live site.
//
//   node scripts/audit/screens.mjs [baseUrl=http://localhost:3000] [outDir=audit-screens]
//
// Then compare two runs: node scripts/audit/screens.mjs <url> before; …change…;
// node scripts/audit/screens.mjs <url> after; and diff the PNGs (see docs/audits/).

import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const out = process.argv[3] ?? 'audit-screens'
const PAGES = ['/', '/pricing', '/login', '/verse']
const SIZES = [['phone', 390, 844], ['desktop', 1440, 900]]
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
for (const [size, width, height] of SIZES) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height } })
    // The app reads the saved theme before first paint (see THEME_SCRIPT in app/layout.tsx).
    await ctx.addInitScript((t) => { try { localStorage.setItem('kanha.theme', t) } catch {} }, theme)
    const page = await ctx.newPage()
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(1800) // entrance animations settle
      const slug = path === '/' ? 'home' : path.slice(1)
      await page.screenshot({ path: `${out}/${size}-${theme}-${slug}.png`, fullPage: true })
      console.log(`${size}-${theme}-${slug}.png`)
    }
    await ctx.close()
  }
}
await browser.close()
