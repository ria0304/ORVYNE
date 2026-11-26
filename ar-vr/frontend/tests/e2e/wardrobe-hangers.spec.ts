import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

/**
 * Every garment stored in the user's WYA wardrobe hangs in their 3D wardrobe.
 * Needs live WYA (9002), BATISSE (9001), the gateway (8001) and the frontend (5173).
 */
const GATEWAY = process.env.E2E_GATEWAY ?? 'http://127.0.0.1:8001'
const WYA = process.env.E2E_WYA ?? 'http://127.0.0.1:9002'
const PLAN = fileURLToPath(new URL('./fixtures/plan.png', import.meta.url))
const email = `wardrobe-${Date.now()}@example.com`
const password = 'correct-horse-1'

const GARMENTS = [
  { name: 'White Tee', category: 'Tops', color: 'White', fabric: 'cotton' },
  { name: 'Blue Jeans', category: 'Bottoms', color: 'Blue', fabric: 'denim' },
  { name: 'Black Blazer', category: 'Outerwear', color: 'Black', fabric: 'wool' },
  { name: 'Red Dress', category: 'Dresses', color: 'Red', fabric: 'silk' },
  { name: 'White Sneakers', category: 'Shoes', color: 'White', fabric: 'leather' },
  { name: 'Tan Tote', category: 'Bags', color: 'Tan', fabric: 'leather' },
]

test.describe.configure({ mode: 'serial' })

let page: Page
let token = ''
const pageErrors: string[] = []

test.beforeAll(async ({ browser, request }) => {
  // One ORVYNE account; the gateway links WYA with the same credentials.
  const reg = await request.post(`${GATEWAY}/api/auth/register`, { data: { email, password, full_name: 'Wardrobe Tester' } })
  expect(reg.status()).toBe(201)
  expect((await reg.json()).services.wya).toBe('linked')
  token = (await reg.json()).access_token

  // The user's garments live in WYA (same login).
  const wya = await (await request.post(`${WYA}/api/auth/login`, { data: { email, password } })).json()
  for (const g of GARMENTS) {
    const r = await request.post(`${WYA}/api/wardrobe`, { headers: { Authorization: `Bearer ${wya.access_token}` }, form: g })
    expect(r.ok()).toBe(true)
  }

  page = await browser.newPage()
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.addInitScript((t: string) => localStorage.setItem('orvyne_token', t), token)
})
test.afterAll(async () => {
  await page.close()
})

test('home from a floor plan, then every WYA garment is in the wardrobe', async () => {
  await page.goto('/batisse')
  await expect(page.getByText('No floor plan yet')).toBeVisible()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Upload Floor Plan/ }).click()])
  await chooser.setFiles(PLAN)
  const scale = page.getByRole('group', { name: 'Set plan scale' })
  await expect(scale).toBeVisible({ timeout: 30000 })
  await scale.getByLabel(/longest wall/).fill('10')
  await scale.getByRole('button', { name: 'Set scale' }).click()
  await expect(page.getByText('Home generated from your floor plan')).toBeVisible({ timeout: 30000 })

  const panel = page.getByRole('region', { name: 'Wardrobe' })
  await expect(panel).toContainText('Wardrobe: 6 items (4 hanging, 2 on the shelf)')
  for (const g of GARMENTS) await expect(panel.getByRole('button', { name: g.name })).toBeVisible()
  await page.screenshot({ path: 'test-results/wardrobe-orbit.png' })
})

test('walk up to the wardrobe and look at it', async () => {
  await page.getByRole('button', { name: 'Walk inside' }).click()
  await page.locator('canvas').first().hover()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/wardrobe-walk.png' })
})

test('picking a hanger shows the garment and its fabric from WYA', async () => {
  const panel = page.getByRole('region', { name: 'Wardrobe' })
  await panel.getByRole('button', { name: 'Blue Jeans' }).click()
  const card = page.getByRole('region', { name: 'Selected garment' })
  await expect(card).toContainText('Blue Jeans')
  await expect(card).toContainText('denim')
  await page.screenshot({ path: 'test-results/wardrobe-selected.png' })
  await card.getByRole('button', { name: 'Put back' }).click()
  await expect(card).toHaveCount(0)
})

test('wardrobe survives a reload and follows the room the user assigns', async () => {
  await page.goto('/batisse')
  await expect(page.getByRole('region', { name: 'Wardrobe' })).toContainText('6 items')
  // No upload needed again: the home is the user's saved BATISSE project.
  await expect(page.getByText('Home generated from your floor plan')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Living' }).click()
  await page.getByRole('button', { name: /Use the selected room as my wardrobe room/ }).click()
  await expect.poll(async () => {
    const r = await page.request.get(`${GATEWAY}/api/integrate/room-assignments`, { headers: { Authorization: `Bearer ${token}` } })
    return Object.values((await r.json()).assignments)
  }).toContain('wardrobe')
  await page.screenshot({ path: 'test-results/wardrobe-living.png' })
})

test('no uncaught page errors', async () => {
  expect(pageErrors).toEqual([])
})
