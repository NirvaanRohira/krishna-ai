import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function a11y(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)).toEqual([])
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test('landing: promise, AI disclosure, path to sign-in, accessible, fits a phone', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /Kanha/ })).toBeVisible()
  await expect(page.getByText(/not God, not Krishna/)).toBeVisible()
  // The button goes to /chat, so signed-in people land straight in a conversation; the proxy
  // sends everyone else to sign in.
  const cta = page.getByRole('link', { name: /Begin a conversation/ })
  await expect(cta).toHaveAttribute('href', '/chat')
  await expect(page.getByRole('img', { name: /depiction of Krishna/ })).toBeVisible()
  await noHorizontalScroll(page)
  await a11y(page)
  await cta.click()
  await expect(page).toHaveURL(/\/login/)
})

for (const path of ['/login', '/privacy', '/terms', '/onboarding']) {
  test(`${path} is accessible and fits the screen`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    await noHorizontalScroll(page)
    await a11y(page)
  })
}

test('onboarding cannot continue until the three required boxes are ticked', async ({ page }) => {
  await page.goto('/onboarding')
  const go = page.getByRole('button', { name: /begin/i })
  await expect(go).toBeDisabled()
  await page.getByLabel(/18 years/).check()
  await page.getByLabel(/agree to the/).check()
  await expect(go).toBeDisabled()
  await page.getByLabel(/not God or Krishna/).check()
  await expect(go).toBeEnabled()
  await expect(page.getByLabel(/occasional updates/)).not.toBeChecked() // marketing is opt-in
})

test('signed-out visitors are sent to sign in from protected pages', async ({ page }) => {
  for (const path of ['/chat', '/account']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('security headers are set', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['strict-transport-security']).toContain('max-age=')
  expect(h['permissions-policy']).toContain('camera=()')
  expect(h['x-powered-by']).toBeUndefined()
})

test('APIs: health is up, cross-site writes are refused, unauthenticated calls are rejected', async ({ request }) => {
  expect((await request.get('/api/health')).status()).toBe(200)
  const cross = await request.post('/api/chat', { headers: { origin: 'https://evil.example' }, data: { message: 'hi' } })
  expect(cross.status()).toBe(403)
  const anon = await request.post('/api/chat', { data: { message: 'hi' } })
  expect([401, 403]).toContain(anon.status())
  expect((await request.post('/api/cron?task=spend')).status()).toBe(401)
})

test('dev-only avatar harness is not served in production', async ({ request }) => {
  expect((await request.get('/avatar-preview')).status()).toBe(404)
})
