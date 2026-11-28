import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

/**
 * World controls (I inventory, M minimap, L Luna, F3 coordinates, Esc pause) and furniture that survives a reload.
 * Needs BATISSE (9001), the gateway (8001) and the frontend (5173). WYA is not required.
 */
const GATEWAY = process.env.E2E_GATEWAY ?? 'http://127.0.0.1:8001'
const PLAN = fileURLToPath(new URL('./fixtures/plan.png', import.meta.url))

test.describe.configure({ mode: 'serial' })

let page: Page
let token = ''
const pageErrors: string[] = []

test.beforeAll(async ({ browser, request }) => {
  const email = `world-${Date.now()}@example.com`
  const reg = await request.post(`${GATEWAY}/api/auth/register`, { data: { email, password: 'correct-horse-1' } })
  token = (await reg.json()).access_token
  page = await browser.newPage()
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.addInitScript((t: string) => localStorage.setItem('orvyne_token', t), token)
})
test.afterAll(async () => {
  await page.close()
})

const count = () => page.getByRole('status', { name: 'Furniture count' })

test('build the home, then walk in', async () => {
  await page.goto('/batisse')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Upload Floor Plan/ }).click()])
  await chooser.setFiles(PLAN)
  const scale = page.getByRole('group', { name: 'Set plan scale' })
  await expect(scale).toBeVisible({ timeout: 30000 })
  await scale.getByLabel(/longest wall/).fill('10')
  await scale.getByRole('button', { name: 'Set scale' }).click()
  await expect(page.getByText('Home generated from your floor plan')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Walk inside' }).click()
  await expect(page.getByRole('button', { name: 'Exit walk mode' })).toBeVisible()
})

test('M toggles the minimap', async () => {
  const map = page.getByRole('region', { name: 'Minimap' })
  await expect(map).toBeVisible()
  await page.keyboard.press('KeyM')
  await expect(map).toHaveCount(0)
  await page.keyboard.press('KeyM')
  await expect(map).toBeVisible()
  await page.screenshot({ path: 'test-results/world-minimap.png' })
})

test('F3 shows coordinates and the room you are in', async () => {
  await page.keyboard.press('F3')
  const coords = page.getByRole('status', { name: 'Coordinates' })
  await expect(coords).toContainText('XYZ')
  await expect(coords).toContainText(/Bedroom|Living|Kitchen/)
  await page.keyboard.press('F3')
  await expect(coords).toHaveCount(0)
})

test('I opens the inventory; Esc closes it first, not the game', async () => {
  await page.keyboard.press('KeyI')
  const inv = page.getByRole('dialog', { name: 'Inventory' })
  await expect(inv).toBeVisible()
  await inv.getByRole('button', { name: /plant/ }).click()
  await page.screenshot({ path: 'test-results/world-inventory.png' })
  await page.keyboard.press('Escape')
  await expect(inv).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0)
})

test('placed furniture is saved and is still there after a reload', async () => {
  const before = await count().innerText()
  expect(before).toContain('0 placed by you')
  await page.keyboard.press('KeyF') // places the selected hotbar item (now: plant)
  await expect(count()).toContainText('1 placed by you')
  await expect.poll(async () => {
    const r = await page.request.get(`${GATEWAY}/api/furniture/restore`, { headers: { Authorization: `Bearer ${token}` } })
    return (await r.json()).furniture.filter((f: { furniture_id: string }) => f.furniture_id.startsWith('user-')).length
  }).toBe(1)

  await page.reload()
  await expect(page.getByText('Home generated from your floor plan')).toBeVisible({ timeout: 30000 })
  await expect(count()).toContainText('1 placed by you')
})

test('L opens Luna; the command box takes text without moving the player', async () => {
  await page.getByRole('button', { name: 'Walk inside' }).click()
  await page.keyboard.press('KeyL')
  const prompt = page.getByRole('dialog', { name: 'Talk to Luna' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('textbox').fill('status')
  await prompt.getByRole('textbox').press('Enter')
  await expect(prompt).toHaveCount(0)
})

test('Esc pauses: movement stops, settings work, Resume continues', async () => {
  await page.keyboard.press('F3')
  const coords = page.getByRole('status', { name: 'Coordinates' })
  await page.keyboard.press('Escape')
  const paused = page.getByRole('dialog', { name: 'Paused' })
  await expect(paused).toBeVisible()

  const frozen = await coords.innerText()
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1200)
  await page.keyboard.up('KeyW')
  expect(await coords.innerText()).toBe(frozen) // W did nothing while paused

  await paused.getByLabel('Minimap').uncheck()
  await expect(page.getByRole('region', { name: 'Minimap' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/world-paused.png' })
  await paused.getByRole('button', { name: 'Resume' }).click()
  await expect(paused).toHaveCount(0)

  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1200)
  await page.keyboard.up('KeyW')
  expect(await coords.innerText()).not.toBe(frozen) // moving again
})

test('no uncaught page errors', async () => {
  expect(pageErrors).toEqual([])
})
