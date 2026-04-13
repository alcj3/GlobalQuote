import { test, expect } from '@playwright/test'

test('landing page loads at /landing/ with title, headline, and CTA', async ({ page }) => {
  await page.goto('http://localhost:5173/landing/')
  await expect(page).toHaveTitle(/GlobalQuote/)
  await expect(page.getByText(/know your landed cost/i)).toBeVisible()
  const cta = page.getByRole('link', { name: /request early access/i })
  await expect(cta).toBeVisible()
  const href = await cta.getAttribute('href')
  expect(href).toMatch(/^mailto:/)
})

test('CTA mailto href includes email address and subject param', async ({ page }) => {
  await page.goto('http://localhost:5173/landing/')
  const cta = page.getByRole('link', { name: /request early access/i })
  const href = await cta.getAttribute('href')
  expect(href).toContain('lopez115@uw.edu')
  expect(href).toContain('zxu52@uw.edu')
  expect(href).toContain('subject=')
})

test('React app is unaffected and still loads at /', async ({ page }) => {
  await page.goto('http://localhost:5173/')
  await expect(page.getByRole('button', { name: /get pricing/i })).toBeVisible()
})
