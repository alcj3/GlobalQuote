import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const DEMO_INPUT = 'I sell hoodies from Vietnam, each costs $2 to make, shipping is $300 for 1000 units, I want to sell to Target'

test.describe('Demo scenario — hoodie from Vietnam to Target', () => {
  test('full pipeline produces consistent pricing with non-zero margins and buyer insights', async ({ page }) => {
    // Step 14: navigate and find the textarea
    await page.goto('/')
    const textarea = page.getByRole('textbox')
    await expect(textarea).toBeVisible()

    // Step 15: type the demo input and submit
    await textarea.fill(DEMO_INPUT)
    await page.getByRole('button', { name: 'Get Pricing' }).click()

    // Wait for all three loading phases to complete (button returns to "Get Pricing")
    await expect(page.getByRole('button', { name: 'Get Pricing' })).toBeVisible({ timeout: 120_000 })

    // Wait for the results section to appear
    await expect(page.getByRole('region', { name: 'Pricing Analysis' })).toBeVisible({ timeout: 5000 })

    // Step 16: shipping per unit is not $0.00
    const shippingRow = page.locator('dt', { hasText: 'Shipping' }).locator('..').locator('dd')
    const shippingText = await shippingRow.first().innerText()
    expect(shippingText).not.toBe('$0')
    expect(shippingText).not.toBe('$0.00')

    // Step 17: landed cost total is greater than $2.00
    const landedCostRow = page.locator('dt', { hasText: 'Total Landed Cost' }).locator('..').locator('dd')
    const landedCostText = await landedCostRow.innerText()
    const landedCost = parseFloat(landedCostText.replace('$', ''))
    expect(landedCost).toBeGreaterThan(2)

    // Step 18: wholesale price is strictly between landed cost and MSRP
    const msrpRow = page.locator('dt', { hasText: 'Suggested Retail Price (MSRP)' }).locator('..').locator('dd')
    const msrpText = await msrpRow.innerText()
    const msrp = parseFloat(msrpText.replace('$', ''))

    const wholesaleRow = page.locator('dt', { hasText: 'Suggested Wholesale Price' }).locator('..').locator('dd')
    const wholesaleText = await wholesaleRow.innerText()
    const wholesale = parseFloat(wholesaleText.replace('$', ''))

    expect(wholesale).toBeGreaterThan(landedCost)
    expect(wholesale).toBeLessThan(msrp)

    // Step 19: supplier_margin is non-zero
    const supplierMarginRow = page.locator('dt', { hasText: 'Supplier Margin' }).locator('..').locator('dd')
    const supplierMarginText = await supplierMarginRow.innerText()
    const supplierMargin = parseFloat(supplierMarginText.replace('%', ''))
    expect(supplierMargin).toBeGreaterThan(0)

    // Step 20: retail_margin is non-zero
    const retailMarginRow = page.locator('dt', { hasText: 'Estimated Retail Margin' }).locator('..').locator('dd')
    const retailMarginText = await retailMarginRow.innerText()
    const retailMargin = parseFloat(retailMarginText.replace('%', ''))
    expect(retailMargin).toBeGreaterThan(0)

    // Step 21: Buyer Intelligence section is present
    await expect(page.getByRole('heading', { name: 'Buyer Intelligence' })).toBeVisible()

    // Step 22: take screenshot
    const screenshotDir = path.join(process.cwd(), 'tests', 'screenshots')
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true })
    }
    await page.screenshot({
      path: path.join(screenshotDir, 'demo-output.png'),
      fullPage: true,
    })
  })
})
